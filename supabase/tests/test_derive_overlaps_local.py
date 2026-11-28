"""derive_overlaps.py against the local database.

Runs in one transaction that is rolled back. Skipped when the local database is not
running or already holds conservation areas.
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
_spec = importlib.util.spec_from_file_location("derive_overlaps", ROOT / "derive_overlaps.py")
derive_overlaps = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = derive_overlaps
_spec.loader.exec_module(derive_overlaps)

_local = importlib.util.spec_from_file_location("test_reconcile_local", Path(__file__).parent / "test_reconcile_local.py")
test_reconcile_local = importlib.util.module_from_spec(_local)
_local.loader.exec_module(test_reconcile_local)

# A park 0.2 degrees square, a smaller park inside its west half, a park over 40% of
# it, a park that only touches its edge, a sliver under 1% of either, a park far
# away, and a Ramsar site over all of them, which is not paired.
PARK = "MULTIPOLYGON(((30 -20, 30.2 -20, 30.2 -19.8, 30 -19.8, 30 -20)))"
INSIDE = "MULTIPOLYGON(((30 -20, 30.1 -20, 30.1 -19.8, 30 -19.8, 30 -20)))"
PART = "MULTIPOLYGON(((30.12 -20, 30.4 -20, 30.4 -19.8, 30.12 -19.8, 30.12 -20)))"
TOUCHING = "MULTIPOLYGON(((30.2 -20.4, 30.4 -20.4, 30.4 -20, 30.2 -20, 30.2 -20.4)))"
SLIVER = "MULTIPOLYGON(((29.0 -20, 30.0005 -20, 30.0005 -19.8, 29.0 -19.8, 29.0 -20)))"
FAR = "MULTIPOLYGON(((35 -20, 35.2 -20, 35.2 -19.8, 35 -19.8, 35 -20)))"
RAMSAR = "MULTIPOLYGON(((29 -21, 31 -21, 31 -19, 29 -19, 29 -21)))"


class DeriveOverlapsLocalTest(unittest.TestCase):
    def setUp(self):
        self.conn = test_reconcile_local.connect()
        if self.conn.execute(
            "select count(*) as n from public.places where place_type_id = 'conservation_area'"
        ).fetchone()["n"]:
            self.conn.close()
            self.skipTest("the local database already holds conservation areas")
        self.release = self.conn.execute(
            "select id from public.source_releases where source_id = 'wdpca'"
        ).fetchone()["id"]
        self.stack = ExitStack()
        self.stack.enter_context(mock.patch.object(self.conn, "commit", lambda: None))
        self.stack.enter_context(mock.patch("builtins.print"))
        self.work = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.shapes = {}
        self.park = self.place("Park", "conservation_area", PARK)
        self.inside = self.place("Inside", "conservation_area", INSIDE)
        self.part = self.place("Part", "conservation_area", PART)
        self.touching = self.place("Touching", "conservation_area", TOUCHING)
        self.sliver = self.place("Sliver", "conservation_area", SLIVER)
        self.far = self.place("Far", "conservation_area", FAR)
        self.ramsar = self.place("Wetland", "ramsar_site", RAMSAR)
        test_reconcile_local.ReconcileLocalTest.write_file(self, [
            (f"pid-{name}", f"s{n}", name, wkt) for n, (name, wkt) in enumerate(self.shapes.items())
        ])

    def tearDown(self):
        self.stack.close()
        self.conn.rollback()
        self.conn.close()

    def place(self, name: str, place_type: str, wkt: str) -> str:
        self.shapes[name] = wkt
        place_id = self.conn.execute(
            "insert into public.places (name, place_type_id, publication_status) "
            "values (%s, %s, 'published') returning id::text as id",
            (name, place_type),
        ).fetchone()["id"]
        self.conn.execute(
            """
            insert into public.place_source_ids (
              place_id, source_id, id_kind, source_record_id, match_status,
              first_seen_release_id, last_seen_release_id
            ) values (%s, 'wdpca', 'wdpa_site_pid', %s, 'confirmed', %s, %s)
            """,
            (place_id, f"pid-{name}", self.release, self.release),
        )
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

    def pairs(self) -> dict[frozenset, dict]:
        rows = self.conn.execute(
            "select subject_place_id::text as subject, object_place_id::text as object, status, origin, "
            "subject_coverage, object_coverage from public.place_relationships "
            "where relationship_type_id = 'overlaps'"
        ).fetchall()
        return {frozenset((row["subject"], row["object"])): row for row in rows}

    def share_of(self, row: dict, place_id: str) -> float:
        return row["subject_coverage"] if row["subject"] == place_id else row["object_coverage"]

    def test_compute_pairs_each_park_pair_once(self):
        places = derive_overlaps.fetch_parks(self.conn)
        self.assertEqual(len(places), 6)
        result = derive_overlaps.compute(places, self.work)
        self.assertEqual((result["pairs_written"], result["failed"], result["missing_site_pids"]), (2, 0, 0))
        lines = (self.work / derive_overlaps.LINKS_NAME).read_text().splitlines()
        found = {frozenset(line.split("\t")[:2]) for line in lines}
        self.assertEqual(found, {frozenset((self.park, self.inside)), frozenset((self.park, self.part))})
        for line in lines:
            subject, obj = line.split("\t")[:2]
            self.assertLess(subject, obj)
        # A rerun finds every park done.
        self.assertEqual(derive_overlaps.compute(places, self.work)["pairs_written"], 0)
        counts = derive_overlaps.file_counts(self.work)
        self.assertEqual(counts["pairs"], 2)
        self.assertEqual(counts["at_90"], 1)

    def test_load_at_a_share(self):
        derive_overlaps.compute(derive_overlaps.fetch_parks(self.conn), self.work)
        result = derive_overlaps.load(self.conn, self.work, 0.5)
        self.assertEqual((result["at_share"], result["inserted"]), (1, 1))
        pairs = self.pairs()
        self.assertEqual(set(pairs), {frozenset((self.park, self.inside))})
        row = pairs[frozenset((self.park, self.inside))]
        self.assertEqual((row["origin"], row["status"]), ("derived", "proposed"))
        self.assertAlmostEqual(self.share_of(row, self.inside), 1, places=3)
        self.assertAlmostEqual(self.share_of(row, self.park), 0.5, places=2)
        # Loading again, or at a lower share, adds only the new pairs.
        self.assertEqual(derive_overlaps.load(self.conn, self.work, 0.5)["inserted"], 0)
        self.assertEqual(derive_overlaps.load(self.conn, self.work, 0.25)["inserted"], 1)
        with self.assertRaises(SystemExit):
            derive_overlaps.load(self.conn, self.work, 0)

    def test_load_skips_a_stale_boundary(self):
        stale = "00000000-0000-0000-0000-000000000000"
        a, b = sorted((self.park, self.inside))
        (self.work / derive_overlaps.LINKS_NAME).write_text(f"{a}\t{b}\t{stale}\t{stale}\t1\t0.5\t1\n")
        self.assertEqual(derive_overlaps.load(self.conn, self.work, 0.5)["inserted"], 0)


if __name__ == "__main__":
    unittest.main()
