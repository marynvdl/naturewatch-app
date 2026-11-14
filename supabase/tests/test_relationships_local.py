"""Link review and set_place_relationship(), against the local database.

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

SQUARE = "MULTIPOLYGON((({x} -20, {x2} -20, {x2} -19.8, {x} -19.8, {x} -20)))"


class RelationshipsLocalTest(unittest.TestCase):
    def setUp(self):
        import psycopg

        self.errors = psycopg.errors
        self.conn = connect()
        self.release = self.conn.execute(
            "select id from public.source_releases where source_id = 'wdpca'"
        ).fetchone()["id"]
        self.park, self.park_boundary = self.place("Zqx Park", "conservation_area", 30)
        self.other_park, _ = self.place("Zqx Other Park", "conservation_area", 30.1)
        self.site, self.site_boundary = self.place("Zqx Site", "world_heritage_site", 30)
        self.admin = self.user()
        self.conn.execute(
            "insert into public.user_roles (user_id, role) values (%s, 'admin')", (self.admin,)
        )

    def tearDown(self):
        self.conn.rollback()
        self.conn.close()

    def place(self, name: str, place_type: str, x: float) -> tuple[str, str]:
        place_id = self.conn.execute(
            "insert into public.places (name, place_type_id, publication_status) "
            "values (%s, %s, 'published') returning id::text as id",
            (name, place_type),
        ).fetchone()["id"]
        boundary_id = self.conn.execute(
            """
            insert into public.place_boundaries (
              place_id, version_number, geom, source_id, source_release_id,
              review_status, is_current
            ) values (%s, 1,
              extensions.ST_GeomFromText(%s, 4326)::extensions.geometry(MultiPolygon, 4326),
              'wdpca', %s, 'approved', true)
            returning id::text as id
            """,
            (place_id, SQUARE.format(x=x, x2=x + 0.2), self.release),
        ).fetchone()["id"]
        return place_id, boundary_id

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

    def derived(self, status: str = "proposed") -> str:
        return self.conn.execute(
            """
            insert into public.place_relationships (
              subject_place_id, relationship_type_id, object_place_id, origin, status,
              subject_boundary_id, object_boundary_id, subject_coverage, object_coverage
            ) values (%s, 'recognises', %s, 'derived', %s, %s, %s, 1, 0.6)
            returning id::text as id
            """,
            (self.site, self.park, status, self.site_boundary, self.park_boundary),
        ).fetchone()["id"]

    def link(self, subject, type_id, object_, status, user_id: str | None = None):
        self.act_as(user_id or self.admin)
        row = self.conn.execute(
            """
            select id::text as id, subject_place_id::text as subject,
                   object_place_id::text as object, origin, status,
                   retired_at is not null as retired,
                   created_by::text as created_by, reviewed_by::text as reviewed_by
            from public.set_place_relationship(%s, %s, %s, %s)
            """,
            (subject, type_id, object_, status),
        ).fetchone()
        self.conn.execute("reset role")
        return row

    def raises(self, error, *args, user_id: str | None = None):
        self.conn.execute("savepoint s")
        with self.assertRaises(error):
            self.link(*args, user_id=user_id)
        self.conn.execute("rollback to savepoint s")
        self.conn.execute("reset role")

    def visible(self, user_id: str | None) -> int:
        self.act_as(user_id)
        n = self.conn.execute(
            "select count(*) as n from public.place_relationships where object_place_id = %s",
            (self.park,),
        ).fetchone()["n"]
        self.conn.execute("reset role")
        return n

    def test_only_an_admin_changes_or_reads_proposed_links(self):
        self.derived()
        args = (self.site, "recognises", self.park, "confirmed")
        self.raises(self.errors.InsufficientPrivilege, *args, user_id=self.user())
        self.conn.execute("savepoint s")
        self.act_as(None)
        with self.assertRaises(self.errors.InsufficientPrivilege):
            self.conn.execute(
                "select public.set_place_relationship(%s, 'recognises', %s, 'confirmed')",
                (self.site, self.park),
            )
        self.conn.execute("rollback to savepoint s")
        self.assertEqual(self.visible(None), 0)
        self.assertEqual(self.visible(self.user()), 0)
        self.assertEqual(self.visible(self.admin), 1)

    def test_an_added_link_is_manual_and_confirmed(self):
        row = self.link(self.site, "recognises", self.park, "confirmed")
        self.assertEqual(
            {k: row[k] for k in ("subject", "object", "origin", "status", "created_by", "reviewed_by")},
            {
                "subject": self.site,
                "object": self.park,
                "origin": "manual",
                "status": "confirmed",
                "created_by": self.admin,
                "reviewed_by": self.admin,
            },
        )
        self.assertEqual(self.visible(None), 1)

    def test_reviewing_a_derived_link_sets_reviewed_by(self):
        link_id = self.derived()
        for status in ("confirmed", "rejected", "confirmed"):
            row = self.link(self.site, "recognises", self.park, status)
            self.assertEqual((row["id"], row["status"]), (link_id, status))
            self.assertEqual(row["origin"], "derived")
            self.assertEqual(row["reviewed_by"], self.admin)
            self.assertIsNone(row["created_by"])
        row = self.link(self.site, "recognises", self.park, "retired")
        self.assertTrue(row["retired"])
        self.assertEqual(self.visible(None), 0)

    def test_a_symmetric_link_is_stored_once(self):
        first = self.link(self.park, "overlaps", self.other_park, "confirmed")
        second = self.link(self.other_park, "overlaps", self.park, "rejected")
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(second["status"], "rejected")
        self.assertLess(first["subject"], first["object"])

    def test_bad_links_raise(self):
        self.link(self.site, "recognises", self.park, "confirmed")
        self.raises(self.errors.CheckViolation, self.park, "recognises", self.site, "confirmed")
        self.raises(self.errors.NoDataFound, self.park, "located_in", self.site, "rejected")
        self.raises(self.errors.NoDataFound, self.park, "located_in", self.site, "retired")
        self.raises(self.errors.InvalidParameterValue, self.park, "contains", self.site, "confirmed")
        self.raises(self.errors.InvalidParameterValue, self.park, "located_in", self.site, "done")
        self.raises(self.errors.InvalidParameterValue, self.park, "located_in", self.park, "confirmed")
        self.raises(
            self.errors.NoDataFound, self.park, "located_in", str(uuid.uuid4()), "confirmed"
        )

    def test_retiring_and_adding_again_gives_a_new_row(self):
        first = self.link(self.site, "recognises", self.park, "confirmed")
        self.link(self.site, "recognises", self.park, "retired")
        second = self.link(self.site, "recognises", self.park, "confirmed")
        self.assertNotEqual(first["id"], second["id"])
        rows = self.conn.execute(
            "select count(*) as n from public.place_relationships where object_place_id = %s",
            (self.park,),
        ).fetchone()["n"]
        self.assertEqual(rows, 2)

    def test_each_call_is_audited_with_the_actor(self):
        link_id = self.derived()
        self.link(self.site, "recognises", self.park, "confirmed")
        self.link(self.site, "recognises", self.park, "retired")
        rows = self.conn.execute(
            """
            select action, actor::text as actor
            from public.audit_log
            where table_name = 'place_relationships' and row_id = %s
            order by id
            """,
            (link_id,),
        ).fetchall()
        self.assertEqual(
            rows,
            [
                {"action": "insert", "actor": None},
                {"action": "update", "actor": self.admin},
                {"action": "update", "actor": self.admin},
            ],
        )


if __name__ == "__main__":
    unittest.main()
