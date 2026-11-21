"""import_ecoregions.py without a database."""

from __future__ import annotations

import importlib.util
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location(
    "import_ecoregions", ROOT / "supabase" / "import_ecoregions.py"
)
import_ecoregions = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = import_ecoregions
_spec.loader.exec_module(import_ecoregions)

try:
    import pyproj  # noqa: F401
    import shapely
    from shapely import wkt

    HAS_SHAPE_LIBRARIES = True
except ImportError:
    HAS_SHAPE_LIBRARIES = False

SQUARE = "POLYGON((30 -20, 30.2 -20, 30.2 -19.8, 30 -19.8, 30 -20))"
# The ring touches itself at (30.1, -19.8), closing a triangle that is a hole.
# All 69 invalid RESOLVE shapes are ring self-intersections like this.
SELF_TOUCHING = (
    "POLYGON((30 -20, 30.2 -20, 30.2 -19.8, 30.1 -19.8, 30.15 -19.85, "
    "30.05 -19.85, 30.1 -19.8, 30 -19.8, 30 -20))"
)
# A bow tie: its two halves cancel, so it measures no area before a repair.
BOW_TIE = "POLYGON((30 -20, 30.2 -19.8, 30.2 -20, 30 -19.8, 30 -20))"


def attributes(eco_id: int) -> dict:
    return {
        "ECO_ID": eco_id,
        "ECO_NAME": "Test savanna",
        "BIOME_NAME": "Tropical & Subtropical Grasslands, Savannas & Shrublands",
        "REALM": "Afrotropic",
        "COLOR": "#FFA77F",
    }


class FakeBody(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@unittest.skipUnless(HAS_SHAPE_LIBRARIES, "shapely and pyproj are required")
class SourceRowTest(unittest.TestCase):
    def test_rock_and_ice_is_left_out(self):
        stats = {"rock_and_ice": 0, "repaired": 0}
        row = import_ecoregions.source_row(attributes(0), wkt.loads(SQUARE).wkb, stats)
        self.assertIsNone(row)
        self.assertEqual(stats["rock_and_ice"], 1)

    def test_a_polygon_becomes_a_multipolygon(self):
        row = import_ecoregions.source_row(attributes(7), wkt.loads(SQUARE).wkb)
        record = dict(zip(import_ecoregions.COLUMNS, row))
        shape = shapely.from_wkb(bytes.fromhex(record["wkb"]))
        self.assertEqual(shape.geom_type, "MultiPolygon")
        self.assertEqual(record["eco_id"], 7)
        self.assertEqual(record["realm"], "Afrotropic")
        self.assertIn('"COLOR": "#FFA77F"', record["attributes"])
        # 0.2 degrees square near 20 S is about 21 km by 22 km.
        self.assertAlmostEqual(float(record["area_km2"]), 463.7, delta=0.1)

    def test_an_invalid_ring_is_repaired(self):
        shape = wkt.loads(SELF_TOUCHING)
        self.assertFalse(shape.is_valid)
        stats = {"rock_and_ice": 0, "repaired": 0}
        row = import_ecoregions.source_row(attributes(8), shape.wkb, stats)
        repaired = shapely.from_wkb(bytes.fromhex(row[-1]))
        self.assertTrue(repaired.is_valid)
        self.assertEqual(repaired.geom_type, "MultiPolygon")
        self.assertEqual(len(repaired.geoms[0].interiors), 1)
        self.assertEqual(stats["repaired"], 1)
        self.assertAlmostEqual(float(row[5]), 434.72, delta=0.01)

    def test_a_shape_with_no_area_before_its_repair_stops(self):
        with self.assertRaises(SystemExit) as raised:
            import_ecoregions.multipolygon(wkt.loads(BOW_TIE).wkb, "ECO_ID 10")
        self.assertIn("no area", str(raised.exception))

    def test_a_repair_that_changes_the_area_stops(self):
        shape = wkt.loads(SELF_TOUCHING)
        areas = iter([100.0, 120.0])
        with mock.patch.object(import_ecoregions, "geodesic_km2", lambda _s: next(areas)):
            with self.assertRaises(SystemExit) as raised:
                import_ecoregions.multipolygon(shape.wkb, "ECO_ID 9")
        self.assertIn("changed the area", str(raised.exception))


class DownloadTest(unittest.TestCase):
    def test_checksum_mismatch_stops_the_build(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)

            def urlopen(request, timeout):
                return FakeBody(b"not the RESOLVE zip")

            with mock.patch.object(import_ecoregions.urllib.request, "urlopen", urlopen):
                with self.assertRaises(SystemExit) as raised:
                    import_ecoregions.build(work)
            self.assertIn("checksum mismatch", str(raised.exception))
            self.assertFalse((work / import_ecoregions.ZIP_NAME).exists())

    def test_only_the_pinned_url_is_downloaded(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(SystemExit):
                import_ecoregions.download(
                    "https://example.org/other.zip",
                    Path(directory) / "x.zip",
                    import_ecoregions.PINNED_SHA256,
                )

    def test_pin_matches_the_migration(self):
        migration = (
            ROOT / "supabase" / "migrations" / "20261127100000_ecoregions.sql"
        ).read_text()
        self.assertIn(import_ecoregions.PINNED_SHA256, migration)
        self.assertIn(import_ecoregions.PINNED_URL, migration)


class CheckRowsTest(unittest.TestCase):
    def row(self, eco_id: str, area: float, **changes) -> dict:
        row = {
            "eco_id": eco_id,
            "name": f"Ecoregion {eco_id}",
            "publication_status": "published",
            "place_type_id": "ecoregion",
            "current_boundaries": 1,
            "version_number": 1,
            "area_km2": area,
            "valid": True,
            "has_details": True,
            "confirmed_ids": 1,
        }
        row.update(changes)
        return row

    def test_a_clean_load_passes(self):
        expected = {"1": ("a", 100.0), "2": ("b", 50.0)}
        result = import_ecoregions.check_rows(
            [self.row("1", 100.000001), self.row("2", 50.0)], expected, 2
        )
        self.assertEqual(result["problems"], [])
        self.assertEqual(result["largest"][0]["name"], "Ecoregion 1")

    def test_missing_rows_areas_and_invalid_boundaries_are_problems(self):
        expected = {"1": ("a", 100.0), "2": ("b", 50.0), "3": ("c", 10.0)}
        result = import_ecoregions.check_rows(
            [self.row("1", 101.0), self.row("2", 50.0, valid=False)], expected, 2
        )
        text = "\n".join(result["problems"])
        self.assertIn("1 ecoregions not stored", text)
        self.assertIn("ECO_ID 1: area_km2", text)
        self.assertIn("ECO_ID 2: not one valid", text)


if __name__ == "__main__":
    unittest.main()
