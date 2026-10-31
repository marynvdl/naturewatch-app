"""The October 2026 import refuses a file that does not match the pin."""

from __future__ import annotations

import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "supabase" / "import_wdpa.py"


def load_import_wdpa():
    spec = importlib.util.spec_from_file_location("import_wdpa", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


import_wdpa = load_import_wdpa()

try:
    import osgeo.ogr  # noqa: F401
    import pyproj  # noqa: F401
    import shapely  # noqa: F401

    HAS_AREA_LIBRARIES = True
except ImportError:
    HAS_AREA_LIBRARIES = False


class FakeBody(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class ImportWdpaTest(unittest.TestCase):
    def test_checksum_mismatch_refuses_the_import(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "wdpa.zip"

            def urlopen(request, timeout):
                self.assertEqual(request.full_url, import_wdpa.PINNED_URL)
                self.assertGreater(timeout, 0)
                return FakeBody(b"this is not the october wdpa zip")

            with mock.patch.object(import_wdpa.urllib.request, "urlopen", urlopen):
                with self.assertRaises(SystemExit) as raised:
                    import_wdpa.download(
                        import_wdpa.PINNED_URL, dest, import_wdpa.PINNED_SHA256
                    )
            message = str(raised.exception)
            self.assertIn("checksum mismatch", message)
            self.assertIn(import_wdpa.PINNED_SHA256, message)
            self.assertFalse(dest.exists())

    def test_pin_matches_the_migrations(self):
        url = import_wdpa.PINNED_URL
        checksum = import_wdpa.PINNED_SHA256
        self.assertEqual(len(checksum), 64)
        self.assertTrue(all(character in "0123456789abcdef" for character in checksum))
        self.assertNotIn("Public_ZAF", url)
        for relative in (
            "supabase/migrations/20261021120000_records.sql",
            "supabase/migrations/20261029200000_global_protected_areas.sql",
            "supabase/tests/records_fixture.sql",
        ):
            text = (ROOT / relative).read_text()
            self.assertIn(url, text, relative)
            self.assertIn(checksum, text, relative)

    def test_hosted_url_uses_the_direct_database_host(self):
        body = FakeBody(
            json.dumps(
                {
                    "role": "cli_login_postgres",
                    "password": "p/ass",
                    "ttl_seconds": 300,
                }
            ).encode()
        )

        def urlopen(request, timeout):
            self.assertIn(import_wdpa.HOSTED_PROJECT_REF, request.full_url)
            self.assertNotIn("pooler", request.full_url)
            self.assertGreater(timeout, 0)
            return body

        with mock.patch.dict(
            os.environ, {"SUPABASE_ACCESS_TOKEN": "token-value"}, clear=False
        ):
            with mock.patch.object(import_wdpa.urllib.request, "urlopen", urlopen):
                url, hosted = import_wdpa.database_url_for_run()
        self.assertTrue(hosted)
        self.assertIn(import_wdpa.HOSTED_DIRECT_HOST, url)
        self.assertNotIn("pooler.supabase.com", url)
        self.assertIn(f"cli_login_postgres:{quote('p/ass', safe='')}", url)
        self.assertNotIn(
            f"cli_login_postgres.{import_wdpa.HOSTED_PROJECT_REF}", url
        )

    def test_area_prefilter_keeps_large_polygons_and_near_misses(self):
        tiny = FakeGeometry(0.0001)
        self.assertFalse(import_wdpa.stage_this_polygon(tiny, 0.2))
        self.assertTrue(import_wdpa.stage_this_polygon(tiny, 10))
        with mock.patch.object(import_wdpa, "geodesic_area_km2", return_value=9.995):
            self.assertTrue(import_wdpa.stage_this_polygon(tiny, 5))
        with mock.patch.object(import_wdpa, "geodesic_area_km2", return_value=9.0):
            self.assertFalse(import_wdpa.stage_this_polygon(tiny, 5))
        stats = {"unmeasured": 0}
        with mock.patch.object(import_wdpa, "geodesic_area_km2", return_value=None):
            self.assertTrue(import_wdpa.stage_this_polygon(tiny, 5, stats))
        self.assertEqual(stats["unmeasured"], 1)

    @unittest.skipUnless(HAS_AREA_LIBRARIES, "needs GDAL, shapely and pyproj")
    def test_real_geometries_are_measured_and_filtered(self):
        from osgeo import ogr

        def square(side_degrees):
            half = side_degrees / 2
            ring = (
                f"{-half} {-half},{half} {-half},{half} {half},{-half} {half},{-half} {-half}"
            )
            return ogr.CreateGeometryFromWkt(f"POLYGON(({ring}))")

        small = square(0.02)
        large = square(0.1)
        # GDAL hands back a bytearray. shapely reads only bytes.
        self.assertIsInstance(large.ExportToIsoWkb(), bytearray)
        measured_large = import_wdpa.geodesic_area_km2(large)
        measured_small = import_wdpa.geodesic_area_km2(small)
        self.assertIsNotNone(measured_large)
        self.assertIsNotNone(measured_small)
        self.assertAlmostEqual(measured_large, 123.6, delta=1.0)
        self.assertAlmostEqual(measured_small, 4.94, delta=0.1)

        stats = {"unmeasured": 0}
        self.assertFalse(import_wdpa.stage_this_polygon(small, 5.0, stats))
        self.assertTrue(import_wdpa.stage_this_polygon(large, 5.0, stats))
        self.assertTrue(import_wdpa.stage_this_polygon(small, 10.0, stats))
        self.assertEqual(stats["unmeasured"], 0)

    @unittest.skipUnless(HAS_AREA_LIBRARIES, "needs GDAL, shapely and pyproj")
    def test_a_hole_is_subtracted_from_the_area(self):
        from osgeo import ogr

        solid = ogr.CreateGeometryFromWkt(
            "POLYGON((0 0,0.1 0,0.1 0.1,0 0.1,0 0))"
        )
        holed = ogr.CreateGeometryFromWkt(
            "POLYGON((0 0,0.1 0,0.1 0.1,0 0.1,0 0),(0.02 0.02,0.02 0.08,0.08 0.08,0.08 0.02,0.02 0.02))"
        )
        self.assertLess(
            import_wdpa.geodesic_area_km2(holed),
            import_wdpa.geodesic_area_km2(solid) * 0.7,
        )

    def test_the_filtered_file_round_trips_awkward_text(self):
        import csv
        import gzip

        rows = [
            ["a1", "1", 'Name with\ttab and "quotes"', "", "II", "ZAF", "Terrestrial", "0101"],
            ["a2", "2", "Line one\nline two", "Park", "", "", "Terrestrial", "0102"],
        ]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / import_wdpa.FILTERED_NAME
            with gzip.open(path, "wt", newline="") as handle:
                writer = csv.writer(handle, delimiter="\t", lineterminator="\n")
                writer.writerows(rows)
            work = Path(tmp)
            self.assertEqual(list(import_wdpa.read_rows(work)), rows)

    def test_upload_refuses_a_filtered_file_that_changed(self):
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            (work / import_wdpa.FILTERED_NAME).write_text("a\t1\n")
            digest = import_wdpa.file_sha256(work / import_wdpa.FILTERED_NAME)
            (work / import_wdpa.MANIFEST_NAME).write_text(
                json.dumps(
                    {
                        "pin_sha256": import_wdpa.PINNED_SHA256,
                        "rows_sha256": digest,
                        "kept": 1,
                    }
                )
            )
            self.assertEqual(import_wdpa.read_manifest(work)["kept"], 1)
            (work / import_wdpa.FILTERED_NAME).write_text("a\t1\nb\t2\n")
            with self.assertRaises(SystemExit) as raised:
                import_wdpa.read_manifest(work)
            self.assertIn("manifest checksum", str(raised.exception))

    def test_no_step_deletes_a_stored_place(self):
        source = MODULE_PATH.read_text()
        self.assertNotIn("delete from public.places ", source)
        self.assertNotIn("delete from places ", source)


class FakeGeometry:
    def __init__(self, area: float):
        self._area = area

    def GetArea(self):
        return self._area


if __name__ == "__main__":
    unittest.main()
