"""Curated text and curate_place(), against the local database.

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


class CurationsLocalTest(unittest.TestCase):
    def setUp(self):
        import psycopg

        self.errors = psycopg.errors
        self.conn = connect()
        self.release = self.conn.execute(
            "select id from public.source_releases where source_id = 'wdpca'"
        ).fetchone()["id"]
        self.place_id = self.conn.execute(
            "insert into public.places (name, place_type_id, publication_status) "
            "values ('Zqx Source Park', 'conservation_area', 'published') returning id::text as id"
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
            (self.place_id, PARK, self.release),
        )
        self.conn.execute(
            """
            insert into public.conservation_area_details (
              place_id, designation, iso3, realm, source_id, source_release_id
            ) values (%s, 'National Park', array['ZWE'], 'Terrestrial', 'wdpca', %s)
            """,
            (self.place_id, self.release),
        )
        self.admin = self.user()
        self.conn.execute(
            "insert into public.user_roles (user_id, role) values (%s, 'admin')", (self.admin,)
        )

    def tearDown(self):
        self.conn.rollback()
        self.conn.close()

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

    def curate(self, values: dict, user_id: str | None = None):
        self.act_as(user_id or self.admin)
        row = self.conn.execute(
            "select * from public.curate_place(%s, %s::jsonb)", (self.place_id, json.dumps(values))
        ).fetchone()
        self.conn.execute("reset role")
        return row

    def summary(self) -> dict:
        self.act_as(None)
        row = self.conn.execute(
            """
            select name, designation, iso3, tagline, description,
                   source_place_name, source_designation, source_iso3
            from public.place_summaries where id = %s
            """,
            (self.place_id,),
        ).fetchone()
        self.conn.execute("reset role")
        return row

    def raises(self, error, values: dict, user_id: str | None = None):
        self.conn.execute("savepoint s")
        with self.assertRaises(error):
            self.curate(values, user_id)
        self.conn.execute("rollback to savepoint s")
        self.conn.execute("reset role")

    def test_only_an_admin_curates(self):
        self.raises(self.errors.InsufficientPrivilege, {"tagline": "x"}, self.user())
        self.conn.execute("savepoint s")
        self.act_as(None)
        with self.assertRaises(self.errors.InsufficientPrivilege):
            self.conn.execute(
                "select public.curate_place(%s, '{\"tagline\": \"x\"}')", (self.place_id,)
            )
        self.conn.execute("rollback to savepoint s")

    def test_curated_values_show_over_the_source(self):
        self.curate(
            {
                "display_name": "  Zqx Curated Park ",
                "tagline": "Where the river bends twice.",
                "description": "First paragraph.\r\n\r\nSecond paragraph.\n",
                "designation": "Game Reserve",
                "iso3": ["zwe", "MOZ", "ZWE"],
            }
        )
        self.assertEqual(
            self.summary(),
            {
                "name": "Zqx Curated Park",
                "designation": "Game Reserve",
                "iso3": "ZWE;MOZ",
                "tagline": "Where the river bends twice.",
                "description": "First paragraph.\n\nSecond paragraph.",
                "source_place_name": "Zqx Source Park",
                "source_designation": "National Park",
                "source_iso3": "ZWE",
            },
        )
        source = self.conn.execute(
            "select name from public.places where id = %s", (self.place_id,)
        ).fetchone()["name"]
        self.assertEqual(source, "Zqx Source Park")

    def test_a_blank_value_resets_and_the_last_reset_deletes_the_row(self):
        self.curate({"display_name": "Zqx Curated Park", "tagline": "A line."})
        row = self.curate({"display_name": "  "})
        self.assertIsNone(row["display_name"])
        self.assertEqual(row["tagline"], "A line.")
        self.assertEqual(self.summary()["name"], "Zqx Source Park")
        self.curate({"tagline": None})
        count = self.conn.execute(
            "select count(*) as n from public.place_curations where place_id = %s",
            (self.place_id,),
        ).fetchone()["n"]
        self.assertEqual(count, 0)

    def test_bad_values_raise(self):
        self.raises(self.errors.InvalidParameterValue, {"name": "x"})
        self.raises(self.errors.CheckViolation, {"tagline": "x" * 121})
        self.raises(self.errors.CheckViolation, {"tagline": "two\nlines"})
        self.raises(self.errors.CheckViolation, {"description": "x" * 2001})
        self.raises(self.errors.CheckViolation, {"iso3": ["ZW"]})
        self.raises(self.errors.InvalidParameterValue, {"iso3": "ZWE"})

    def test_each_call_is_audited_with_the_actor(self):
        self.curate({"tagline": "A line."})
        self.curate({"tagline": "Another line."})
        self.curate({"tagline": ""})
        rows = self.conn.execute(
            """
            select action, actor::text as actor
            from public.audit_log
            where table_name = 'place_curations' and row_id = %s
            order by id
            """,
            (self.place_id,),
        ).fetchall()
        self.assertEqual(
            rows,
            [
                {"action": "insert", "actor": self.admin},
                {"action": "update", "actor": self.admin},
                {"action": "delete", "actor": self.admin},
            ],
        )

    def test_designations_list_the_shown_values(self):
        self.conn.execute("savepoint s")
        self.act_as(None)
        with self.assertRaises(self.errors.InsufficientPrivilege):
            self.conn.execute("select * from public.place_designations()")
        self.conn.execute("rollback to savepoint s")
        self.curate({"designation": "Zqx Reserve"})
        self.act_as(self.admin)
        rows = {
            row["designation"]: row["place_count"]
            for row in self.conn.execute("select * from public.place_designations()").fetchall()
        }
        self.conn.execute("reset role")
        self.assertEqual(rows.get("Zqx Reserve"), 1)

    def test_search_finds_the_old_and_the_new_name(self):
        self.curate({"display_name": "Zqx Curated Park"})
        self.act_as(None)
        for search in ("Zqx Source", "Zqx Curated"):
            for extent in ((None,) * 4, (29, -21, 31, -19)):
                with self.subTest(search=search, extent=extent):
                    rows = self.conn.execute(
                        """
                        select id::text as id, name from public.place_window(
                          'conservation_area', %s, true, 'size-desc',
                          null, null, 0, 100, %s, %s, %s, %s
                        )
                        """,
                        (search, *extent),
                    ).fetchall()
                    self.assertEqual(rows, [{"id": self.place_id, "name": "Zqx Curated Park"}])


if __name__ == "__main__":
    unittest.main()
