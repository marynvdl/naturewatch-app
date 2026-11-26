"""Ecoregion colours for the map, against the local database.

Each test runs in one transaction that is rolled back. Skipped when the local
database is not running.
"""

from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path

_local = importlib.util.spec_from_file_location(
    "test_reconcile_local", Path(__file__).parent / "test_reconcile_local.py"
)
test_reconcile_local = importlib.util.module_from_spec(_local)
_local.loader.exec_module(test_reconcile_local)
connect = test_reconcile_local.connect

READ = "select id::text as id, colour from public.ecoregion_colours()"


class EcoregionColoursLocalTest(unittest.TestCase):
    def setUp(self):
        self.conn = connect()
        self.release = self.conn.execute(
            "select id from public.source_releases where source_id = 'resolve-ecoregions'"
        ).fetchone()["id"]

    def tearDown(self):
        self.conn.rollback()
        self.conn.close()

    def ecoregion(self, name: str, attributes: dict, status: str = "published") -> str:
        place_id = self.conn.execute(
            "insert into public.places (name, place_type_id, publication_status) "
            "values (%s, 'ecoregion', %s) returning id::text as id",
            (name, status),
        ).fetchone()["id"]
        self.conn.execute(
            """
            insert into public.ecoregion_details (
              place_id, biome, realm, source_id, source_release_id, source_attributes
            ) values (%s, 'Zqx biome', 'Afrotropic', 'resolve-ecoregions', %s, %s::jsonb)
            """,
            (place_id, self.release, json.dumps(attributes)),
        )
        return place_id

    def colours_as_anon(self) -> dict[str, str]:
        self.conn.execute("select set_config('request.jwt.claims', '', true)")
        self.conn.execute("set local role anon")
        rows = self.conn.execute(READ).fetchall()
        self.conn.execute("reset role")
        return {row["id"]: row["colour"] for row in rows}

    def test_anyone_reads_the_colour_of_each_published_ecoregion(self):
        published = self.ecoregion("Zqx Woodlands", {"COLOR": "#A87001", "COLOR_BIO": "#FFFFFF"})
        draft = self.ecoregion("Zqx Draft", {"COLOR": "#123456"}, status="draft")
        colours = self.colours_as_anon()
        self.assertEqual(colours[published], "#A87001")
        self.assertNotIn(draft, colours)

    def test_a_missing_or_malformed_colour_is_left_out(self):
        missing = self.ecoregion("Zqx Missing", {})
        malformed = self.ecoregion("Zqx Malformed", {"COLOR": "red"})
        colours = self.colours_as_anon()
        self.assertNotIn(missing, colours)
        self.assertNotIn(malformed, colours)


if __name__ == "__main__":
    unittest.main()
