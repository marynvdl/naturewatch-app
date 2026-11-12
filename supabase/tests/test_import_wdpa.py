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
        sources = (ROOT / "supabase/migrations/20261111100000_sources.sql").read_text()
        self.assertIn(f"'{import_wdpa.PINNED_SOURCE}'", sources)
        self.assertIn(f"'{import_wdpa.PINNED_VERSION}'", sources)

    def _source_connection(self, row):
        cursor = mock.MagicMock()
        cursor.fetchone.return_value = row
        conn = mock.MagicMock()
        conn.cursor.return_value.__enter__.return_value = cursor
        return conn, cursor

    def _pinned_row(self, **changes):
        row = {
            "id": "a0c3e5b2-7d14-4f6a-9c88-2b6e1d0a94f3",
            "source_id": import_wdpa.PINNED_SOURCE,
            "version_label": import_wdpa.PINNED_VERSION,
            "released_on": import_wdpa.PINNED_RELEASE,
            "download_url": import_wdpa.PINNED_URL,
            "checksum": import_wdpa.PINNED_SHA256.upper(),
        }
        row.update(changes)
        return row

    def test_fetch_source_reads_the_pinned_release(self):
        conn, cursor = self._source_connection(self._pinned_row())
        row = import_wdpa.fetch_source(conn)
        sql, params = cursor.execute.call_args.args
        self.assertIn("from public.source_releases", sql)
        self.assertNotIn("release_month", sql)
        self.assertEqual(params, (import_wdpa.PINNED_SOURCE, import_wdpa.PINNED_VERSION))
        self.assertEqual(row["checksum"], import_wdpa.PINNED_SHA256)

    def test_fetch_source_refuses_a_release_that_differs_from_the_pin(self):
        for changes in (
            {"released_on": "2026-11-01"},
            {"download_url": "https://example.org/other.zip"},
            {"checksum": "0" * 64},
        ):
            conn, _ = self._source_connection(self._pinned_row(**changes))
            with self.assertRaises(SystemExit):
                import_wdpa.fetch_source(conn)

    def test_fetch_source_refuses_a_missing_release(self):
        conn, _ = self._source_connection(None)
        with self.assertRaises(SystemExit):
            import_wdpa.fetch_source(conn)

    def test_rows_match_places_through_confirmed_parcel_ids(self):
        sql = import_wdpa.MATCH_BATCH
        self.assertIn("public.place_source_ids", sql)
        self.assertIn("ids.id_kind = 'wdpa_site_pid'", sql)
        self.assertIn("ids.match_status = 'confirmed'", sql)
        self.assertIn("/ 1e6 >= 10", sql)
        self.assertIn("boundary.is_current", sql)
        self.assertNotIn("gen_random_uuid", sql)

    def test_the_importer_writes_no_old_places_column(self):
        source = MODULE_PATH.read_text()
        for old in ("place_type,", "'protected_area'", "on conflict (source_release_id, source_id)"):
            self.assertNotIn(old, source)
        self.assertIn("string_to_array(batch_place.iso3, ';')", import_wdpa.UPDATE_DETAILS)

    def test_site_rows_are_only_marked_seen(self):
        sql = import_wdpa.UPDATE_SITE_IDS
        self.assertTrue(sql.lstrip().startswith("update public.place_source_ids"))
        self.assertIn("match_status in ('confirmed', 'proposed')", sql)
        self.assertIn("'wdpa_site_id'", sql)

    def test_the_importer_never_writes_places_geom_or_a_place(self):
        source = MODULE_PATH.read_text()
        self.assertNotIn("insert into public.places", source)
        self.assertNotIn("set name = batch_place.name, geom", source)
        self.assertIn("set name = batch_place.name\n", import_wdpa.UPDATE_PLACES)
        self.assertIn("insert into public.place_boundaries", import_wdpa.INSERT_BOUNDARIES)
        self.assertIn("'approved', now(), true", import_wdpa.INSERT_BOUNDARIES)
        self.assertIn("not batch_place.same_shape", import_wdpa.SUPERSEDE_BOUNDARIES)

    def test_write_batch_refuses_a_record_without_a_stored_place(self):
        cursor = mock.MagicMock()
        cursor.fetchone.return_value = {"copied": 3, "matched": 1, "small": 1}
        with self.assertRaises(SystemExit) as raised:
            import_wdpa.write_batch(cursor, "release-id")
        self.assertIn("reconcile", str(raised.exception))
        statements = [call.args[0] for call in cursor.execute.call_args_list]
        self.assertEqual(statements, [import_wdpa.MATCH_BATCH, import_wdpa.COUNT_BATCH])

    def test_the_report_is_clean_only_for_unchanged_and_reshaped_records(self):
        source = {"source_id": "wdpca", "version_label": "October 2026"}
        manifest = {"rows_sha256": "abc"}

        def row(site_pid, klass, flags=(), candidates=()):
            return {
                "site_pid": site_pid,
                "site_id": "1",
                "class": klass,
                "place_id": None,
                "iou": None,
                "flags": list(flags),
                "candidates": list(candidates),
            }

        with tempfile.TemporaryDirectory() as tmp, mock.patch("builtins.print"):
            work = Path(tmp)
            report = import_wdpa.write_report(
                work, [row("a", "unchanged"), row("b", "reshaped")], source, manifest
            )
            self.assertTrue(report["clean"])
            report = import_wdpa.write_report(
                work, [row("a", "unchanged", flags=["site_id_changed"])], source, manifest
            )
            self.assertFalse(report["clean"])
            report = import_wdpa.write_report(
                work,
                [row("a", "unchanged"), row("c", "missing", candidates=["d"]), row("d", "new")],
                source,
                manifest,
            )
            self.assertFalse(report["clean"])
            self.assertEqual(report["counts"], {"missing": 1, "new": 1, "unchanged": 1})
            self.assertEqual(report["split_or_join"], 1)
            lines = (work / import_wdpa.REPORT_CSV).read_text().splitlines()
            self.assertEqual(lines[0], ",".join(import_wdpa.REPORT_COLUMNS))
            self.assertIn("c,1,missing,,,,d", lines)
            self.assertFalse(json.loads((work / import_wdpa.REPORT_JSON).read_text())["clean"])

    def test_write_batch_supersedes_before_it_adds_a_boundary(self):
        cursor = mock.MagicMock()
        cursor.fetchone.return_value = {"copied": 3, "matched": 2, "small": 1}
        import_wdpa.write_batch(cursor, "release-id")
        statements = [call.args[0] for call in cursor.execute.call_args_list]
        self.assertEqual(
            statements,
            [
                import_wdpa.MATCH_BATCH,
                import_wdpa.COUNT_BATCH,
                import_wdpa.UPDATE_PLACES,
                import_wdpa.SUPERSEDE_BOUNDARIES,
                import_wdpa.INSERT_BOUNDARIES,
                import_wdpa.UPDATE_DETAILS,
                import_wdpa.UPDATE_RECOGNITION_DETAILS,
                import_wdpa.UPDATE_PARCEL_IDS,
                "truncate batch_place",
            ],
        )
        self.assertEqual(cursor.execute.call_args_list[4].args[1], {"release": "release-id"})

    def test_upload_refuses_an_old_places_load(self):
        conn, _ = self._source_connection({"present": True})
        with self.assertRaises(SystemExit) as raised:
            import_wdpa.refuse_leftover_stage(conn)
        self.assertIn("places_load", str(raised.exception))

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
                        "columns": list(import_wdpa.COLUMNS),
                        "kept": 1,
                    }
                )
            )
            self.assertEqual(import_wdpa.read_manifest(work)["kept"], 1)
            (work / import_wdpa.FILTERED_NAME).write_text("a\t1\nb\t2\n")
            with self.assertRaises(SystemExit) as raised:
                import_wdpa.read_manifest(work)
            self.assertIn("manifest checksum", str(raised.exception))

    def test_a_filtered_file_with_older_columns_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            (work / import_wdpa.FILTERED_NAME).write_text("a\t1\n")
            digest = import_wdpa.file_sha256(work / import_wdpa.FILTERED_NAME)
            (work / import_wdpa.MANIFEST_NAME).write_text(
                json.dumps(
                    {"pin_sha256": import_wdpa.PINNED_SHA256, "rows_sha256": digest, "kept": 1}
                )
            )
            with self.assertRaises(SystemExit) as raised:
                import_wdpa.read_manifest(work)
            self.assertIn("older columns", str(raised.exception))

    def test_the_geometry_stays_the_last_column(self):
        self.assertEqual(import_wdpa.COLUMNS[-1], "wkb_hex")
        self.assertIn("designation_type", import_wdpa.COLUMNS)
        self.assertIn("criteria", import_wdpa.COLUMNS)
        for name in ("DESIG_TYPE", "INT_CRIT"):
            self.assertIn(name, import_wdpa.REQUIRED_FIELDS)

    def test_designation_types_are_stored_as_the_check_allows(self):
        self.assertEqual(
            set(import_wdpa.DESIGNATION_TYPES.values()),
            {"national", "regional", "international", "not_applicable"},
        )

    def test_attribute_row_reads_site_pid_type_and_criteria(self):
        row = ["pid", "site", "Name", "Ramsar", "", "ZAF", "Terrestrial", "international", "", "0101"]
        self.assertEqual(import_wdpa.attribute_row(row), ["pid", "international", None])
        row[8] = "(i)(ii)"
        self.assertEqual(import_wdpa.attribute_row(row), ["pid", "international", "(i)(ii)"])

    def test_attributes_writes_only_the_two_columns_by_the_lowest_site_pid(self):
        conservation = import_wdpa.UPDATE_CONSERVATION_ATTRIBUTES
        recognition = import_wdpa.UPDATE_RECOGNITION_ATTRIBUTES
        self.assertIn("set designation_type = matched.designation_type\n", conservation)
        self.assertIn(
            "set designation_type = matched.designation_type, criteria = matched.criteria\n",
            recognition,
        )
        for sql in (conservation, recognition):
            self.assertIn("min(own.source_record_id)", sql)
            self.assertIn("is distinct from", sql)

    def test_upload_updates_recognition_details_and_their_site_rows(self):
        sql = import_wdpa.UPDATE_RECOGNITION_DETAILS
        self.assertTrue(sql.lstrip().startswith("update public.recognition_details"))
        self.assertIn("criteria = batch_place.criteria", sql)
        self.assertIn("public.recognition_details", import_wdpa.UPDATE_SITE_IDS)
        self.assertIn("designation_type = batch_place.designation_type", import_wdpa.UPDATE_DETAILS)

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
