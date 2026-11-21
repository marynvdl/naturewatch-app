"""derive_ecoregion_links.py against the local database, and its grid cut.

The database tests run on an empty local database after `supabase db reset`, in
one transaction that is rolled back. They are skipped when the local database is
not running or already holds places.
"""

from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("derive_ecoregion_links", ROOT / "derive_ecoregion_links.py")
derive_ecoregion_links = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = derive_ecoregion_links
_spec.loader.exec_module(derive_ecoregion_links)

_local = importlib.util.spec_from_file_location("test_reconcile_local", Path(__file__).parent / "test_reconcile_local.py")
test_reconcile_local = importlib.util.module_from_spec(_local)
_local.loader.exec_module(test_reconcile_local)

# Two ecoregions meet at 30.14 E. A park 0.2 degrees wide lies 70% in the west one
# and 30% in the east one, which crosses the 31 E grid line. A World
# Heritage Site lies inside the west one. A park only touches the east one's edge,
# and one is far from both. An unpublished ecoregion lies over the split park.
WEST = "MULTIPOLYGON(((29 -21, 30.14 -21, 30.14 -19, 29 -19, 29 -21)))"
EAST = "MULTIPOLYGON(((30.14 -21, 32 -21, 32 -19, 30.14 -19, 30.14 -21)))"
HIDDEN = "MULTIPOLYGON(((30 -20, 30.2 -20, 30.2 -19.8, 30 -19.8, 30 -20)))"
PARK = "MULTIPOLYGON(((30 -20, 30.2 -20, 30.2 -19.8, 30 -19.8, 30 -20)))"
WHS = "MULTIPOLYGON(((29.5 -20, 29.6 -20, 29.6 -19.9, 29.5 -19.9, 29.5 -20)))"
TOUCHING = "MULTIPOLYGON(((32 -20, 32.2 -20, 32.2 -19.8, 32 -19.8, 32 -20)))"
FAR = "MULTIPOLYGON(((40 -20, 40.2 -20, 40.2 -19.8, 40 -19.8, 40 -20)))"


class GridCutTest(unittest.TestCase):
    def test_pieces_add_up_to_the_shape(self):
        import shapely
        from shapely import wkt

        shape = wkt.loads("POLYGON((-12.5 -3.2, 14.7 -3.2, 14.7 21.9, 1 8, -12.5 21.9, -12.5 -3.2))")
        pieces = derive_ecoregion_links.grid_pieces(shape)
        self.assertGreater(len(pieces), 300)
        self.assertAlmostEqual(sum(shapely.area(p) for _, p in pieces), shapely.area(shape), places=6)
        for (x, y), piece in pieces:
            west, south, east, north = piece.bounds
            self.assertTrue(x <= west and east <= x + 1 and y <= south and north <= y + 1)
        self.assertEqual(len({cell for cell, _ in pieces}), len(pieces))

    def test_a_shape_inside_one_cell_is_kept_whole(self):
        from shapely import wkt

        shape = wkt.loads("POLYGON((30.1 -19.9, 30.2 -19.9, 30.2 -19.8, 30.1 -19.9))")
        self.assertEqual(derive_ecoregion_links.grid_pieces(shape), [((30, -20), shape)])


class DeriveEcoregionLinksLocalTest(unittest.TestCase):
    def setUp(self):
        self.conn = test_reconcile_local.connect()
        if self.conn.execute("select count(*) as n from public.places").fetchone()["n"]:
            self.conn.close()
            self.skipTest("the local database already holds places")
        self.release = self.conn.execute(
            "select id from public.source_releases where source_id = 'wdpca'"
        ).fetchone()["id"]
        self.stack = ExitStack()
        self.stack.enter_context(mock.patch.object(self.conn, "commit", lambda: None))
        self.stack.enter_context(mock.patch.object(self.conn, "rollback", lambda: None))
        self.stack.enter_context(mock.patch("builtins.print"))
        self.work = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.west = self.place("West savanna", "ecoregion", WEST)
        self.east = self.place("East savanna", "ecoregion", EAST)
        self.hidden = self.place("Hidden", "ecoregion", HIDDEN, "withdrawn")
        self.park = self.place("Park", "conservation_area", PARK)
        self.whs = self.place("Falls", "world_heritage_site", WHS)
        self.touching = self.place("Edge", "conservation_area", TOUCHING)
        self.far = self.place("Far Park", "conservation_area", FAR)

    def tearDown(self):
        self.stack.close()
        self.conn.rollback()
        self.conn.close()

    def place(self, name: str, place_type: str, wkt: str, status: str = "published") -> str:
        place_id = self.conn.execute(
            "insert into public.places (name, place_type_id, publication_status) "
            "values (%s, %s, %s) returning id::text as id",
            (name, place_type, status),
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
            (place_id, wkt, self.release),
        )
        return place_id

    def links(self) -> dict[tuple[str, str], dict]:
        rows = self.conn.execute(
            "select subject_place_id::text as subject, object_place_id::text as object, "
            "status, origin, subject_coverage, object_coverage, "
            "subject_boundary_id is not null and object_boundary_id is not null as has_boundaries "
            "from public.place_relationships where relationship_type_id = 'located_in'"
        ).fetchall()
        return {(row["subject"], row["object"]): row for row in rows}

    def test_compute_load_counts_and_confirm(self):
        result = derive_ecoregion_links.compute(self.conn, self.work)
        self.assertEqual(
            (result["parks"], result["links_written"], result["parks_without_link"], result["failed"]),
            (4, 3, 2, 0),
        )
        # A rerun finds every park done.
        self.assertEqual(derive_ecoregion_links.compute(self.conn, self.work)["parks"], 0)

        self.assertEqual(derive_ecoregion_links.load(self.conn, self.work)["inserted"], 3)
        links = self.links()
        self.assertEqual(set(links), {(self.park, self.west), (self.park, self.east), (self.whs, self.west)})
        for link in links.values():
            self.assertEqual((link["origin"], link["status"]), ("derived", "proposed"))
            self.assertTrue(link["has_boundaries"])
        self.assertAlmostEqual(links[(self.park, self.west)]["subject_coverage"], 0.7, places=3)
        self.assertAlmostEqual(links[(self.park, self.east)]["subject_coverage"], 0.3, places=3)
        self.assertAlmostEqual(links[(self.whs, self.west)]["subject_coverage"], 1, places=4)
        self.assertLess(links[(self.whs, self.west)]["object_coverage"], 0.01)

        # Loading again adds nothing.
        self.assertEqual(derive_ecoregion_links.load(self.conn, self.work)["inserted"], 0)

        counts = {
            (row["place_type_id"], row["share"]): row for row in derive_ecoregion_links.counts(self.conn)["rows"]
        }
        parks_1 = counts[("conservation_area", 0.01)]
        self.assertEqual((parks_1["parks"], parks_1["links"], parks_1["parks_linked"]), (3, 2, 1))
        self.assertEqual(parks_1["median_per_park"], 2)
        parks_50 = counts[("conservation_area", 0.5)]
        self.assertEqual((parks_50["links"], parks_50["parks_unlinked"], parks_50["median_per_park"]), (1, 2, 1))
        self.assertEqual(counts[("world_heritage_site", 0.5)]["parks_linked"], 1)

        self.assertEqual(derive_ecoregion_links.confirm(self.conn, 0.5), 2)
        links = self.links()
        self.assertEqual(links[(self.park, self.west)]["status"], "confirmed")
        self.assertEqual(links[(self.park, self.east)]["status"], "proposed")
        with self.assertRaises(SystemExit):
            derive_ecoregion_links.confirm(self.conn, 0)

        self.conn.execute("set local role anon")
        seen = self.conn.execute(
            "select subject_place_id::text as subject, object_place_id::text as object "
            "from public.place_relationships where relationship_type_id = 'located_in' "
            "and subject_place_id = %s",
            (self.park,),
        ).fetchall()
        self.conn.execute("reset role")
        self.assertEqual([(row["subject"], row["object"]) for row in seen], [(self.park, self.west)])

    def test_load_skips_a_link_whose_boundary_is_no_longer_current(self):
        stale = derive_ecoregion_links.NO_ID
        (self.work / derive_ecoregion_links.LINKS_NAME).write_text(
            f"{self.park}\t{self.west}\t{stale}\t{stale}\t1\t0.7\t0.001\n"
        )
        self.assertEqual(
            derive_ecoregion_links.load(self.conn, self.work), {"in_file": 1, "inserted": 0, "skipped": 1}
        )


if __name__ == "__main__":
    unittest.main()
