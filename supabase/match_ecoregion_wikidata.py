#!/usr/bin/env python3
"""Match each published ecoregion to its Wikidata item (Ecoregions task 06).

  fetch   Read-only on the database. Read the published ecoregions with their
          ECO_ID and realm and biome code (ECO_BIOME_). One Wikidata query reads
          every item with a WWF ecoregion code (P1294), with its English label
          and aliases, its One Earth ecoregion ID (P12161), and its English
          Wikipedia article. An ecoregion matches an item when its name equals
          the label or an alias, or else its name as a slug equals the One Earth
          ID, and one of the item's codes is in the ecoregion's realm. Several
          items for one ecoregion, or one item for several, are ambiguous and
          left unmatched. The hand-match file ecoregion_wikidata.tsv beside this
          script wins over the automatic match. Writes ecoregion_wikidata.tsv and
          ecoregion_wikidata_unmatched.tsv to the work directory.
  counts  Read-only. How many matches load would add, how many are stored
          already, and how many differ from a stored match.
  load    Insert each match as a confirmed wikidata / wikidata_item row of
          place_source_ids, in one transaction. A stored match is left as it is.
          A match that differs from a stored one is reported, not written.

Rows are keyed on ECO_ID, not the place id, so a file fetched from one database
loads into another.

The connection is the importer's: DATABASE_URL for the local database, or
SUPABASE_ACCESS_TOKEN for a short-lived hosted login role. The work directory
is WDPA_WORK_DIR. The User-Agent is suggest_photos.py's.
"""

from __future__ import annotations

import csv
import importlib.util
import json
import re
import sys
import unicodedata
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "suggest_photos", Path(__file__).resolve().parent / "suggest_photos.py"
)
suggest_photos = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = suggest_photos
_spec.loader.exec_module(suggest_photos)
import_wdpa = suggest_photos.import_wdpa

SOURCE_ID = "wikidata"
ID_KIND = "wikidata_item"
HAND_FILE = Path(__file__).resolve().parent / "ecoregion_wikidata.tsv"
HAND_COLUMNS = ("eco_id", "wikidata_item", "note")
OUTPUT_NAME = "ecoregion_wikidata.tsv"
UNMATCHED_NAME = "ecoregion_wikidata_unmatched.tsv"
CACHE_NAME = "match_ecoregion_wikidata_cache"
COLUMNS = ("eco_id", "place_name", "wikidata_item", "method", "item_label", "enwiki")
UNMATCHED_COLUMNS = ("eco_id", "place_name", "eco_biome", "reason", "candidates")
# RESOLVE's realm codes, as the first two letters of a WWF ecoregion code.
WWF_REALMS = {"AF": "AT", "NE": "NA", "NO": "NT", "IN": "IM", "AU": "AA"}

ECOREGIONS = """
select ids.source_record_id as eco_id,
  places.name,
  details.source_attributes->>'ECO_BIOME_' as eco_biome
from public.places
join public.place_source_ids as ids
  on ids.place_id = places.id
  and ids.source_id = 'resolve-ecoregions'
  and ids.id_kind = 'eco_id'
  and ids.match_status = 'confirmed'
join public.ecoregion_details as details on details.place_id = places.id
where places.place_type_id = 'ecoregion'
  and places.publication_status = 'published'
order by ids.source_record_id::integer
"""

ITEMS_QUERY = """
SELECT ?item ?code ?label ?alias ?oneEarth ?enwiki WHERE {
  ?item wdt:P1294 ?code .
  OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label) = "en") }
  OPTIONAL { ?item skos:altLabel ?alias FILTER(LANG(?alias) = "en") }
  OPTIONAL { ?item wdt:P12161 ?oneEarth }
  OPTIONAL { ?enwiki schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
}
"""


# --- matching ----------------------------------------------------------------


def normal_name(name: str) -> str:
    """Lower case ASCII words: accents dropped, `&` read as `and`."""
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", text.replace("&", " and ")).strip()


def slug(name: str) -> str:
    return normal_name(name).replace(" ", "-")


def wwf_realm(eco_biome: str) -> str:
    realm = (eco_biome or "")[:2].upper()
    return WWF_REALMS.get(realm, realm)


def read_items(body: dict) -> dict[str, dict]:
    """Per item id: its codes, label, names (label and aliases, normalised),
    One Earth ids, and English Wikipedia article."""
    items: dict[str, dict] = {}
    for binding in (body.get("results") or {}).get("bindings") or []:
        qid = binding["item"]["value"].rsplit("/", 1)[-1]
        item = items.setdefault(
            qid, {"codes": set(), "label": "", "names": {}, "one_earth": set(), "enwiki": ""}
        )
        value = lambda key: (binding.get(key) or {}).get("value")  # noqa: E731
        item["codes"].add(value("code").upper())
        if value("label"):
            item["label"] = value("label")
            item["names"][normal_name(value("label"))] = "label"
        if value("alias"):
            item["names"].setdefault(normal_name(value("alias")), "alias")
        if value("oneEarth"):
            item["one_earth"].add(value("oneEarth"))
        if value("enwiki"):
            item["enwiki"] = value("enwiki")
    return items


def read_hand(path: Path = HAND_FILE) -> dict[str, dict]:
    """The hand matches by ECO_ID. A missing file has none."""
    if not path.exists():
        return {}
    with open(path, newline="", encoding="utf-8") as source:
        rows = [r for r in csv.DictReader(source, delimiter="\t") if (r.get("eco_id") or "").strip()]
    hand: dict[str, dict] = {}
    for row in rows:
        eco_id = row["eco_id"].strip()
        qid = (row.get("wikidata_item") or "").strip()
        if not re.fullmatch(r"Q[1-9][0-9]*", qid):
            raise SystemExit(f"{path.name}: ECO_ID {eco_id} has no item id like Q123")
        if eco_id in hand:
            raise SystemExit(f"{path.name}: ECO_ID {eco_id} is in the file twice")
        hand[eco_id] = {"wikidata_item": qid, "note": (row.get("note") or "").strip()}
    return hand


def candidates(ecoregion: dict, items: dict[str, dict]) -> tuple[dict[str, str], dict[str, str]]:
    """Items whose name or One Earth id matches, as {item: method}: those in the
    ecoregion's realm, and those in another realm."""
    name = normal_name(ecoregion["name"])
    found = {q: i["names"][name] for q, i in items.items() if name in i["names"]}
    if not found:
        key = slug(ecoregion["name"])
        found = {q: "one_earth" for q, i in items.items() if key in i["one_earth"]}
    realm = wwf_realm(ecoregion["eco_biome"])
    inside = {q: m for q, m in found.items() if any(c[:2] == realm for c in items[q]["codes"])}
    return inside, {q: m for q, m in found.items() if q not in inside}


def match(
    ecoregions: list[dict], items: dict[str, dict], hand: dict[str, dict]
) -> tuple[list[dict], list[dict]]:
    """The matches and the unmatched, both in ECO_ID order."""
    found: dict[str, tuple[str, dict[str, str], dict[str, str]]] = {}
    for eco in ecoregions:
        inside, outside = candidates(eco, items)
        found[eco["eco_id"]] = (eco, inside, outside)

    by_hand = {row["wikidata_item"] for row in hand.values()}
    # An item that several ecoregions match automatically is ambiguous for each.
    users: dict[str, int] = {}
    for eco_id, (_, inside, _) in found.items():
        if eco_id in hand:
            continue
        for qid in inside:
            users[qid] = users.get(qid, 0) + 1

    matches: list[dict] = []
    unmatched: list[dict] = []
    for eco_id, (eco, inside, outside) in found.items():
        row = {"eco_id": eco_id, "place_name": eco["name"]}
        if eco_id in hand:
            qid = hand[eco_id]["wikidata_item"]
            item = items.get(qid, {})
            matches.append({**row, "wikidata_item": qid, "method": "hand",
                            "item_label": item.get("label", ""), "enwiki": item.get("enwiki", "")})
            continue
        free = {q: m for q, m in inside.items() if q not in by_hand}
        if len(free) == 1 and users[next(iter(free))] == 1:
            qid, method = next(iter(free.items()))
            matches.append({**row, "wikidata_item": qid, "method": method,
                            "item_label": items[qid]["label"], "enwiki": items[qid]["enwiki"]})
            continue
        shown = free or outside
        reason = "ambiguous" if free else ("other_realm" if outside else "none")
        unmatched.append({
            **row,
            "eco_biome": eco["eco_biome"],
            "reason": reason,
            "candidates": "; ".join(
                f"{q} {items[q]['label']} ({', '.join(sorted(items[q]['codes']))})"
                for q in sorted(shown)
            ),
        })
    return matches, unmatched


# --- commands ----------------------------------------------------------------


def write_tsv(path: Path, columns: tuple[str, ...], rows: list[dict]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as out:
        writer = csv.DictWriter(out, fieldnames=columns, delimiter="\t")
        writer.writeheader()
        writer.writerows(rows)


def fetch(conn, work: Path, client=None) -> dict:
    ecoregions = conn.execute(ECOREGIONS).fetchall()
    conn.rollback()
    client = client or suggest_photos.Client(work / CACHE_NAME)
    body = client.get(suggest_photos.WIKIDATA_SPARQL, {"query": ITEMS_QUERY, "format": "json"})
    items = read_items(body)
    matches, unmatched = match(ecoregions, items, read_hand())
    write_tsv(work / OUTPUT_NAME, COLUMNS, matches)
    write_tsv(work / UNMATCHED_NAME, UNMATCHED_COLUMNS, unmatched)
    by_method: dict[str, int] = {}
    for row in matches:
        by_method[row["method"]] = by_method.get(row["method"], 0) + 1
    by_reason: dict[str, int] = {}
    for row in unmatched:
        by_reason[row["reason"]] = by_reason.get(row["reason"], 0) + 1
    return {
        "ecoregions": len(ecoregions), "items": len(items), "matched": len(matches),
        "by_method": by_method, "unmatched": len(unmatched), "by_reason": by_reason,
        "with_enwiki": sum(1 for r in matches if r["enwiki"]), "requests": client.requests,
    }


def read_output(work: Path) -> list[dict]:
    path = work / OUTPUT_NAME
    if not path.exists():
        raise SystemExit(f"{path} is missing: run fetch first")
    with open(path, newline="", encoding="utf-8") as source:
        return list(csv.DictReader(source, delimiter="\t"))


STATE = """
select places.id::text as place_id,
  (select source_record_id from public.place_source_ids
   where place_id = places.id and source_id = %(source)s and id_kind = %(kind)s
     and match_status = 'confirmed'
   limit 1) as stored,
  (select place_id::text from public.place_source_ids
   where source_id = %(source)s and id_kind = %(kind)s and source_record_id = %(item)s
     and match_status = 'confirmed'
   limit 1) as item_place
from public.place_source_ids as ids
join public.places on places.id = ids.place_id
where ids.source_id = 'resolve-ecoregions' and ids.id_kind = 'eco_id'
  and ids.match_status = 'confirmed' and ids.source_record_id = %(eco_id)s
"""


def classify(conn, row: dict) -> tuple[str, str | None]:
    """What load does with a row: add, stored, differs, taken, or missing_place."""
    state = conn.execute(
        STATE,
        {"source": SOURCE_ID, "kind": ID_KIND, "item": row["wikidata_item"], "eco_id": row["eco_id"]},
    ).fetchone()
    if state is None:
        return "missing_place", None
    if state["stored"] == row["wikidata_item"]:
        return "stored", state["place_id"]
    if state["stored"]:
        return "differs", state["place_id"]
    if state["item_place"]:
        return "taken", state["place_id"]
    return "add", state["place_id"]


def report(result: dict, outcome: str, row: dict) -> None:
    result[outcome] += 1
    if outcome in ("differs", "taken"):
        result.setdefault("not_written", []).append(
            f"ECO_ID {row['eco_id']} {row['wikidata_item']}: {outcome}"
        )


def counts(conn, work: Path) -> dict:
    result = {"rows": 0, "add": 0, "stored": 0, "differs": 0, "taken": 0, "missing_place": 0}
    for row in read_output(work):
        result["rows"] += 1
        report(result, classify(conn, row)[0], row)
    conn.rollback()
    return result


def load(conn, work: Path) -> dict:
    rows = read_output(work)
    result = {"rows": len(rows), "add": 0, "stored": 0, "differs": 0, "taken": 0,
              "missing_place": 0}
    with conn.transaction():
        for row in rows:
            outcome, place_id = classify(conn, row)
            report(result, outcome, row)
            if outcome != "add":
                continue
            conn.execute(
                """
                insert into public.place_source_ids (
                  place_id, source_id, id_kind, source_record_id, match_status
                ) values (%s::uuid, %s, %s, %s, 'confirmed')
                """,
                (place_id, SOURCE_ID, ID_KIND, row["wikidata_item"]),
            )
    result["added"] = result.pop("add")
    return result


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command not in ("fetch", "counts", "load"):
        raise SystemExit("usage: match_ecoregion_wikidata.py fetch | counts | load")
    conn = import_wdpa.open_connection()
    try:
        work = suggest_photos.work_dir()
        result = {"fetch": fetch, "counts": counts, "load": load}[command](conn, work)
        print(json.dumps(result, indent=2), flush=True)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
