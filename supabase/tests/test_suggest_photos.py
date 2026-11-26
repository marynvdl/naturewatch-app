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
         description="Spray over the falls. Taken at dawn.<br>Second line", categories=None):
    name = title.removeprefix("File:").replace(" ", "_")
    meta = {"Artist": {"value": artist}, "License": {"value": licence},
            "ImageDescription": {"value": description}, "Categories": {"value": categories}}
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

    def test_range_maps_refused_for_ecoregions(self):
        for title in ("File:Ecoregion PA1219.png", "File:AT1007 map.svg",
                      "File:Ecoregions of Africa.jpg", "File:NT0303 forest.jpg"):
            self.assertTrue(suggest_photos.excluded_title(title, "ecoregion"), title)
        self.assertFalse(suggest_photos.excluded_title("File:NT0303 forest.jpg"))
        self.assertFalse(suggest_photos.excluded_title("File:Ecoregion walk.jpg"))
        for title in ("File:Namib dunes 2019.jpg", "File:IMG 20190412 1200.jpg",
                      "File:Dunes DSC01234.jpg"):
            self.assertFalse(suggest_photos.excluded_title(title, "ecoregion"), title)

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

    def test_sparql_by_item(self):
        body = {"results": {"bindings": [
            {"item": {"value": "http://www.wikidata.org/entity/Q131377"},
             "image": {"value": "http://commons.wikimedia.org/wiki/Special:FilePath/Namib.jpg"},
             "category": {"value": "Namib Desert"}},
        ]}}
        found = suggest_photos.read_sparql(body, by="item")
        self.assertEqual(found["Q131377"]["images"], ["File:Namib.jpg"])
        self.assertEqual(found["Q131377"]["categories"], ["Namib Desert"])


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
        files = infos(*[page(t) for t in ["File:P18.jpg", "File:C0.jpg", "File:C1.jpg",
                                          "File:C2.jpg", "File:S0.jpg"]])
        candidates = [("wikidata", "File:P18.jpg"), ("category", "File:C0.jpg"),
                      ("category", "File:C1.jpg"), ("search", "File:C0.jpg"),
                      ("category", "File:C2.jpg"), ("search", "File:S0.jpg")]
        rows, _ = suggest_photos.choose(SITE, candidates, files)
        self.assertEqual(suggest_photos.PER_PLACE, 3)
        self.assertEqual([r["title"] for r in rows],
                         ["File:P18.jpg", "File:C0.jpg", "File:C1.jpg"])
        self.assertEqual([r["score"] for r in rows], [1.0, 0.7, 0.69])
        # One search result at most, even with room for more.
        search = [("search", "File:C0.jpg"), ("search", "File:S0.jpg")]
        rows, _ = suggest_photos.choose(SITE, search, files)
        self.assertEqual([(r["title"], r["score"]) for r in rows], [("File:C0.jpg", 0.4)])

    def test_lead_image_after_p18(self):
        files = infos(*[page(t) for t in ["File:P18.jpg", "File:Lead.jpg", "File:C0.jpg"]])
        candidates = [("wikidata", "File:P18.jpg"), ("lead", "File:Lead.jpg"),
                      ("lead", "File:P18.jpg"), ("category", "File:C0.jpg")]
        rows, _ = suggest_photos.choose(SITE, candidates, files)
        self.assertEqual([(r["origin"], r["score"]) for r in rows],
                         [("wikidata", 1.0), ("lead", 1.0), ("category", 0.7)])

    def test_boards_and_signs_refused_by_title_or_category(self):
        files = infos(
            page("File:Entrance sign.jpg"),
            page("File:Information board at the gate.jpg"),
            page("File:Trail.jpg", categories="Information_boards_in_Kenya|Trails"),
            page("File:Dunes.jpg", categories="Pages_with_maps|Namib Desert"),
            page("File:Signal Hill.jpg"),
            page("File:Panelas falls.jpg"),
        )
        candidates = [("category", t) for t in files]
        rows, refused = suggest_photos.choose(SITE, candidates, files)
        self.assertEqual([r["title"] for r in rows],
                         ["File:Dunes.jpg", "File:Signal Hill.jpg", "File:Panelas falls.jpg"])
        self.assertEqual(refused, {"title": 2, "category": 1})

    def test_caption_is_the_first_sentence(self):
        rows, _ = suggest_photos.choose(SITE, [("category", "File:P18.jpg")],
                                        infos(page("File:P18.jpg")))
        self.assertEqual(rows[0]["alt_text"], "Spray over the falls.")
        self.assertEqual(rows[0]["caption"], "Spray over the falls.")


class LeadImageTest(unittest.TestCase):
    def test_sparql_article(self):
        body = {"results": {"bindings": [
            {"wdpa": {"value": "2010"}, "item": {"value": "http://www.wikidata.org/entity/Q1"},
             "article": {"value": "https://en.wikipedia.org/wiki/European_Atlantic_mixed_forests"}},
        ]}}
        found = suggest_photos.read_sparql(body)
        self.assertEqual(found["2010"]["articles"], ["European Atlantic mixed forests"])

    def test_lead_images_follow_redirects(self):
        body = {"query": {
            "normalized": [{"from": "a b", "to": "A b"}],
            "redirects": [{"from": "A b", "to": "A c"}],
            "pages": [
                {"title": "A c", "pageprops": {"page_image_free": "Forest_at_dawn.jpg"}},
                {"title": "No image"},
            ],
        }}
        found = suggest_photos.read_lead_images(body)
        self.assertEqual(found["a b"], "File:Forest at dawn.jpg")
        self.assertEqual(found["A c"], "File:Forest at dawn.jpg")
        self.assertNotIn("No image", found)


class ChildrenTest(unittest.TestCase):
    ECO = {"place_id": "e1", "place_type_id": "ecoregion", "name": "Forests", "eco_id": "7"}

    def photo(self, child, image, title=None):
        return {"child_id": child, "child_name": child.upper(), "image_id": image,
                "source_record_id": title, "alt_text": f"Alt {image}", "caption": None}

    def test_first_of_each_place_then_the_rest(self):
        photos = [self.photo("a", "a1", "File:A1.jpg"), self.photo("a", "a2"),
                  self.photo("b", "b1"), self.photo("c", "c1", "File:Taken.jpg"),
                  self.photo("d", "a1", "File:A1.jpg")]
        rows = suggest_photos.choose_children(self.ECO, photos, {"File:Taken.jpg"})
        self.assertEqual([(r["from_place_id"], r["image_id"]) for r in rows],
                         [("a", "a1"), ("b", "b1"), ("a", "a2")])
        self.assertEqual([r["score"] for r in rows], [0.8, 0.79, 0.78])
        self.assertEqual({r["origin"] for r in rows}, {"child"})
        self.assertEqual(rows[1]["title"], "")


class WithdrawTest(unittest.TestCase):
    def link(self, place, title, score, type_id="ecoregion"):
        return {"place_id": place, "image_id": title, "place_type_id": type_id,
                "place_name": place, "title": title, "score": score}

    def test_rules_of_version_2(self):
        links = [
            self.link("p", "File:P18.jpg", 1.0),
            self.link("p", "File:Park map.jpg", 0.7),
            self.link("p", "File:Board.jpg", 0.69),
            self.link("p", "File:S1.jpg", 0.4),
            self.link("p", "File:S2.jpg", 0.39),
            self.link("q", "File:Q1.jpg", 0.4),
        ]
        files = infos(page("File:Board.jpg", categories="Interpretive boards"),
                      page("File:S1.jpg"), page("File:S2.jpg"), page("File:Q1.jpg"))
        found = suggest_photos.to_withdraw(links, files)
        self.assertEqual([(l["title"], reason) for l, reason in found],
                         [("File:Park map.jpg", "title"), ("File:Board.jpg", "category"),
                          ("File:S2.jpg", "search")])


class FakeClient:
    """Answers from stored responses: Wikidata by the request's form, Commons
    by its list or prop."""

    def __init__(self, files):
        self.files = files
        self.requests = 0
        self.asked: list[dict] = []

    def get(self, url, params):
        self.requests += 1
        self.asked.append(params)
        if url == suggest_photos.WIKIDATA_SPARQL:
            query = params["query"]
            bindings = []
            if "wd:Q131377" in query:
                bindings.append({
                    "item": {"value": "http://www.wikidata.org/entity/Q131377"},
                    "image": {"value": "http://commons.wikimedia.org/wiki/Special:FilePath/"
                                       "Ecoregion%20AT1315.png"},
                    "category": {"value": "Namib Desert"},
                    "article": {"value": "https://en.wikipedia.org/wiki/Namib_desert"},
                })
            return {"results": {"bindings": bindings}}
        if url == suggest_photos.WIKIPEDIA_API:
            return {"query": {"pages": [
                {"title": "Namib desert", "pageprops": {"page_image_free": "Namib_lead.jpg"}},
            ]}}
        if params.get("list") == "categorymembers":
            return {"query": {"categorymembers": [{"title": "File:Namib dunes.jpg"}]}}
        if params.get("list") == "search":
            return {"query": {"search": [{"title": "File:Search result.jpg"}]}}
        titles = params["titles"].split("|")
        return {"query": {"pages": [self.files[t] for t in titles if t in self.files]}}


class FakeConn:
    def __init__(self, places):
        self.places = places

    def execute(self, query, params=None):
        if query == suggest_photos.CHILDREN:
            rows = self.places.get(query, [])
        elif "place_type_id = '" in query:
            rows = self.places.get(query, [])
        else:
            rows = [{"id": l} for l in LICENCES]
        return mock.Mock(fetchall=lambda: rows)

    def rollback(self):
        pass


class FetchEcoregionTest(unittest.TestCase):
    def fetch(self, eco, children=()):
        files = {t: page(t) for t in ("File:Ecoregion AT1315.png", "File:Namib dunes.jpg",
                                      "File:Search result.jpg", "File:Namib lead.jpg")}
        client = FakeClient(files)
        conn = FakeConn({suggest_photos.ECOREGIONS: [eco],
                         suggest_photos.CHILDREN: list(children)})
        with tempfile.TemporaryDirectory() as work:
            stats = suggest_photos.fetch(conn, Path(work), client, place_types=("ecoregion",))
            with open(Path(work) / suggest_photos.OUTPUT_NAME, encoding="utf-8") as source:
                rows = list(csv.DictReader(source, delimiter="\t"))
        return stats, rows, client

    def test_ecoregion_by_item(self):
        stats, rows, client = self.fetch({
            "place_id": "p1", "place_type_id": "ecoregion", "name": "Namib desert",
            "site_id": None, "eco_id": "101", "wikidata_item": "Q131377",
        })
        self.assertEqual([(r["origin"], r["title"]) for r in rows],
                         [("lead", "File:Namib lead.jpg"),
                          ("category", "File:Namib dunes.jpg"),
                          ("search", "File:Search result.jpg")])
        self.assertEqual({r["eco_id"] for r in rows}, {"101"})
        self.assertEqual({r["place_type_id"] for r in rows}, {"ecoregion"})
        self.assertEqual(stats["ecoregion"]["refused"], {"title": 1})
        self.assertEqual(stats["ecoregion"]["with_item"], 1)
        # No WDPA query: the ecoregion is read by its item id only.
        self.assertFalse(any("P809" in a.get("query", "") for a in client.asked))

    def test_ecoregion_gets_photos_of_places_inside(self):
        child = {"ecoregion_id": "p1", "child_id": "c1", "child_name": "Gobabeb",
                 "image_id": "i1", "source_id": "wikimedia-commons",
                 "source_record_id": "File:Gobabeb.jpg", "alt_text": "A station",
                 "caption": None, "subject_coverage": 1.0}
        stats, rows, _ = self.fetch({
            "place_id": "p1", "place_type_id": "ecoregion", "name": "Namib desert",
            "site_id": None, "eco_id": "101", "wikidata_item": "Q131377",
        }, [child])
        self.assertEqual(len(rows), 4)
        self.assertEqual((rows[3]["origin"], rows[3]["image_id"], rows[3]["from_place_id"]),
                         ("child", "i1", "c1"))
        self.assertEqual(stats["ecoregion"]["kept"]["child"], 1)

    def test_ecoregion_without_item_uses_search(self):
        stats, rows, client = self.fetch({
            "place_id": "p2", "place_type_id": "ecoregion", "name": "Adelie Land tundra",
            "site_id": None, "eco_id": "117", "wikidata_item": None,
        })
        self.assertEqual([r["origin"] for r in rows], ["search"])
        self.assertEqual(stats["ecoregion"]["with_item"], 0)
        self.assertFalse(any(a.get("list") == "categorymembers" for a in client.asked))


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

    def test_load_purges_old_rejections_and_keeps_them_refused(self):
        self.write([self.row(self.falls, "File:Test refused.jpg")])
        suggest_photos.load(self.conn, self.work)
        self.conn.execute(
            """
            update public.place_images set status = 'rejected',
              reviewed_at = now() - interval '31 days'
            where place_id = %s
            """,
            (self.falls,),
        )
        result = suggest_photos.load(self.conn, self.work)
        self.assertEqual(result["purged"]["links_deleted"], 1)
        self.assertEqual(result["purged"]["refusals_added"], 1)
        self.assertEqual((result["refused"], result["links_added"]), (1, 0))
        self.assertEqual(self.links(), [])
        self.assertEqual(suggest_photos.counts(self.conn, self.work)["refused"], 1)

    def test_ecoregion_row_found_by_eco_id(self):
        place = self.conn.execute(
            "insert into public.places (name, place_type_id, publication_status) "
            "values ('Test ecoregion', 'ecoregion', 'published') returning id::text as id"
        ).fetchone()["id"]
        self.conn.execute(
            "insert into public.place_source_ids (place_id, source_id, id_kind, "
            "source_record_id, match_status) values (%s, 'resolve-ecoregions', 'eco_id', "
            "'99999', 'confirmed')",
            (place,),
        )
        eco = {"place_id": "00000000-0000-0000-0000-00000000beef", "place_type_id": "ecoregion",
               "eco_id": "99999", "name": "Test ecoregion"}
        rows, _ = suggest_photos.choose(eco, [("search", "File:Test eco.jpg")],
                                        infos(page("File:Test eco.jpg")))
        self.write(rows)
        self.assertEqual(suggest_photos.counts(self.conn, self.work)["would_add"], 1)
        self.assertEqual(suggest_photos.load(self.conn, self.work)["links_added"], 1)
        linked = self.conn.execute(
            "select count(*) as n from public.place_images where place_id = %s and status = "
            "'suggested'", (place,)
        ).fetchone()["n"]
        self.assertEqual(linked, 1)
        self.assertEqual(suggest_photos.load(self.conn, self.work)["links_added"], 0)

    def test_child_photo_names_its_place(self):
        self.write([self.row(self.falls, "File:Test child.jpg")])
        suggest_photos.load(self.conn, self.work)
        image = self.conn.execute(
            "select id::text from public.images where source_record_id = 'File:Test child.jpg'"
        ).fetchone()["id"]
        row = {**{c: "" for c in suggest_photos.COLUMNS}, "place_id": self.gorge,
               "origin": "child", "title": "File:Test child.jpg", "score": 0.8,
               "alt_text": "A view", "image_id": image, "from_place_id": self.falls}
        self.write([row])
        self.assertEqual(suggest_photos.counts(self.conn, self.work)["would_add"], 1)
        result = suggest_photos.load(self.conn, self.work)
        self.assertEqual((result["images_added"], result["links_added"]), (0, 1))
        link = self.conn.execute(
            "select suggested_from_place_id::text as source, status from public.place_images "
            "where place_id = %s", (self.gorge,)
        ).fetchone()
        self.assertEqual((link["source"], link["status"]), (self.falls, "suggested"))
        self.assertEqual(suggest_photos.load(self.conn, self.work)["already_linked"], 1)

    def test_withdraw_writes_only_with_write(self):
        self.write([
            self.row(self.falls, "File:Test search 1.jpg", 0.4),
            self.row(self.falls, "File:Test search 2.jpg", 0.39),
            {**self.row(self.falls, "File:Test entrance.jpg", 0.7),
             "title": "File:Test entrance sign.jpg"},
        ])
        suggest_photos.load(self.conn, self.work)
        self.conn.execute(
            "update public.place_images set suggested_by_pipeline = %s where place_id = %s",
            (suggest_photos.OLD_PIPELINE, self.falls),
        )
        client = FakeClient({})
        with mock.patch.object(suggest_photos, "OLD_SUGGESTIONS", suggest_photos.OLD_SUGGESTIONS
                               .replace("where place_images.status", "where place_images.place_id = '"
                                        + self.falls + "' and place_images.status")):
            read = suggest_photos.withdraw(self.conn, self.work, client=client)
            self.assertEqual((read["withdraw"], read["by_reason"]),
                             (2, {"title": 1, "search": 1}))
            self.assertEqual({l["status"] for l in self.links()}, {"suggested"})
            written = suggest_photos.withdraw(self.conn, self.work, write=True, client=client)
        self.assertEqual(written["withdrawn"], 2)
        statuses = {l["source_record_id"]: l["status"] for l in self.links()}
        self.assertEqual(statuses, {"File:Test search 1.jpg": "suggested",
                                    "File:Test search 2.jpg": "withdrawn",
                                    "File:Test entrance sign.jpg": "withdrawn"})

    def test_missing_place_is_skipped(self):
        self.write([self.row("00000000-0000-0000-0000-00000000dead", "File:Test x.jpg")])
        result = suggest_photos.load(self.conn, self.work)
        self.assertEqual(result["missing_place"], 1)
        self.assertEqual(result["links_added"], 0)


if __name__ == "__main__":
    unittest.main()
