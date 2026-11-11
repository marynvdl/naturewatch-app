"""The reconciliation report and the boundary writes, against the local database.

Runs on an empty local database after `supabase db reset`, in one transaction
that is rolled back. Skipped when the local database is not running or already
holds places.
"""

from __future__ import annotations

import csv
import gzip
import hashlib
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest import mock

MODULE_PATH = Path(__file__).resolve().parents[1] / "import_wdpa.py"
_spec = importlib.util.spec_from_file_location("import_wdpa", MODULE_PATH)
import_wdpa = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = import_wdpa
_spec.loader.exec_module(import_wdpa)

LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# Squares about 22 km across, so every one is well over 10 km2.
A = "MULTIPOLYGON(((20 -30, 20.2 -30, 20.2 -29.8, 20 -29.8, 20 -30)))"
B = "MULTIPOLYGON(((21 -30, 21.2 -30, 21.2 -29.8, 21 -29.8, 21 -30)))"
# 2.5% taller: intersection over union about 0.976.
B_NUDGED = "MULTIPOLYGON(((21 -30, 21.2 -30, 21.2 -29.795, 21 -29.795, 21 -30)))"
C = "MULTIPOLYGON(((22 -30, 22.2 -30, 22.2 -29.8, 22 -29.8, 22 -30)))"
# Moved three quarters of its width: intersection over union about 0.14.
C_MOVED = "MULTIPOLYGON(((22.15 -30, 22.35 -30, 22.35 -29.8, 22.15 -29.8, 22.15 -30)))"
D = "MULTIPOLYGON(((23 -30, 23.2 -30, 23.2 -29.8, 23 -29.8, 23 -30)))"
D_WEST = "MULTIPOLYGON(((23 -30, 23.1 -30, 23.1 -29.8, 23 -29.8, 23 -30)))"
D_EAST = "MULTIPOLYGON(((23.1 -30, 23.2 -30, 23.2 -29.8, 23.1 -29.8, 23.1 -30)))"
FAR = "MULTIPOLYGON(((25 -30, 25.2 -30, 25.2 -29.8, 25 -29.8, 25 -30)))"
TINY = "MULTIPOLYGON(((26 -30, 26.001 -30, 26.001 -29.999, 26 -29.999, 26 -30)))"


def connect():
    import psycopg
    from psycopg.rows import dict_row

    url = os.environ.get("DATABASE_URL", LOCAL_URL)
    if "127.0.0.1" not in url and "localhost" not in url:
        raise unittest.SkipTest("only runs against the local database")
    try:
        return psycopg.connect(url, row_factory=dict_row, connect_timeout=5)
    except psycopg.OperationalError as exc:
        raise unittest.SkipTest(f"local database is not running: {exc}") from None


class ReconcileLocalTest(unittest.TestCase):
    def setUp(self):
        self.conn = connect()
        if self.conn.execute("select count(*) as n from public.places").fetchone()["n"]:
            self.conn.close()
            self.skipTest("the local database already holds places")
        self.release = import_wdpa.fetch_source(self.conn)["id"]
        self.stack = ExitStack()
        # One transaction for the whole test: the script's commits do nothing,
        # and tearDown rolls everything back.
        self.stack.enter_context(mock.patch.object(self.conn, "commit", lambda: None))
        self.stack.enter_context(mock.patch.object(self.conn, "close", lambda: None))
        self.stack.enter_context(
            mock.patch.object(import_wdpa, "open_connection", lambda *a, **k: self.conn)
        )
        self.stack.enter_context(mock.patch("builtins.print"))
        self.work = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.ids = {
            "pid-a": self.place("pid-a", "site-a", "Park A", A),
            "pid-b": self.place("pid-b", "site-b", "Park B", B),
            "pid-c": self.place("pid-c", "site-c", "Park C", C),
            "pid-d": self.place("pid-d", "site-d", "Park D", D),
        }

    def tearDown(self):
        self.stack.close()
        self.conn.rollback()
        self.conn.close()

    def place(self, pid: str, site: str, name: str, wkt: str):
        row = self.conn.execute(
            """
            insert into public.places (name, place_type_id, publication_status, geom)
            values (%s, 'conservation_area', 'published',
              extensions.ST_GeomFromText(%s, 4326)::extensions.geometry(MultiPolygon, 4326))
            returning id
            """,
            (name, wkt),
        ).fetchone()
        place_id = row["id"]
        self.conn.execute(
            """
            insert into public.conservation_area_details (
              place_id, designation, iucn_category, iso3, realm,
              source_id, source_release_id, source_record_id, source_url
            ) values (%s, 'National Park', 'II', '{ZAF}', 'Terrestrial',
              'wdpca', %s, %s, 'https://www.protectedplanet.net/' || %s)
            """,
            (place_id, self.release, site, site),
        )
        for kind, record in (("wdpa_site_pid", pid), ("wdpa_site_id", site)):
            self.conn.execute(
                """
                insert into public.place_source_ids (
                  place_id, source_id, id_kind, source_record_id, match_status,
                  first_seen_release_id, last_seen_release_id
                ) values (%s, 'wdpca', %s, %s, 'confirmed', %s, %s)
                """,
                (place_id, kind, record, self.release, self.release),
            )
        self.conn.execute(
            """
            insert into public.place_boundaries (
              place_id, version_number, geom, source_id, source_release_id,
              source_record_id, source_url, review_status, is_current
            )
            select %s, 1, places.geom, 'wdpca', %s, %s,
              'https://www.protectedplanet.net/' || %s, 'approved', true
            from public.places where places.id = %s
            """,
            (place_id, self.release, pid, site, place_id),
        )
        return place_id

    def write_file(self, records: list[tuple[str, str, str, str]]) -> None:
        rows = []
        for pid, site, name, wkt in records:
            wkb = self.conn.execute(
                "select encode(extensions.ST_AsBinary(extensions.ST_GeomFromText(%s, 4326)), 'hex') as h",
                (wkt,),
            ).fetchone()["h"]
            rows.append([pid, site, name, "National Park", "II", "ZAF", "Terrestrial", wkb])
        path = self.work / import_wdpa.FILTERED_NAME
        with gzip.open(path, "wt", newline="") as handle:
            csv.writer(handle, delimiter="\t", lineterminator="\n").writerows(rows)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        (self.work / import_wdpa.MANIFEST_NAME).write_text(
            json.dumps(
                {"pin_sha256": import_wdpa.PINNED_SHA256, "rows_sha256": digest, "kept": len(rows)}
            )
        )

    def report_rows(self) -> dict[str, dict]:
        with (self.work / import_wdpa.REPORT_CSV).open() as handle:
            return {row["site_pid"]: row for row in csv.DictReader(handle)}

    def boundaries(self) -> list[tuple]:
        return [
            (row["place_id"], row["version_number"], row["is_current"])
            for row in self.conn.execute(
                "select place_id, version_number, is_current from public.place_boundaries "
                "order by place_id, version_number"
            ).fetchall()
        ]

    def test_each_class_is_reported_and_upload_refuses(self):
        self.write_file(
            [
                ("pid-a", "site-a", "Park A", A),
                ("pid-b", "site-b", "Park B", B_NUDGED),
                ("pid-c", "site-c", "Park C", C_MOVED),
                ("pid-d-west", "site-d", "Park D West", D_WEST),
                ("pid-d-east", "site-x", "Park D East", D_EAST),
                ("pid-far", "site-far", "Far Park", FAR),
                ("pid-tiny", "site-tiny", "Tiny Park", TINY),
            ]
        )
        before = self.boundaries()
        report = import_wdpa.reconcile(self.work)
        rows = self.report_rows()

        self.assertFalse(report["clean"])
        self.assertEqual(rows["pid-a"]["class"], "unchanged")
        self.assertEqual(rows["pid-b"]["class"], "reshaped")
        self.assertGreaterEqual(float(rows["pid-b"]["iou"]), import_wdpa.RESHAPED_MIN_IOU)
        self.assertEqual(rows["pid-c"]["class"], "very_different")
        self.assertLess(float(rows["pid-c"]["iou"]), import_wdpa.RESHAPED_MIN_IOU)
        self.assertEqual(rows["pid-d-west"]["class"], "new_in_known_site")
        self.assertEqual(rows["pid-d-east"]["class"], "new")
        self.assertEqual(rows["pid-far"]["class"], "new")
        self.assertEqual(rows["pid-d"]["class"], "missing")
        self.assertEqual(rows["pid-d"]["candidates"], "pid-d-east;pid-d-west")
        self.assertNotIn("pid-tiny", rows)
        self.assertEqual(report["split_or_join"], 1)

        with self.assertRaises(SystemExit) as raised:
            import_wdpa.upload(self.work)
        self.assertIn("refusing to load", str(raised.exception))
        self.assertEqual(self.boundaries(), before)
        self.assertEqual(
            self.conn.execute(
                "select count(*) as n from public.places where name like 'Park D %'"
            ).fetchone()["n"],
            0,
        )

    def test_a_flag_makes_a_record_unclean(self):
        self.write_file(
            [
                ("pid-a", "site-moved", "Park A", A),
                ("pid-b", "site-b", "Park B", B),
                ("pid-c", "site-c", "Park C", C),
                ("pid-d", "site-d", "Park D", D),
            ]
        )
        report = import_wdpa.reconcile(self.work)
        rows = self.report_rows()
        self.assertEqual(rows["pid-a"]["class"], "unchanged")
        self.assertEqual(rows["pid-a"]["flags"], "site_id_changed")
        self.assertFalse(report["clean"])

    def test_a_clean_file_writes_a_new_version_for_a_reshaped_record(self):
        site_rows = self.conn.execute(
            "update public.place_source_ids set match_status = 'proposed', last_seen_release_id = null "
            "where id_kind = 'wdpa_site_id' and source_record_id = 'site-c' returning id"
        ).fetchall()
        self.assertEqual(len(site_rows), 1)
        self.conn.execute(
            "update public.place_source_ids set last_seen_release_id = null "
            "where id_kind = 'wdpa_site_pid'"
        )
        self.write_file(
            [
                ("pid-a", "site-a", "Park A renamed", A),
                ("pid-b", "site-b", "Park B", B_NUDGED),
                ("pid-c", "site-c", "Park C", C),
                ("pid-d", "site-d", "Park D", D),
            ]
        )
        import_wdpa.upload(self.work)
        rows = self.report_rows()
        self.assertEqual({row["class"] for row in rows.values()}, {"unchanged", "reshaped"})
        self.assertEqual(rows["pid-b"]["class"], "reshaped")

        versions = {
            pid: self.conn.execute(
                "select version_number, is_current, superseded_at is not null as superseded, "
                "review_status, source_record_id "
                "from public.place_boundaries where place_id = %s order by version_number",
                (place_id,),
            ).fetchall()
            for pid, place_id in self.ids.items()
        }
        self.assertEqual(len(versions["pid-a"]), 1)
        self.assertEqual(len(versions["pid-b"]), 2)
        old, new = versions["pid-b"]
        self.assertFalse(old["is_current"])
        self.assertTrue(old["superseded"])
        self.assertTrue(new["is_current"])
        self.assertEqual(new["version_number"], 2)
        self.assertEqual(new["review_status"], "approved")
        self.assertEqual(new["source_record_id"], "pid-b")

        names = self.conn.execute(
            "select name from public.places where id = %s", (self.ids["pid-a"],)
        ).fetchone()
        self.assertEqual(names["name"], "Park A renamed")
        # places.geom keeps the shape it had: only the boundary changed.
        self.assertTrue(
            self.conn.execute(
                "select extensions.ST_Equals(places.geom, extensions.ST_GeomFromText(%s, 4326)) as same "
                "from public.places where id = %s",
                (B, self.ids["pid-b"]),
            ).fetchone()["same"]
        )
        site_c = self.conn.execute(
            "select match_status, last_seen_release_id from public.place_source_ids "
            "where id_kind = 'wdpa_site_id' and source_record_id = 'site-c'"
        ).fetchall()
        self.assertEqual(len(site_c), 1)
        self.assertEqual(site_c[0]["match_status"], "proposed")
        self.assertEqual(site_c[0]["last_seen_release_id"], self.release)
        self.assertEqual(
            self.conn.execute(
                "select count(*) as n from public.places"
            ).fetchone()["n"],
            4,
        )

        # A second upload of the same file finds every shape unchanged.
        import_wdpa.upload(self.work)
        rows = self.report_rows()
        self.assertEqual({row["class"] for row in rows.values()}, {"unchanged"})
        self.assertEqual(
            len(
                self.conn.execute(
                    "select 1 from public.place_boundaries where place_id = %s",
                    (self.ids["pid-b"],),
                ).fetchall()
            ),
            2,
        )


if __name__ == "__main__":
    unittest.main()
