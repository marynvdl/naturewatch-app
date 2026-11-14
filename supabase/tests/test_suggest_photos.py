"""suggest_photos.py: choosing files from stored Wikidata and Commons responses,
and load against the local database.

The load test runs in one transaction that is rolled back. It is skipped when
the local database is not running.
"""

from __future__ import annotations

import csv
import importlib.util
import sys
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("suggest_photos", ROOT / "suggest_photos.py")
suggest_photos = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = suggest_photos
_spec.loader.exec_module(suggest_photos)

_local = importlib.util.spec_from_file_location(
    "test_reconcile_local", Path(__file__).parent / "test_reconcile_local.py"
)
test_reconcile_local = importlib.util.module_from_spec(_local)
_local.loader.exec_module(test_reconcile_local)

LICENCES = {
    "cc0-1.0", "public-domain", "cc-by-2.0", "cc-by-2.5", "cc-by-3.0", "cc-by-4.0",
    "cc-by-sa-2.0", "cc-by-sa-2.5", "cc-by-sa-3.0", "cc-by-sa-4.0",
}
SITE = {"place_id": "00000000-0000-0000-0000-000000000001", "site_id": "2010", "name": "Falls"}


def page(title, width=2000, mime="image/jpeg", licence="cc-by-sa-4.0",
         artist='<a href="//commons.wikimedia.org/wiki/User:Ann">Ann &amp; Bo</a>',
         description="Spray over the falls. Taken at dawn.<br>Second line"):
    name = title.removeprefix("File:").replace(" ", "_")
    meta = {"Artist": {"value": artist}, "License": {"value": licence},
            "ImageDescription": {"value": description}}
    return {
        "title": title,
        "imageinfo": [{
            "url": f"https://upload.wikimedia.org/wikipedia/commons/a/ab/{name}?utm=x",
            "descriptionurl": f"https://commons.wikimedia.org/wiki/File:{name}",
            "width": width, "height": width // 2, "mime": mime,
            "extmetadata": {k: v for k, v in meta.items() if v["value"] is not None},
        }],
    }


def infos(*pages):
    return suggest_photos.read_imageinfo({"query": {"pages": list(pages)}}, LICENCES)


class TextTest(unittest.TestCase):
    def test_plain_text(self):
        self.assertEqual(suggest_photos.plain_text('<a href="x">Ann &amp;  Bo</a>'), "Ann & Bo")
        self.assertEqual(suggest_photos.plain_text(None), "")

    def test_caption_stops_at_line_break_and_length(self):
        self.assertEqual(
            suggest_photos.commons_caption("Spray. Dawn.<br/>Second"), "Spray. Dawn."
        )
        long = suggest_photos.commons_caption("word " * 100)
        self.assertLessEqual(len(long), 300)
        self.assertTrue(long.endswith("word…"))

    def test_alt_text_first_sentence_or_file_name(self):
        self.assertEqual(
            suggest_photos.alt_text("File:A.jpg", "Spray over the falls. Taken at dawn."),
            "Spray over the falls.",
        )
        self.assertEqual(
            suggest_photos.alt_text("File:Victoria_Falls_2019.jpeg", ""), "Victoria Falls 2019"
        )
        self.assertEqual(suggest_photos.alt_text("File:B.png", "<br>"), "B")
        self.assertEqual(
            suggest_photos.alt_text("File:C.jpg", "View of approx. 360 degrees. Dusk."),
            "View of approx. 360 degrees.",
        )

    def test_licence_mapping(self):
        self.assertEqual(suggest_photos.commons_licence_id("CC-BY-SA-4.0", LICENCES), "cc-by-sa-4.0")
        self.assertEqual(suggest_photos.commons_licence_id("pd", LICENCES), "public-domain")
        self.assertEqual(suggest_photos.commons_licence_id("cc0", LICENCES), "cc0-1.0")
        self.assertIsNone(suggest_photos.commons_licence_id("cc-by-nc-2.0", LICENCES))
        self.assertIsNone(suggest_photos.commons_licence_id("cc-by-sa-3.0-de", LICENCES))
        self.assertIsNone(suggest_photos.commons_licence_id(None, LICENCES))

    def test_excluded_titles(self):
        self.assertTrue(suggest_photos.excluded_title("File:Falls locator map.png"))
        self.assertTrue(suggest_photos.excluded_title("File:Flag_of_Zambia.png"))
        self.assertFalse(suggest_photos.excluded_title("File:Mapungubwe hill.jpg"))
        self.assertFalse(suggest_photos.excluded_title("File:Flagstaff ridge.jpg"))

    def test_normal_title_from_p18(self):
        self.assertEqual(
            suggest_photos.normal_title(
                "http://commons.wikimedia.org/wiki/Special:FilePath/Victoria%20Falls_1.jpg"
            ),
            "File:Victoria Falls 1.jpg",
        )


class ReadTest(unittest.TestCase):
    def test_imageinfo(self):
        files = infos(page("File:Falls.jpg"), {"title": "File:Gone.jpg", "missing": True})
        self.assertEqual(list(files), ["File:Falls.jpg"])
        falls = files["File:Falls.jpg"]
        self.assertEqual(falls.creator, "Ann & Bo")
        self.assertEqual(falls.licence_id, "cc-by-sa-4.0")
        self.assertEqual(falls.file_url, "https://upload.wikimedia.org/wikipedia/commons/a/ab/Falls.jpg")
        self.assertEqual(falls.page_url, "https://commons.wikimedia.org/wiki/File:Falls.jpg")

    def test_sparql(self):
        body = {"results": {"bindings": [
            {"wdpa": {"value": "2010"}, "item": {"value": "http://www.wikidata.org/entity/Q1"},
             "image": {"value": "http://commons.wikimedia.org/wiki/Special:FilePath/Falls%201.jpg"},
             "category": {"value": "Victoria Falls"}},
            {"wdpa": {"value": "2010"}, "item": {"value": "http://www.wikidata.org/entity/Q1"},
             "image": {"value": "http://commons.wikimedia.org/wiki/Special:FilePath/Falls%201.jpg"},
             "category": {"value": "Mosi-oa-Tunya"}},
            {"wdpa": {"value": "3000"}, "item": {"value": "http://www.wikidata.org/entity/Q2"}},
        ]}}
        found = suggest_photos.read_sparql(body)
        self.assertEqual(found["2010"]["images"], ["File:Falls 1.jpg"])
        self.assertEqual(found["2010"]["categories"], ["Victoria Falls", "Mosi-oa-Tunya"])
        self.assertEqual(found["3000"]["images"], [])


class ChooseTest(unittest.TestCase):
    def test_filters(self):
        files = infos(
            page("File:Good.jpg"),
            page("File:Small.jpg", width=999),
            page("File:Drawing.svg", mime="image/svg+xml"),
            page("File:Gif.gif", mime="image/gif"),
            page("File:Nc.jpg", licence="cc-by-nc-4.0"),
            page("File:Nobody.jpg", artist=None),
            page("File:Park map.jpg"),
            page("File:Webp.webp", mime="image/webp"),
        )
        candidates = [("category", t) for t in [
            "File:Good.jpg", "File:Small.jpg", "File:Drawing.svg", "File:Gif.gif",
            "File:Nc.jpg", "File:Nobody.jpg", "File:Park map.jpg", "File:Missing.jpg",
            "File:Webp.webp",
        ]]
        rows, refused = suggest_photos.choose(SITE, candidates, files)
        self.assertEqual([r["title"] for r in rows], ["File:Good.jpg", "File:Webp.webp"])
        self.assertEqual(refused, {"small": 1, "type": 2, "licence": 1, "creator": 1,
                                   "title": 1, "missing": 1})

    def test_order_cap_and_scores(self):
        titles = [f"File:C{i}.jpg" for i in range(10)] + [f"File:S{i}.jpg" for i in range(5)]
        files = infos(page("File:P18.jpg"), *[page(t) for t in titles])
        candidates = (
            [("wikidata", "File:P18.jpg")]
            + [("category", t) for t in titles[:10]]
            + [("search", "File:C0.jpg")]
            + [("search", t) for t in titles[10:]]
        )
        rows, _ = suggest_photos.choose(SITE, candidates, files)
        self.assertEqual(len(rows), suggest_photos.PER_PLACE)
        self.assertEqual(rows[0]["title"], "File:P18.jpg")
        self.assertEqual(rows[0]["score"], 1.0)
        self.assertEqual([r["score"] for r in rows[1:3]], [0.7, 0.69])
        self.assertEqual(rows[10]["score"], 0.61)
        # C0 is not repeated by the search; the search adds its own files after.
        self.assertEqual([r["title"] for r in rows[11:]], ["File:S0.jpg"])
        self.assertEqual(rows[11]["score"], 0.4)
        self.assertEqual(rows[1]["alt_text"], "Spray over the falls.")
        self.assertEqual(rows[1]["caption"], "Spray over the falls. Taken at dawn.")


class LoadLocalTest(unittest.TestCase):
    def setUp(self):
        self.conn = test_reconcile_local.connect()
        self.stack = ExitStack()
        self.stack.enter_context(mock.patch.object(self.conn, "commit", lambda: None))
        self.stack.enter_context(mock.patch.object(self.conn, "rollback", lambda: None))
        self.work = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.falls = self.place("Test Falls")
        self.gorge = self.place("Test Gorge")

    def tearDown(self):
        self.stack.close()
        self.conn.rollback()
        self.conn.close()

    def place(self, name: str) -> str:
        return self.conn.execute(
            "insert into public.places (name, place_type_id, publication_status) "
            "values (%s, 'world_heritage_site', 'published') returning id::text as id",
            (name,),
        ).fetchone()["id"]

    def write(self, rows: list[dict]) -> None:
        with open(self.work / suggest_photos.OUTPUT_NAME, "w", newline="", encoding="utf-8") as out:
            writer = csv.DictWriter(out, fieldnames=suggest_photos.COLUMNS, delimiter="\t")
            writer.writeheader()
            writer.writerows(rows)

    def row(self, place_id: str, title: str, score: float = 0.7) -> dict:
        site = {"place_id": place_id, "site_id": "1", "name": "Test"}
        files = infos(page(title))
        rows, _ = suggest_photos.choose(site, [("category", title)], files)
        rows[0]["score"] = score
        return rows[0]

    def links(self):
        return self.conn.execute(
            """
            select place_images.place_id::text, images.source_record_id, place_images.status,
              place_images.suggested_by_pipeline, place_images.suggestion_score,
              place_images.alt_text, images.uploaded_by
            from public.place_images join public.images on images.id = place_images.image_id
            where place_images.place_id in (%s, %s)
            order by 1, 2
            """,
            (self.falls, self.gorge),
        ).fetchall()

    def test_load_once_and_shared(self):
        self.write([
            self.row(self.falls, "File:Test shared 1.jpg"),
            self.row(self.gorge, "File:Test shared 1.jpg", 0.4),
            self.row(self.falls, "File:Test only 2.jpg"),
        ])
        before = suggest_photos.counts(self.conn, self.work)
        self.assertEqual(before["would_add"], 3)
        first = suggest_photos.load(self.conn, self.work)
        self.assertEqual(first["images_added"], 2)
        self.assertEqual(first["links_added"], 3)
        links = self.links()
        self.assertEqual(len(links), 3)
        for link in links:
            self.assertEqual(link["status"], "suggested")
            self.assertEqual(link["suggested_by_pipeline"], suggest_photos.PIPELINE)
            self.assertIsNone(link["uploaded_by"])
            self.assertEqual(link["alt_text"], "Spray over the falls.")
        self.assertEqual(
            sorted(l["suggestion_score"] for l in links), [0.4, 0.7, 0.7]
        )

        self.conn.execute(
            """
            update public.place_images set status = 'rejected'
            where place_id = %s and image_id = (
              select id from public.images where source_record_id = 'File:Test only 2.jpg')
            """,
            (self.falls,),
        )
        self.assertEqual(suggest_photos.counts(self.conn, self.work)["already_linked"], 3)
        second = suggest_photos.load(self.conn, self.work)
        self.assertEqual((second["images_added"], second["links_added"]), (0, 0))
        self.assertEqual(second["already_linked"], 3)
        statuses = {(l["place_id"], l["source_record_id"]): l["status"] for l in self.links()}
        self.assertEqual(statuses[(self.falls, "File:Test only 2.jpg")], "rejected")

    def test_missing_place_is_skipped(self):
        self.write([self.row("00000000-0000-0000-0000-00000000dead", "File:Test x.jpg")])
        result = suggest_photos.load(self.conn, self.work)
        self.assertEqual(result["missing_place"], 1)
        self.assertEqual(result["links_added"], 0)


if __name__ == "__main__":
    unittest.main()
