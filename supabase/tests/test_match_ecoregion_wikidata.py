"""match_ecoregion_wikidata.py: matching from a stored Wikidata response, and
load against the local database.

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
_spec = importlib.util.spec_from_file_location(
    "match_ecoregion_wikidata", ROOT / "match_ecoregion_wikidata.py"
)
match_wd = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = match_wd
_spec.loader.exec_module(match_wd)

_local = importlib.util.spec_from_file_location(
    "test_reconcile_local", Path(__file__).parent / "test_reconcile_local.py"
)
test_reconcile_local = importlib.util.module_from_spec(_local)
_local.loader.exec_module(test_reconcile_local)


def binding(qid, code, label=None, alias=None, one_earth=None, enwiki=None):
    row = {"item": {"value": f"http://www.wikidata.org/entity/{qid}"}, "code": {"value": code}}
    for key, value in (("label", label), ("alias", alias), ("oneEarth", one_earth),
                       ("enwiki", enwiki)):
        if value:
            row[key] = {"value": value}
    return row


ITEMS = match_wd.read_items({"results": {"bindings": [
    binding("Q1", "AT1315", label="Namib", alias="Namib Desert",
            one_earth="namib-desert", enwiki="https://en.wikipedia.org/wiki/Namib"),
    binding("Q2", "AT0722", label="Central Zambezian Miombo woodlands",
            one_earth="central-zambezian-wet-miombo-woodlands"),
    binding("Q3", "NA0406", label="Appalachian mixed mesophytic forests"),
    binding("Q4", "NT0701", label="Dry Chaco"),
    binding("Q5", "NT0210", label="Gran Chaco", alias="Dry Chaco"),
    binding("Q6", "OC0201", label="Fiji tropical dry forests"),
    binding("Q7", "PA1222", label="São Tomé & Príncipe forests"),
    binding("Q8", "AT0101", label="Twin forests"),
]}})


def eco(eco_id, name, eco_biome):
    return {"eco_id": eco_id, "name": name, "eco_biome": eco_biome}


class NamesTest(unittest.TestCase):
    def test_normal_name_and_slug(self):
        self.assertEqual(match_wd.normal_name("São Tomé & Príncipe  forests"),
                         "sao tome and principe forests")
        self.assertEqual(match_wd.normal_name("Alaska-St. Elias Range"), "alaska st elias range")
        self.assertEqual(match_wd.slug("Cameroon Highlands forests"), "cameroon-highlands-forests")

    def test_realms(self):
        self.assertEqual(match_wd.wwf_realm("AF07"), "AT")
        self.assertEqual(match_wd.wwf_realm("NE04"), "NA")
        self.assertEqual(match_wd.wwf_realm("NO01"), "NT")
        self.assertEqual(match_wd.wwf_realm("IN01"), "IM")
        self.assertEqual(match_wd.wwf_realm("AU01"), "AA")
        self.assertEqual(match_wd.wwf_realm("PA13"), "PA")
        self.assertEqual(match_wd.wwf_realm("OC02"), "OC")

    def test_read_items(self):
        namib = ITEMS["Q1"]
        self.assertEqual(namib["codes"], {"AT1315"})
        self.assertEqual(namib["names"], {"namib": "label", "namib desert": "alias"})
        self.assertEqual(namib["enwiki"], "https://en.wikipedia.org/wiki/Namib")


class MatchTest(unittest.TestCase):
    def run_match(self, ecoregions, hand=None):
        matches, unmatched = match_wd.match(ecoregions, ITEMS, hand or {})
        return ({m["eco_id"]: (m["wikidata_item"], m["method"]) for m in matches},
                {u["eco_id"]: u for u in unmatched})

    def test_label_alias_and_one_earth(self):
        matches, unmatched = self.run_match([
            eco("101", "Appalachian Mixed Mesophytic Forests", "NE04"),
            eco("102", "Namib desert", "AF13"),
            eco("103", "Central Zambezian wet miombo woodlands", "AF07"),
        ])
        self.assertEqual(matches, {"101": ("Q3", "label"), "102": ("Q1", "alias"),
                                   "103": ("Q2", "one_earth")})
        self.assertEqual(unmatched, {})

    def test_other_realm_and_none(self):
        matches, unmatched = self.run_match([
            eco("635", "Fiji tropical dry forests", "NO02"),
            eco("117", "Adelie Land tundra", "AN11"),
        ])
        self.assertEqual(matches, {})
        self.assertEqual(unmatched["635"]["reason"], "other_realm")
        self.assertIn("Q6 Fiji tropical dry forests (OC0201)", unmatched["635"]["candidates"])
        self.assertEqual(unmatched["117"]["reason"], "none")

    def test_ambiguous(self):
        matches, unmatched = self.run_match([
            eco("569", "Dry Chaco", "NO07"),
            eco("1", "Twin forests", "AF01"),
            eco("2", "Twin forests", "AF01"),
        ])
        self.assertEqual(matches, {})
        self.assertEqual({k: u["reason"] for k, u in unmatched.items()},
                         {"569": "ambiguous", "1": "ambiguous", "2": "ambiguous"})
        self.assertIn("Q4", unmatched["569"]["candidates"])
        self.assertIn("Q5", unmatched["569"]["candidates"])

    def test_hand_wins(self):
        hand = {"569": {"wikidata_item": "Q4", "note": ""},
                "635": {"wikidata_item": "Q6", "note": "realm differs"},
                "101": {"wikidata_item": "Q99", "note": "not a WWF item"}}
        matches, unmatched = self.run_match([
            eco("569", "Dry Chaco", "NO07"),
            eco("635", "Fiji tropical dry forests", "NO02"),
            eco("101", "Appalachian mixed mesophytic forests", "NE04"),
            eco("1", "Twin forests", "AF01"),
            eco("2", "Twin forests", "AF01"),
        ], hand)
        self.assertEqual(matches["569"], ("Q4", "hand"))
        self.assertEqual(matches["635"], ("Q6", "hand"))
        self.assertEqual(matches["101"], ("Q99", "hand"))
        self.assertEqual(set(unmatched), {"1", "2"})

    def test_hand_item_is_not_matched_again(self):
        hand = {"2": {"wikidata_item": "Q8", "note": ""}}
        matches, unmatched = self.run_match(
            [eco("1", "Twin forests", "AF01"), eco("2", "Twin forests", "AF01")], hand
        )
        self.assertEqual(matches, {"2": ("Q8", "hand")})
        self.assertEqual(unmatched["1"]["reason"], "none")

    def test_read_hand(self):
        with tempfile.TemporaryDirectory() as work:
            path = Path(work) / "hand.tsv"
            path.write_text("eco_id\twikidata_item\tnote\n569\tQ4\tDry Chaco\n\n")
            self.assertEqual(match_wd.read_hand(path),
                             {"569": {"wikidata_item": "Q4", "note": "Dry Chaco"}})
            path.write_text("eco_id\twikidata_item\tnote\n569\tDry Chaco\t\n")
            with self.assertRaises(SystemExit):
                match_wd.read_hand(path)
            self.assertEqual(match_wd.read_hand(Path(work) / "missing.tsv"), {})


class LoadLocalTest(unittest.TestCase):
    def setUp(self):
        self.conn = test_reconcile_local.connect()
        self.stack = ExitStack()
        self.stack.enter_context(mock.patch.object(self.conn, "commit", lambda: None))
        self.stack.enter_context(mock.patch.object(self.conn, "rollback", lambda: None))
        self.work = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.one = self.place("Test ecoregion one", "99991")
        self.two = self.place("Test ecoregion two", "99992")

    def tearDown(self):
        self.stack.close()
        self.conn.rollback()
        self.conn.close()

    def place(self, name: str, eco_id: str) -> str:
        place = self.conn.execute(
            "insert into public.places (name, place_type_id, publication_status) "
            "values (%s, 'ecoregion', 'published') returning id::text as id",
            (name,),
        ).fetchone()["id"]
        self.conn.execute(
            "insert into public.place_source_ids (place_id, source_id, id_kind, "
            "source_record_id, match_status) values (%s, 'resolve-ecoregions', 'eco_id', %s, "
            "'confirmed')",
            (place, eco_id),
        )
        return place

    def write(self, rows):
        with open(self.work / match_wd.OUTPUT_NAME, "w", newline="", encoding="utf-8") as out:
            writer = csv.DictWriter(out, fieldnames=match_wd.COLUMNS, delimiter="\t")
            writer.writeheader()
            for eco_id, qid in rows:
                writer.writerow({"eco_id": eco_id, "place_name": "x", "wikidata_item": qid,
                                 "method": "label", "item_label": "", "enwiki": ""})

    def stored(self):
        return self.conn.execute(
            "select place_id::text, source_record_id, match_status from public.place_source_ids "
            "where source_id = 'wikidata' and place_id in (%s, %s) order by 1",
            (self.one, self.two),
        ).fetchall()

    def test_load_once(self):
        self.write([("99991", "Q999999991"), ("99992", "Q999999992"), ("88888", "Q999999993")])
        self.assertEqual(match_wd.counts(self.conn, self.work)["add"], 2)
        first = match_wd.load(self.conn, self.work)
        self.assertEqual((first["added"], first["missing_place"]), (2, 1))
        self.assertEqual(
            [(r["source_record_id"], r["match_status"]) for r in self.stored()],
            sorted([("Q999999991", "confirmed"), ("Q999999992", "confirmed")],
                   key=lambda r: {"Q999999991": self.one, "Q999999992": self.two}[r[0]]),
        )
        second = match_wd.load(self.conn, self.work)
        self.assertEqual((second["added"], second["stored"]), (0, 2))

    def test_differs_and_taken_not_written(self):
        self.write([("99991", "Q999999991")])
        match_wd.load(self.conn, self.work)
        self.write([("99991", "Q999999995"), ("99992", "Q999999991")])
        result = match_wd.load(self.conn, self.work)
        self.assertEqual((result["added"], result["differs"], result["taken"]), (0, 1, 1))
        self.assertEqual(len(result["not_written"]), 2)
        self.assertEqual([r["source_record_id"] for r in self.stored()], ["Q999999991"])


if __name__ == "__main__":
    unittest.main()
