"""The list reads filtered by ecoregion, against the local database.

Uses two of the local ecoregions, so it needs `import_ecoregions.py` loaded
locally. Each test runs in one transaction that is rolled back. Skipped when the
local database is not running or has no ecoregions.
"""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

_local = importlib.util.spec_from_file_location(
    "test_place_cleanup_local", Path(__file__).parent / "test_place_cleanup_local.py"
)
test_place_cleanup_local = importlib.util.module_from_spec(_local)
_local.loader.exec_module(test_place_cleanup_local)

WINDOW = "select id::text from public.place_window(%s, 'Zqx Eco', false, 'name', p_ecoregion_ids => %s::uuid[])"


class EcoregionFilterLocalTest(unittest.TestCase):
    # Borrowed, not inherited, so the cleanup tests do not run twice.
    place = test_place_cleanup_local.PlaceCleanupLocalTest.place
    act_as = test_place_cleanup_local.PlaceCleanupLocalTest.act_as
    run_as = test_place_cleanup_local.PlaceCleanupLocalTest.run_as

    def setUp(self):
        self.conn = test_place_cleanup_local.connect()
        rows = self.conn.execute(
            """
            select place.id::text as id, boundary.id as boundary_id
            from public.places as place
            join public.place_boundaries as boundary
              on boundary.place_id = place.id and boundary.is_current
            where place.place_type_id = 'ecoregion' and place.publication_status = 'published'
            order by place.name
            limit 3
            """
        ).fetchall()
        if len(rows) < 3:
            self.conn.close()
            self.skipTest("the local database has no ecoregions")
        self.ecoregions = rows
        self.release = self.conn.execute(
            "select id from public.source_releases where source_id = 'wdpca'"
        ).fetchone()["id"]
        self.in_first = self.place("Zqx Eco A", "conservation_area")
        self.in_both = self.place("Zqx Eco B", "conservation_area")
        self.proposed = self.place("Zqx Eco C", "conservation_area")
        self.outside = self.place("Zqx Eco D", "conservation_area")
        self.site = self.place("Zqx Eco E", "ramsar_site")
        self.link(self.in_first, 0)
        self.link(self.in_both, 0)
        self.link(self.in_both, 1)
        self.link(self.proposed, 0, "proposed")
        self.link(self.site, 1)
        retired = self.place("Zqx Eco F", "conservation_area")
        self.link(retired, 0)
        self.conn.execute(
            "update public.place_relationships set retired_at = now() where subject_place_id = %s",
            (retired,),
        )

    def tearDown(self):
        self.conn.rollback()
        self.conn.close()

    def link(self, subject: str, ecoregion: int, status: str = "confirmed"):
        object_row = self.ecoregions[ecoregion]
        self.conn.execute(
            """
            insert into public.place_relationships (
              subject_place_id, relationship_type_id, object_place_id, origin, status,
              subject_boundary_id, object_boundary_id, subject_coverage, object_coverage
            )
            select %s, 'located_in', %s, 'derived', %s, boundary.id, %s, 0.9, 0.01
            from public.place_boundaries as boundary
            where boundary.place_id = %s and boundary.is_current
            """,
            (subject, object_row["id"], status, object_row["boundary_id"], subject),
        )

    def ids(self, types: list[str], ecoregions: list[int] | None) -> list[str]:
        chosen = None if ecoregions is None else [self.ecoregions[i]["id"] for i in ecoregions]
        return [row["id"] for row in self.run_as(None, WINDOW, (types, chosen))]

    def test_no_ecoregion_keeps_every_place(self):
        every = [self.in_first, self.in_both, self.proposed, self.outside]
        self.assertEqual(self.ids(["conservation_area"], None), every + [self.place_named("F")])
        self.assertEqual(self.ids(["conservation_area"], []), every + [self.place_named("F")])

    def place_named(self, letter: str) -> str:
        return self.conn.execute(
            "select id::text from public.places where name = %s", (f"Zqx Eco {letter}",)
        ).fetchone()["id"]

    def test_only_confirmed_current_links_match(self):
        self.assertEqual(self.ids(["conservation_area"], [0]), [self.in_first, self.in_both])
        self.assertEqual(self.ids(["conservation_area"], [2]), [])

    def test_several_ecoregions_keep_a_place_in_any_of_them(self):
        self.assertEqual(
            self.ids(["conservation_area", "ramsar_site"], [0, 1]),
            [self.in_first, self.in_both, self.site],
        )

    def test_count_rank_kept_ids_and_stats_follow(self):
        chosen = [self.ecoregions[1]["id"]]
        count = self.run_as(
            None,
            "select public.place_window_count(array['conservation_area', 'ramsar_site'], "
            "'Zqx Eco', false, p_ecoregion_ids => %s::uuid[]) as n",
            (chosen,),
        )
        self.assertEqual(count[0]["n"], 2)
        rank = self.run_as(
            None,
            "select public.place_rank(array['conservation_area', 'ramsar_site'], %s, "
            "'Zqx Eco', false, 'name', p_ecoregion_ids => %s::uuid[]) as n",
            (self.site, chosen),
        )
        self.assertEqual(rank[0]["n"], 1)
        outside = self.run_as(
            None,
            "select public.place_rank(array['conservation_area'], %s, 'Zqx Eco', false, 'name', "
            "p_ecoregion_ids => %s::uuid[]) as n",
            (self.outside, chosen),
        )
        self.assertIsNone(outside[0]["n"])
        kept = self.run_as(
            None,
            "select public.place_kept_ids(array['conservation_area', 'ramsar_site'], "
            "p_ecoregion_ids => %s::uuid[])::text[] as ids",
            (chosen,),
        )
        self.assertEqual(sorted(kept[0]["ids"]), sorted([self.in_both, self.site]))
        stats = self.run_as(
            None,
            "select place_count from public.place_filter_stats(array['conservation_area'], %s::uuid[])",
            (chosen,),
        )
        self.assertEqual(stats[0]["place_count"], 1)

    def test_the_extent_read_filters_too(self):
        rows = self.run_as(
            None,
            "select id::text from public.place_window(array['conservation_area'], 'Zqx Eco', false, "
            "'name', p_west => 29, p_south => -21, p_east => 31, p_north => -19, "
            "p_ecoregion_ids => %s::uuid[])",
            ([self.ecoregions[0]["id"]],),
        )
        self.assertEqual([row["id"] for row in rows], [self.in_first, self.in_both])


if __name__ == "__main__":
    unittest.main()
