"""derive_recognises.py against the local database.

Runs on an empty local database after `supabase db reset`, in one transaction
that is rolled back. Skipped when the local database is not running or already
holds places.
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
_spec = importlib.util.spec_from_file_location("derive_recognises", ROOT / "derive_recognises.py")
derive_recognises = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = derive_recognises
_spec.loader.exec_module(derive_recognises)

_local = importlib.util.spec_from_file_location("test_reconcile_local", Path(__file__).parent / "test_reconcile_local.py")
test_reconcile_local = importlib.util.module_from_spec(_local)
_local.loader.exec_module(test_reconcile_local)

# A park 0.2 degrees square, a World Heritage Site over all of it, a Ramsar site
# over 60% of it, a Natura 2000 site that only touches its edge, and a park far away.
PARK = "MULTIPOLYGON(((30 -20, 30.2 -20, 30.2 -19.8, 30 -19.8, 30 -20)))"
PARK_WEST = "MULTIPOLYGON(((30 -20, 30.1 -20, 30.1 -19.8, 30 -19.8, 30 -20)))"
PARK_EAST = "MULTIPOLYGON(((30.1 -20, 30.2 -20, 30.2 -19.8, 30.1 -19.8, 30.1 -20)))"
WHS = "MULTIPOLYGON(((29.9 -20.1, 30.3 -20.1, 30.3 -19.7, 29.9 -19.7, 29.9 -20.1)))"
RAMSAR = "MULTIPOLYGON(((30.08 -20, 30.3 -20, 30.3 -19.8, 30.08 -19.8, 30.08 -20)))"
TOUCHING = "MULTIPOLYGON(((30.2 -20, 30.4 -20, 30.4 -19.8, 30.2 -19.8, 30.2 -20)))"
FAR = "MULTIPOLYGON(((35 -20, 35.2 -20, 35.2 -19.8, 35 -19.8, 35 -20)))"


class DeriveRecognisesLocalTest(unittest.TestCase):
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
        self.stack.enter_context(mock.patch("builtins.print"))
        self.work = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.park = self.place("Park", "conservation_area", PARK, ("pid-park-west", "pid-park-east"))
        self.far = self.place("Far Park", "conservation_area", FAR)
        self.whs = self.place("Falls", "world_heritage_site", WHS)
        self.ramsar = self.place("Wetland", "ramsar_site", RAMSAR)
        self.touching = self.place("Edge", "natura_2000_site", TOUCHING)

    def tearDown(self):
        self.stack.close()
        self.conn.rollback()
        self.conn.close()

    def place(self, name: str, place_type: str, wkt: str, pids: tuple[str, ...] = ()) -> str:
        place_id = self.conn.execute(
            "insert into public.places (name, place_type_id, publication_status) "
            "values (%s, %s, 'published') returning id::text as id",
            (name, place_type),
        ).fetchone()["id"]
        for pid in pids or (f"pid-{name}",):
            self.conn.execute(
                """
                insert into public.place_source_ids (
                  place_id, source_id, id_kind, source_record_id, match_status,
                  first_seen_release_id, last_seen_release_id
                ) values (%s, 'wdpca', 'wdpa_site_pid', %s, 'confirmed', %s, %s)
                """,
                (place_id, pid, self.release, self.release),
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

    def links(self) -> dict[str, dict]:
        rows = self.conn.execute(
            "select subject_place_id::text as subject, object_place_id::text as object, "
            "status, origin, object_coverage, subject_coverage, "
            "subject_boundary_id is not null and object_boundary_id is not null as has_boundaries "
            "from public.place_relationships where relationship_type_id = 'recognises'"
        ).fetchall()
        return {row["subject"]: row for row in rows}

    def test_derive_links_recognitions_to_the_parks_they_cover(self):
        result = derive_recognises.derive(self.conn, self.work)
        self.assertEqual(result["inserted"], 2)
        self.assertEqual(result["failed"], {})
        links = self.links()
        self.assertEqual(set(links), {self.whs, self.ramsar})
        for link in links.values():
            self.assertEqual(link["object"], self.park)
            self.assertEqual((link["origin"], link["status"]), ("derived", "proposed"))
            self.assertTrue(link["has_boundaries"])
        self.assertAlmostEqual(links[self.whs]["object_coverage"], 1, places=3)
        self.assertAlmostEqual(links[self.whs]["subject_coverage"], 0.25, places=2)
        self.assertAlmostEqual(links[self.ramsar]["object_coverage"], 0.6, places=2)

        # A rerun finds every recognition done and adds nothing.
        again = derive_recognises.derive(self.conn, self.work)
        self.assertEqual(again["inserted"], 0)
        # Without the progress file, the pairs that have rows are skipped.
        (self.work / derive_recognises.PROGRESS_NAME).unlink()
        again = derive_recognises.derive(self.conn, self.work)
        self.assertEqual(again["inserted"], 0)
        self.assertEqual(len(self.links()), 2)

        counts = {row["place_type_id"]: row for row in derive_recognises.counts(self.conn)}
        self.assertEqual(counts["world_heritage_site"]["at_90"], 1)
        self.assertEqual(counts["ramsar_site"]["at_50"], 1)
        self.assertEqual(counts["ramsar_site"]["at_75"], 0)

    def test_compute_and_load_match_derive(self):
        # The park is stored as a merged place of two parcels; its shape is their union.
        test_reconcile_local.ReconcileLocalTest.write_file(self, [
            ("pid-park-west", "s1", "Park", PARK_WEST),
            ("pid-park-east", "s1", "Park", PARK_EAST),
            ("pid-Far Park", "s2", "Far Park", FAR),
            ("pid-Falls", "s3", "Falls", WHS),
            ("pid-Wetland", "s4", "Wetland", RAMSAR),
            ("pid-Edge", "s5", "Edge", TOUCHING),
        ])
        places = derive_recognises.fetch_places(self.conn)
        self.assertEqual(sorted(places[self.park]["pids"]), ["pid-park-east", "pid-park-west"])
        self.assertEqual(len(places), 5)
        result = derive_recognises.compute(places, self.work)
        self.assertEqual((result["links_written"], result["failed"], result["missing_site_pids"]), (2, 0, 0))
        # A rerun finds every recognition done.
        self.assertEqual(derive_recognises.compute(places, self.work)["links_written"], 0)

        self.assertEqual(derive_recognises.load(self.conn, self.work)["inserted"], 2)
        links = self.links()
        self.assertEqual(set(links), {self.whs, self.ramsar})
        for link in links.values():
            self.assertEqual(link["object"], self.park)
            self.assertEqual((link["origin"], link["status"]), ("derived", "proposed"))
            self.assertTrue(link["has_boundaries"])
        self.assertAlmostEqual(links[self.whs]["object_coverage"], 1, places=3)
        self.assertAlmostEqual(links[self.whs]["subject_coverage"], 0.25, places=2)
        self.assertAlmostEqual(links[self.ramsar]["object_coverage"], 0.6, places=2)

        # Loading again, or after derive, adds nothing.
        self.assertEqual(derive_recognises.load(self.conn, self.work)["inserted"], 0)
        self.assertEqual(derive_recognises.derive(self.conn, self.work)["inserted"], 0)

    def test_load_skips_a_link_whose_boundary_is_no_longer_current(self):
        stale = "00000000-0000-0000-0000-000000000000"
        (self.work / derive_recognises.LINKS_NAME).write_text(
            f"{self.whs}\t{self.park}\t{stale}\t{stale}\t1\t0.25\t1\n"
        )
        self.assertEqual(derive_recognises.load(self.conn, self.work), {"in_file": 1, "inserted": 0, "skipped": 1})

    def test_confirm_sets_only_links_at_or_above_the_share(self):
        derive_recognises.derive(self.conn, self.work)
        self.assertEqual(derive_recognises.confirm(self.conn, 0.75), 1)
        links = self.links()
        self.assertEqual(links[self.whs]["status"], "confirmed")
        self.assertEqual(links[self.ramsar]["status"], "proposed")
        with self.assertRaises(SystemExit):
            derive_recognises.confirm(self.conn, 0)


if __name__ == "__main__":
    unittest.main()
