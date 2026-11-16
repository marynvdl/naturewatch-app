"""Withdrawing and flagging places, and lists of several types, against the local database.

Each test runs in one transaction that is rolled back. Skipped when the local
database is not running.
"""

from __future__ import annotations

import importlib.util
import json
import unittest
import uuid
from pathlib import Path

_local = importlib.util.spec_from_file_location(
    "test_reconcile_local", Path(__file__).parent / "test_reconcile_local.py"
)
test_reconcile_local = importlib.util.module_from_spec(_local)
_local.loader.exec_module(test_reconcile_local)
connect = test_reconcile_local.connect

# A terrestrial park of about 470 km², so listed_places lists it.
PARK = "MULTIPOLYGON(((30 -20, 30.2 -20, 30.2 -19.8, 30 -19.8, 30 -20)))"


class PlaceCleanupLocalTest(unittest.TestCase):
    def setUp(self):
        import psycopg

        self.errors = psycopg.errors
        self.conn = connect()
        self.release = self.conn.execute(
            "select id from public.source_releases where source_id = 'wdpca'"
        ).fetchone()["id"]
        self.place_id = self.place("Zqx Cleanup Park", "conservation_area")
        self.site_id = self.place("Zqx Cleanup Heritage", "world_heritage_site")
        self.admin = self.user()
        self.conn.execute(
            "insert into public.user_roles (user_id, role) values (%s, 'admin')", (self.admin,)
        )

    def tearDown(self):
        self.conn.rollback()
        self.conn.close()

    def place(self, name: str, type_id: str) -> str:
        place_id = self.conn.execute(
            "insert into public.places (name, place_type_id, publication_status) "
            "values (%s, %s, 'published') returning id::text as id",
            (name, type_id),
        ).fetchone()["id"]
        self.conn.execute(
            """
            insert into public.place_boundaries (
              place_id, version_number, geom, source_id, source_release_id,
              review_status, is_current
            ) values (%s, 1,
              extensions.ST_GeomFromText(%s, 4326)::extensions.geometry(MultiPolygon, 4326),
              'wdpca', %s, 'approved', true)
            """,
            (place_id, PARK, self.release),
        )
        table = (
            "conservation_area_details" if type_id == "conservation_area" else "recognition_details"
        )
        self.conn.execute(
            f"""
            insert into public.{table} (
              place_id, designation, iso3, realm, source_id, source_release_id
            ) values (%s, 'Zqx', array['ZWE'], 'Terrestrial', 'wdpca', %s)
            """,
            (place_id, self.release),
        )
        return place_id

    def user(self) -> str:
        user_id = str(uuid.uuid4())
        self.conn.execute(
            """
            insert into auth.users (id, aud, role, email)
            values (%s, 'authenticated', 'authenticated', %s)
            """,
            (user_id, f"{user_id}@example.test"),
        )
        return user_id

    def act_as(self, user_id: str | None):
        """Switch to the role PostgREST would use, with that user's JWT claims."""
        self.conn.execute("reset role")
        if user_id is None:
            self.conn.execute("select set_config('request.jwt.claims', '', true)")
            self.conn.execute("set local role anon")
            return
        claims = json.dumps({"sub": user_id, "role": "authenticated"})
        self.conn.execute("select set_config('request.jwt.claims', %s, true)", (claims,))
        self.conn.execute("set local role authenticated")

    def run_as(self, user_id: str | None, sql: str, params=()):
        self.act_as(user_id)
        rows = self.conn.execute(sql, params).fetchall()
        self.conn.execute("reset role")
        return rows

    def raises(self, error, user_id: str | None, sql: str, params=()):
        self.conn.execute("savepoint s")
        with self.assertRaises(error):
            self.run_as(user_id, sql, params)
        self.conn.execute("rollback to savepoint s")
        self.conn.execute("reset role")

    def withdraw(self, reason="captured_by_other_places", note=None):
        return self.run_as(
            self.admin,
            "select public.set_place_publication(%s, 'withdrawn', %s, %s)",
            (self.place_id, reason, note),
        )

    def test_only_an_admin_withdraws_or_flags(self):
        sql_withdraw = "select public.set_place_publication(%s, 'withdrawn', 'other', null)"
        sql_flag = "select public.set_place_attention(%s, 'other', null)"
        self.raises(self.errors.InsufficientPrivilege, self.user(), sql_withdraw, (self.place_id,))
        self.raises(self.errors.InsufficientPrivilege, self.user(), sql_flag, (self.place_id,))
        self.raises(self.errors.InsufficientPrivilege, None, sql_withdraw, (self.place_id,))
        self.raises(
            self.errors.InsufficientPrivilege,
            self.user(),
            "select * from public.admin_place_list('withdrawn', 20, 0)",
        )

    def test_withdrawing_needs_a_known_reason(self):
        sql = "select public.set_place_publication(%s, 'withdrawn', %s, null)"
        self.raises(self.errors.InvalidParameterValue, self.admin, sql, (self.place_id, None))
        self.raises(self.errors.CheckViolation, self.admin, sql, (self.place_id, "bored"))

    def test_a_withdrawn_place_leaves_the_lists_but_admins_still_open_it(self):
        self.withdraw(note="  Inside the larger park.  ")
        row = self.conn.execute(
            "select publication_status, withdrawal_reason, withdrawal_note, withdrawn_by::text "
            "from public.places where id = %s",
            (self.place_id,),
        ).fetchone()
        self.assertEqual(row["publication_status"], "withdrawn")
        self.assertEqual(row["withdrawal_reason"], "captured_by_other_places")
        self.assertEqual(row["withdrawal_note"], "Inside the larger park.")
        self.assertEqual(row["withdrawn_by"], self.admin)

        listed = "select id::text from public.listed_places where id = %s"
        summary = "select id::text from public.place_summaries where id = %s"
        self.assertEqual(self.run_as(None, listed, (self.place_id,)), [])
        self.assertEqual(self.run_as(self.admin, listed, (self.place_id,)), [])
        self.assertEqual(self.run_as(None, summary, (self.place_id,)), [])
        self.assertEqual(self.run_as(self.user(), summary, (self.place_id,)), [])
        self.assertEqual(len(self.run_as(self.admin, summary, (self.place_id,))), 1)
        bounds = "select * from public.place_bounds(%s)"
        self.assertEqual(self.run_as(None, bounds, (self.place_id,)), [])
        self.assertEqual(len(self.run_as(self.admin, bounds, (self.place_id,))), 1)

    def test_anyone_reads_the_withdrawn_ids_only(self):
        self.withdraw()
        ids = self.run_as(None, "select public.withdrawn_place_ids() as ids")[0]["ids"]
        self.assertIn(uuid.UUID(self.place_id), ids)
        self.assertNotIn(uuid.UUID(self.site_id), ids)
        self.raises(
            self.errors.InsufficientPrivilege, None, "select * from public.place_attention"
        )

    def test_restoring_clears_the_reason_and_audits_both(self):
        self.withdraw()
        self.run_as(
            self.admin,
            "select public.set_place_publication(%s, 'published', null, null)",
            (self.place_id,),
        )
        row = self.conn.execute(
            "select publication_status, withdrawal_reason, withdrawn_at from public.places "
            "where id = %s",
            (self.place_id,),
        ).fetchone()
        self.assertEqual(row["publication_status"], "published")
        self.assertIsNone(row["withdrawal_reason"])
        self.assertIsNone(row["withdrawn_at"])
        audited = self.conn.execute(
            "select actor::text from public.audit_log where table_name = 'places' and row_id = %s",
            (self.place_id,),
        ).fetchall()
        self.assertEqual([r["actor"] for r in audited], [self.admin, self.admin])

    def test_a_merged_place_is_not_restored(self):
        self.conn.execute(
            "update public.places set publication_status = 'merged', merged_into_place_id = %s "
            "where id = %s",
            (self.site_id, self.place_id),
        )
        self.raises(
            self.errors.InvalidParameterValue,
            self.admin,
            "select public.set_place_publication(%s, 'published', null, null)",
            (self.place_id,),
        )

    def test_a_flag_is_set_changed_listed_and_cleared(self):
        flag = "select * from public.set_place_attention(%s, %s, %s)"
        self.run_as(self.admin, flag, (self.place_id, "boundary_wrong", "Cuts the river."))
        self.run_as(self.admin, flag, (self.place_id, "possible_duplicate", None))
        rows = self.run_as(self.admin, "select * from public.admin_place_list('attention', 20, 0)")
        mine = [r for r in rows if r["id"] == uuid.UUID(self.place_id)]
        self.assertEqual(len(mine), 1)
        self.assertEqual(mine[0]["reason"], "possible_duplicate")
        self.assertIsNone(mine[0]["note"])
        cleared = self.run_as(self.admin, flag, (self.place_id, None, None))
        self.assertIsNone(cleared[0]["place_id"])
        self.assertEqual(
            self.conn.execute(
                "select count(*) as n from public.place_attention where place_id = %s",
                (self.place_id,),
            ).fetchone()["n"],
            0,
        )
        actions = self.conn.execute(
            "select action from public.audit_log where table_name = 'place_attention' "
            "and row_id = %s order by id",
            (self.place_id,),
        ).fetchall()
        self.assertEqual([r["action"] for r in actions], ["insert", "update", "delete"])

    def test_the_withdrawn_list_has_the_reason(self):
        self.withdraw(reason="not_a_place", note="A road reserve.")
        rows = self.run_as(self.admin, "select * from public.admin_place_list('withdrawn', 20, 0)")
        mine = [r for r in rows if r["id"] == uuid.UUID(self.place_id)][0]
        self.assertEqual(mine["reason"], "not_a_place")
        self.assertEqual(mine["note"], "A road reserve.")
        self.assertGreaterEqual(mine["total_count"], 1)

    def test_a_list_takes_several_types(self):
        rows = self.run_as(
            None,
            "select id::text, place_type_id from public.place_window("
            "array['conservation_area', 'world_heritage_site'], 'Zqx Cleanup', false, 'name')",
        )
        self.assertEqual(
            [(r["id"], r["place_type_id"]) for r in rows],
            [(self.site_id, "world_heritage_site"), (self.place_id, "conservation_area")],
        )
        one = self.run_as(
            None,
            "select id::text from public.place_window(array['world_heritage_site'], 'Zqx Cleanup')",
        )
        self.assertEqual([r["id"] for r in one], [self.site_id])
        rank = self.run_as(
            None,
            "select public.place_rank(array['conservation_area', 'world_heritage_site'], %s, "
            "'Zqx Cleanup', false, 'name') as n",
            (self.place_id,),
        )
        self.assertEqual(rank[0]["n"], 1)
        stats = self.run_as(
            None,
            "select place_count from public.place_filter_stats("
            "array['conservation_area', 'world_heritage_site'])",
        )
        self.assertGreaterEqual(stats[0]["place_count"], 2)


if __name__ == "__main__":
    unittest.main()
