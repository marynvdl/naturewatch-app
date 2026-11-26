#!/usr/bin/env python3
"""Suggest Wikimedia Commons photographs for World Heritage Sites (Molding Places
task 05) and ecoregions (Ecoregions task 06, Wayfinding task 05b).

  fetch [TYPE]
          Read-only on the database. For each published World Heritage Site
          and ecoregion, or only those of TYPE (world_heritage_site or
          ecoregion), find its Wikidata item: by WDPA id (P809) for a site, by
          the confirmed wikidata_item source id for an ecoregion. Then take, in
          order, the item's image (P18), the free lead image of its English
          Wikipedia article, the files in its Commons category (P373), and a
          Commons search by the place's name. An ecoregion with no item gets
          the search only. Keep JPEG, PNG, and WebP files at least 1,000 px
          wide, under a licence in `licences`, with a creator, whose title and
          Commons categories do not name a map, logo, flag, information board,
          sign, plan, diagram, or panel. For an ecoregion, a title with the word
          ecoregion or a WWF code such as PA1219 is a range map and is refused
          too. Keep the first 3 per place, at most 1 of them from search. An
          ecoregion also gets up to 3 approved photographs of the World Heritage
          Sites and conservation areas located in it. Write suggest_photos.tsv
          to the work directory. API responses are cached there, so a second
          start reads no page twice.
  counts  Read-only. How many rows of the file load would add, and how many it
          would skip because the place already has a link to that file or
          refused it (photo_refusals).
  load    Write the file in one transaction. First purge_rejected_photos()
          deletes the links rejected more than 30 days ago and keeps a
          photo_refusals row for each file. Then reuse the images row of a
          Commons file already stored or insert one, and link it to the place
          as suggested, with the pipeline name and the score. A photograph from
          a place inside also names that place (suggested_from_place_id). A
          place that already has a link to the image, in any status, or a
          refusal of it, is skipped, so a rerun adds nothing and a rejected or
          withdrawn photograph stays so. An ecoregion's row is found by its
          ECO_ID, so a file fetched from one database loads into another.
  withdraw [--write]
          Check the suggestions of suggest_photos/1 against the rules above:
          maps, boards, and signs by title or category, and 1 search result per
          place. Print how many it would withdraw, by reason and place type,
          with a few titles. With --write, set them to withdrawn in one
          transaction.

Pipelines only suggest. An admin approves (decisions.md record 23).

The connection is the importer's: DATABASE_URL for the local database, or
SUPABASE_ACCESS_TOKEN for a short-lived hosted login role. The work directory
is WDPA_WORK_DIR. Wikimedia asks for a descriptive User-Agent: set
SUGGEST_PHOTOS_USER_AGENT to one with a contact address, or a generic one is sent.
"""

from __future__ import annotations

import csv
import hashlib
import html
import importlib.util
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "import_wdpa", Path(__file__).resolve().parent / "import_wdpa.py"
)
import_wdpa = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = import_wdpa
_spec.loader.exec_module(import_wdpa)

PIPELINE = "suggest_photos/2"
# The pipeline whose suggestions `withdraw` checks against the rules of version 2.
OLD_PIPELINE = "suggest_photos/1"
SOURCE_ID = "wikimedia-commons"
PER_PLACE = 3
# At most this many search results per place (Wayfinding task 05b).
SEARCH_PER_PLACE = 1
# An ecoregion also gets up to this many approved photographs of places inside it.
CHILDREN_PER_PLACE = 3
CHILD_TYPES = ("world_heritage_site", "conservation_area")
MIN_WIDTH = 1000
IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp")
# A title or Commons category with one of these words is rarely a photograph of
# the place: a map, a logo, a flag, an information board, a sign, a plan, a panel.
EXCLUDED_WORDS = frozenset((
    "map", "maps", "logo", "logos", "flag", "flags", "locator",
    "sign", "signs", "signboard", "signboards", "signage", "noticeboard", "noticeboards",
    "plan", "plans", "diagram", "diagrams", "panel", "panels",
))
# Two words: "information board", "interpretive boards".
BOARD_WORDS = frozenset(("information", "interpretive", "interpretation", "notice"))
# Commons adds these categories to files by template, not by what they show.
CATEGORY_PREFIXES = ("pages with", "files with", "media with", "uploaded with")
# For an ecoregion, a range map: "Ecoregion PA1219.png", "AT1007 map.svg".
ECOREGION_WORDS = ("ecoregion", "ecoregions")
WWF_CODE = re.compile(r"(?<![A-Za-z0-9])[A-Z]{2}[0-9]{4}(?![0-9])")
TEXT_MAX = 300
# Score by where a file was found, less SCORE_STEP for each file before it there.
ORIGIN_SCORES = {"wikidata": 1.0, "lead": 1.0, "category": 0.7, "child": 0.8, "search": 0.4}
SCORE_STEP = 0.01
CATEGORY_LIMIT = 50
SEARCH_LIMIT = 30
INFO_BATCH = 50
# One request covers every site: the query service can limit a client to one a minute.
SPARQL_BATCH = 500
# Item ids by value: 500 make an address longer than the query service accepts (HTTP 431).
ITEM_BATCH = 150
PAUSE_SECONDS = 0.5
ATTEMPTS = 5
# API errors worth a retry: replication lag, and a busy search cluster.
RETRY_ERRORS = ("maxlag", "cirrussearch-too-busy-error")
# Longest wait for a Retry-After.
MAX_WAIT_SECONDS = 120

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
WIKIPEDIA = "https://en.wikipedia.org/"
WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
OUTPUT_NAME = "suggest_photos.tsv"
CACHE_NAME = "suggest_photos_cache"
COLUMNS = (
    "place_id", "place_type_id", "site_id", "eco_id", "place_name", "origin", "title", "page_url", "file_url",
    "width", "height", "creator", "licence_id", "score", "alt_text", "caption",
    "image_id", "from_place_id",
)

SITES = """
select places.id::text as place_id, places.place_type_id,
  coalesce(curations.display_name, places.name) as name,
  ids.source_record_id as site_id, null::text as eco_id, null::text as wikidata_item
from public.places
join public.place_source_ids as ids
  on ids.place_id = places.id
  and ids.source_id = 'wdpca'
  and ids.id_kind = 'wdpa_site_id'
  and ids.match_status = 'confirmed'
left join public.place_curations as curations on curations.place_id = places.id
where places.place_type_id = 'world_heritage_site'
  and places.publication_status = 'published'
order by name, places.id
"""

ECOREGIONS = """
select places.id::text as place_id, places.place_type_id,
  coalesce(curations.display_name, places.name) as name,
  null::text as site_id, ids.source_record_id as eco_id, items.source_record_id as wikidata_item
from public.places
join public.place_source_ids as ids
  on ids.place_id = places.id
  and ids.source_id = 'resolve-ecoregions'
  and ids.id_kind = 'eco_id'
  and ids.match_status = 'confirmed'
left join public.place_source_ids as items
  on items.place_id = places.id
  and items.source_id = 'wikidata'
  and items.id_kind = 'wikidata_item'
  and items.match_status = 'confirmed'
left join public.place_curations as curations on curations.place_id = places.id
where places.place_type_id = 'ecoregion'
  and places.publication_status = 'published'
order by name, places.id
"""

PLACE_QUERIES = {"world_heritage_site": SITES, "ecoregion": ECOREGIONS}

# The approved photographs of the published places with a confirmed, current
# located_in link to an ecoregion: each place's main one first, then its gallery.
CHILDREN = """
select links.object_place_id::text as ecoregion_id, child.id::text as child_id,
  coalesce(curations.display_name, child.name) as child_name,
  images.id::text as image_id, images.source_id, images.source_record_id,
  photo.alt_text, photo.caption, links.subject_coverage
from public.place_relationships as links
join public.places as child
  on child.id = links.subject_place_id
  and child.publication_status = 'published'
  and child.place_type_id = any (%s)
join public.places as ecoregion
  on ecoregion.id = links.object_place_id
  and ecoregion.place_type_id = 'ecoregion'
join public.place_images as photo on photo.place_id = child.id and photo.status = 'approved'
join public.images on images.id = photo.image_id and images.image_status = 'active'
left join public.place_curations as curations on curations.place_id = child.id
where links.relationship_type_id = 'located_in'
  and links.status = 'confirmed'
  and links.retired_at is null
order by links.object_place_id, links.subject_coverage desc nulls last, child.id,
  photo.is_primary desc, photo.gallery_position nulls last, photo.created_at
"""


def choose_children(place: dict, photos: list[dict], taken: set[str]) -> list[dict]:
    """Up to CHILDREN_PER_PLACE rows for an ecoregion from the photographs of the
    places inside it, in CHILDREN's order. Each place's first photograph comes
    before any place's second. A Commons file in `taken` is left out."""
    ranked: list[tuple[int, int, dict]] = []
    seen_child: dict[str, int] = {}
    seen_image: set[str] = set()
    for order, photo in enumerate(photos):
        if photo["image_id"] in seen_image or (photo["source_record_id"] or "") in taken:
            continue
        seen_image.add(photo["image_id"])
        rank = seen_child.get(photo["child_id"], 0)
        seen_child[photo["child_id"]] = rank + 1
        ranked.append((rank, order, photo))
    rows = []
    for index, (_, _, photo) in enumerate(sorted(ranked, key=lambda r: r[:2])[:CHILDREN_PER_PLACE]):
        rows.append({
            "place_id": place["place_id"],
            "place_type_id": place.get("place_type_id") or "ecoregion",
            "site_id": "",
            "eco_id": place.get("eco_id") or "",
            "place_name": place["name"],
            "origin": "child",
            "title": photo["source_record_id"] or "",
            "page_url": "", "file_url": "", "width": "", "height": "", "creator": "",
            "licence_id": "",
            "score": round(ORIGIN_SCORES["child"] - SCORE_STEP * index, 2),
            "alt_text": photo["alt_text"],
            "caption": photo["caption"] or "",
            "image_id": photo["image_id"],
            "from_place_id": photo["child_id"],
        })
    return rows


# --- text --------------------------------------------------------------------


class _Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def plain_text(value: str | None) -> str:
    """Plain text from a Commons HTML value, with whitespace collapsed."""
    if not value:
        return ""
    parser = _Text()
    parser.feed(value)
    parser.close()
    return re.sub(r"\s+", " ", html.unescape("".join(parser.parts))).strip()


def cut_at_word(text: str, limit: int = TEXT_MAX) -> str:
    """The text, or its start cut at a word with an ellipsis, at most `limit` long."""
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    space = cut.rfind(" ")
    return (cut[:space] if space > 0 else cut).rstrip(" ,;:") + "…"


def commons_caption(description: str | None) -> str:
    """As commonsCaption in commons.ts: the description before its first line
    break, as plain text, at most 300 characters."""
    first = re.split(r"<br\s*/?>", description or "", maxsplit=1, flags=re.I)[0]
    return cut_at_word(plain_text(first))


def file_name(title: str) -> str:
    """The file title without `File:` and its extension."""
    name = re.sub(r"^File:", "", title, flags=re.I)
    return re.sub(r"\.[A-Za-z0-9]{2,5}$", "", name).replace("_", " ").strip()


def first_sentence(description: str | None) -> str:
    """The first sentence of the description, at most 300 characters. It is the
    caption of a suggestion, so a card does not show a paragraph."""
    text = commons_caption(description).rstrip("…")
    # A sentence ends before a capital letter, so "approx. 360" does not end one.
    match = re.match(r"(.+?[.!?])(\s+(?=[A-Z])|$)", text)
    return cut_at_word((match.group(1) if match else text).strip())


def alt_text(title: str, description: str | None) -> str:
    """The first sentence of the description, or else the file name."""
    return first_sentence(description) or cut_at_word(file_name(title))


def commons_licence_id(code: str | None, licences: set[str]) -> str | None:
    """As commonsLicenceId in commons.ts: the Commons `License` code as a licence id."""
    value = (code or "").strip().lower()
    value = {"pd": "public-domain", "cc0": "cc0-1.0"}.get(value, value)
    return value if value in licences else None


def names_excluded(text: str) -> bool:
    """Whether the text names a map, logo, flag, board, sign, plan, or panel."""
    words = [w for w in re.split(r"[^a-z]+", text.lower()) if w]
    if any(word in EXCLUDED_WORDS for word in words):
        return True
    return any(
        first in BOARD_WORDS and second in ("board", "boards")
        for first, second in zip(words, words[1:])
    )


def excluded_category(categories: list[str]) -> str | None:
    """The first category that names a map, a board, or a sign, if any."""
    for category in categories:
        if category.lower().startswith(CATEGORY_PREFIXES):
            continue
        if names_excluded(category):
            return category
    return None


def excluded_title(title: str, place_type_id: str = "world_heritage_site") -> bool:
    name = file_name(title)
    words = re.split(r"[^a-z]+", name.lower())
    if names_excluded(name):
        return True
    if place_type_id == "ecoregion":
        return any(word in ECOREGION_WORDS for word in words) or bool(WWF_CODE.search(name))
    return False


def normal_title(name: str) -> str:
    """`File:…` with spaces, from a P18 or a file name."""
    name = urllib.parse.unquote(name.rsplit("/", 1)[-1]) if "/" in name else name
    name = re.sub(r"^File:", "", name, flags=re.I)
    return "File:" + name.replace("_", " ").strip()


# --- reading responses -------------------------------------------------------


@dataclass
class CommonsFile:
    title: str
    page_url: str
    file_url: str
    width: int
    height: int
    mime: str
    creator: str
    licence_id: str | None
    description: str | None
    categories: tuple[str, ...] = ()


def read_imageinfo(body: dict, licences: set[str]) -> dict[str, CommonsFile]:
    """The files in an `imageinfo` response (formatversion 2), by title."""
    files: dict[str, CommonsFile] = {}
    for page in (body.get("query") or {}).get("pages") or []:
        info = (page.get("imageinfo") or [None])[0]
        if page.get("missing") or not info:
            continue
        meta = info.get("extmetadata") or {}
        file_url = urllib.parse.urlsplit(info["url"])._replace(query="").geturl()
        files[page["title"]] = CommonsFile(
            title=page["title"],
            page_url=info["descriptionurl"],
            file_url=file_url,
            width=int(info.get("width") or 0),
            height=int(info.get("height") or 0),
            mime=info.get("mime") or "",
            creator=plain_text((meta.get("Artist") or {}).get("value")),
            licence_id=commons_licence_id((meta.get("License") or {}).get("value"), licences),
            description=(meta.get("ImageDescription") or {}).get("value"),
            categories=tuple(
                c.replace("_", " ").strip()
                for c in ((meta.get("Categories") or {}).get("value") or "").split("|")
                if c.strip()
            ),
        )
    return files


def refusal(file: CommonsFile | None, place_type_id: str = "world_heritage_site") -> str | None:
    """Why a file is not suggested, or None to keep it."""
    if file is None:
        return "missing"
    if file.mime not in IMAGE_TYPES:
        return "type"
    if file.width < MIN_WIDTH:
        return "small"
    if not file.licence_id:
        return "licence"
    if not file.creator:
        return "creator"
    if excluded_title(file.title, place_type_id):
        return "title"
    if excluded_category(list(file.categories)):
        return "category"
    return None


def choose(
    site: dict, candidates: list[tuple[str, str]], files: dict[str, CommonsFile]
) -> tuple[list[dict], dict[str, int]]:
    """The rows for one site, and why the others were refused.

    `candidates` is (origin, title) in the order found. The first PER_PLACE
    files kept are returned, at most SEARCH_PER_PLACE of them from search, each
    scored by its origin and its place there.
    """
    rows: list[dict] = []
    refused: dict[str, int] = {}
    seen: set[str] = set()
    kept_by_origin: dict[str, int] = {}
    for origin, title in candidates:
        if len(rows) == PER_PLACE:
            break
        if title in seen:
            continue
        if origin == "search" and kept_by_origin.get("search", 0) >= SEARCH_PER_PLACE:
            continue
        seen.add(title)
        file = files.get(title)
        reason = refusal(file, site.get("place_type_id") or "world_heritage_site")
        if reason:
            refused[reason] = refused.get(reason, 0) + 1
            continue
        rank = kept_by_origin.get(origin, 0)
        kept_by_origin[origin] = rank + 1
        rows.append({
            "place_id": site["place_id"],
            "place_type_id": site.get("place_type_id") or "world_heritage_site",
            "site_id": site.get("site_id") or "",
            "eco_id": site.get("eco_id") or "",
            "place_name": site["name"],
            "origin": origin,
            "title": file.title,
            "page_url": file.page_url,
            "file_url": file.file_url,
            "width": file.width,
            "height": file.height,
            "creator": cut_at_word(file.creator),
            "licence_id": file.licence_id,
            "score": round(max(ORIGIN_SCORES[origin] - SCORE_STEP * rank, 0.0), 2),
            "alt_text": alt_text(file.title, file.description),
            "caption": first_sentence(file.description),
            "image_id": "",
            "from_place_id": "",
        })
    return rows, refused


def read_sparql(body: dict, by: str = "wdpa") -> dict[str, dict]:
    """Per WDPA id, or per item id with `by` "item", the Wikidata items,
    images (P18), and categories (P373)."""
    found: dict[str, dict] = {}
    for binding in (body.get("results") or {}).get("bindings") or []:
        value = binding[by]["value"]
        if by == "item":
            value = value.rsplit("/", 1)[-1]
        entry = found.setdefault(
            value, {"items": [], "images": [], "categories": [], "articles": []}
        )
        for key, field in (("item", "items"), ("image", "images"), ("category", "categories"),
                           ("article", "articles")):
            value = (binding.get(key) or {}).get("value")
            if value and value not in entry[field]:
                entry[field].append(value)
    for entry in found.values():
        entry["images"] = [normal_title(image) for image in entry["images"]]
        entry["articles"] = [article_title(a) for a in entry["articles"]]
    return found


def article_title(url: str) -> str:
    """The article title from its English Wikipedia address."""
    return urllib.parse.unquote(url.rsplit("/wiki/", 1)[-1]).replace("_", " ")


def read_lead_images(body: dict) -> dict[str, str]:
    """Per article title as asked, its free lead image (`page_image_free`) as a
    `File:` title. Normalised and redirected titles are followed."""
    query = body.get("query") or {}
    images = {
        page["title"]: normal_title(page["pageprops"]["page_image_free"])
        for page in query.get("pages") or []
        if (page.get("pageprops") or {}).get("page_image_free")
    }
    moves = {m["from"]: m["to"] for m in (query.get("normalized") or []) + (query.get("redirects") or [])}
    for start in list(moves):
        end, hops = start, 0
        while end in moves and hops < 5:
            end, hops = moves[end], hops + 1
        if end in images:
            images[start] = images[end]
    return images


def category_titles(body: dict) -> list[str]:
    return [m["title"] for m in (body.get("query") or {}).get("categorymembers") or []]


def search_titles(body: dict) -> list[str]:
    return [m["title"] for m in (body.get("query") or {}).get("search") or []]


# --- requests ----------------------------------------------------------------


def user_agent() -> str:
    return os.environ.get("SUGGEST_PHOTOS_USER_AGENT") or "suggest-photos/1"


class Client:
    """GET JSON with a cache in the work directory, a pause, and retries."""

    def __init__(self, cache: Path):
        self.cache = cache
        cache.mkdir(parents=True, exist_ok=True)
        self.requests = 0

    def get(self, url: str, params: dict) -> dict:
        address = f"{url}?{urllib.parse.urlencode(params)}"
        path = self.cache / (hashlib.sha256(address.encode()).hexdigest() + ".json")
        if path.exists():
            return json.loads(path.read_text())
        body = self._fetch(address)
        path.write_text(json.dumps(body))
        return body

    def _fetch(self, address: str) -> dict:
        delay = 5.0
        for attempt in range(1, ATTEMPTS + 1):
            time.sleep(PAUSE_SECONDS)
            self.requests += 1
            request = urllib.request.Request(
                address,
                headers={"User-Agent": user_agent(), "Accept": "application/json"},
            )
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    body = json.load(response)
            except urllib.error.HTTPError as exc:
                if exc.code not in (429, 500, 502, 503, 504) or attempt == ATTEMPTS:
                    raise SystemExit(f"HTTP {exc.code} from {address[:120]}") from None
                wait = min(float(exc.headers.get("Retry-After") or delay), MAX_WAIT_SECONDS)
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                if attempt == ATTEMPTS:
                    raise SystemExit(f"{type(exc).__name__} from {address[:120]}") from None
                wait = delay
            else:
                error = body.get("error") if isinstance(body, dict) else None
                if not error:
                    return body
                if error.get("code") not in RETRY_ERRORS or attempt == ATTEMPTS:
                    raise SystemExit(f"API error {error.get('code')}: {error.get('info')}")
                wait = delay
            print(f"waiting {wait:.0f} s before retry {attempt}", flush=True)
            time.sleep(wait)
            delay = min(delay * 2, 120)
        raise SystemExit("unreachable")


def commons(client: Client, **params) -> dict:
    return client.get(
        COMMONS_API,
        {"action": "query", "format": "json", "formatversion": "2", "maxlag": "5", **params},
    )


ARTICLE = (
    "OPTIONAL { ?article schema:about ?item ; "
    f"schema:isPartOf <{WIKIPEDIA}> }}"
)


def wikidata_items(client: Client, site_ids: list[str]) -> dict[str, dict]:
    found: dict[str, dict] = {}
    for start in range(0, len(site_ids), SPARQL_BATCH):
        values = " ".join(json.dumps(i) for i in site_ids[start : start + SPARQL_BATCH])
        query = (
            "SELECT ?item ?wdpa ?image ?category WHERE { "
            f"VALUES ?wdpa {{ {values} }} ?item wdt:P809 ?wdpa . "
            "OPTIONAL { ?item wdt:P18 ?image } OPTIONAL { ?item wdt:P373 ?category } "
            f"{ARTICLE} }}"
        )
        found.update(read_sparql(client.get(WIKIDATA_SPARQL, {"query": query, "format": "json"})))
    return found


def items_by_id(client: Client, qids: list[str]) -> dict[str, dict]:
    """Per item id, its images (P18) and categories (P373)."""
    found: dict[str, dict] = {}
    for start in range(0, len(qids), ITEM_BATCH):
        values = " ".join(f"wd:{q}" for q in qids[start : start + ITEM_BATCH])
        query = (
            "SELECT ?item ?image ?category WHERE { "
            f"VALUES ?item {{ {values} }} "
            "OPTIONAL { ?item wdt:P18 ?image } OPTIONAL { ?item wdt:P373 ?category } "
            f"{ARTICLE} }}"
        )
        found.update(read_sparql(
            client.get(WIKIDATA_SPARQL, {"query": query, "format": "json"}), by="item"
        ))
    return found


def lead_images(client: Client, articles: list[str]) -> dict[str, str]:
    """Per English Wikipedia article, its free lead image."""
    found: dict[str, str] = {}
    for start in range(0, len(articles), INFO_BATCH):
        body = client.get(WIKIPEDIA_API, {
            "action": "query", "format": "json", "formatversion": "2", "maxlag": "5",
            "prop": "pageprops", "ppprop": "page_image_free", "redirects": "1",
            "titles": "|".join(articles[start : start + INFO_BATCH]),
        })
        found.update(read_lead_images(body))
    return found


def file_infos(client: Client, titles: list[str], licences: set[str]) -> dict[str, CommonsFile]:
    files: dict[str, CommonsFile] = {}
    for start in range(0, len(titles), INFO_BATCH):
        body = commons(
            client,
            prop="imageinfo",
            iiprop="url|size|mime|extmetadata",
            iiextmetadatafilter="Artist|License|ImageDescription|Categories",
            titles="|".join(titles[start : start + INFO_BATCH]),
        )
        files.update(read_imageinfo(body, licences))
        # A P18 value can differ from the canonical title only in case or spacing.
        for norm in (body.get("query") or {}).get("normalized") or []:
            if norm["to"] in files:
                files[norm["from"]] = files[norm["to"]]
    return files


# --- commands ----------------------------------------------------------------


def work_dir() -> Path:
    path = Path(os.environ.get("WDPA_WORK_DIR") or Path(tempfile.gettempdir()) / "wdpa-work")
    path.mkdir(parents=True, exist_ok=True)
    return path


def fetch(conn, work: Path, client: Client | None = None,
          place_types: tuple[str, ...] = tuple(PLACE_QUERIES)) -> dict:
    sites = [row for t in place_types for row in conn.execute(PLACE_QUERIES[t]).fetchall()]
    licences = {r["id"] for r in conn.execute("select id from public.licences").fetchall()}
    children: dict[str, list[dict]] = {}
    if "ecoregion" in place_types:
        for photo in conn.execute(CHILDREN, (list(CHILD_TYPES),)).fetchall():
            children.setdefault(photo["ecoregion_id"], []).append(photo)
    conn.rollback()
    client = client or Client(work / CACHE_NAME)
    by_wdpa = wikidata_items(client, sorted({s["site_id"] for s in sites if s["site_id"]}))
    by_item = items_by_id(client, sorted({s["wikidata_item"] for s in sites if s["wikidata_item"]}))
    leads = lead_images(client, sorted({
        a for entry in (*by_wdpa.values(), *by_item.values()) for a in entry.get("articles", [])
    }))

    stats = {
        t: {"places": 0, "with_item": 0, "found": {}, "kept": {}, "refused": {},
            "places_without": 0, "rows": 0}
        for t in place_types
    }
    rows: list[dict] = []
    for number, site in enumerate(sites, 1):
        if site["site_id"]:
            entry = by_wdpa.get(site["site_id"], {"images": [], "categories": []})
        else:
            entry = by_item.get(site["wikidata_item"] or "", {"images": [], "categories": []})
        type_stats = stats[site["place_type_id"]]
        type_stats["places"] += 1
        if entry.get("items") or site["wikidata_item"]:
            type_stats["with_item"] += 1
        candidates = [("wikidata", t) for t in entry["images"]]
        candidates += [("lead", leads[a]) for a in entry.get("articles", []) if a in leads]
        for category in entry["categories"]:
            body = commons(
                client, list="categorymembers", cmtype="file",
                cmtitle=f"Category:{category}", cmlimit=str(CATEGORY_LIMIT),
            )
            candidates += [("category", t) for t in category_titles(body)]
        body = commons(
            client, list="search", srnamespace="6", srlimit=str(SEARCH_LIMIT),
            srsearch=f"{site['name']} filetype:bitmap",
        )
        candidates += [("search", t) for t in search_titles(body)]
        for origin, _ in candidates:
            type_stats["found"][origin] = type_stats["found"].get(origin, 0) + 1

        titles = list(dict.fromkeys(t for _, t in candidates))
        chosen, refused = choose(site, candidates, file_infos(client, titles, licences))
        for reason, count in refused.items():
            type_stats["refused"][reason] = type_stats["refused"].get(reason, 0) + count
        if site["place_type_id"] == "ecoregion":
            taken = {row["title"] for row in chosen}
            chosen += choose_children(site, children.get(site["place_id"], []), taken)
        for row in chosen:
            type_stats["kept"][row["origin"]] = type_stats["kept"].get(row["origin"], 0) + 1
        if not chosen:
            type_stats["places_without"] += 1
        type_stats["rows"] += len(chosen)
        rows += chosen
        if number % 20 == 0:
            print(f"{number} of {len(sites)} places, {len(rows)} photographs", flush=True)

    with open(work / OUTPUT_NAME, "w", newline="", encoding="utf-8") as out:
        writer = csv.DictWriter(out, fieldnames=COLUMNS, delimiter="\t")
        writer.writeheader()
        writer.writerows(rows)
    return {**stats, "rows": len(rows), "requests": client.requests}


def read_output(work: Path) -> list[dict]:
    path = work / OUTPUT_NAME
    if not path.exists():
        raise SystemExit(f"{path} is missing: run fetch first")
    with open(path, newline="", encoding="utf-8") as source:
        return list(csv.DictReader(source, delimiter="\t"))


LINKED = """
select exists (
  select 1
  from public.place_images
  join public.images on images.id = place_images.image_id
  where place_images.place_id = %s::uuid
    and images.source_id = %s
    and images.source_record_id = %s
) as linked
"""

LINKED_IMAGE = """
select exists (
  select 1 from public.place_images where place_id = %s::uuid and image_id = %s::uuid
) as linked
"""


def linked(conn, place_id: str, row: dict) -> bool:
    """Whether the place has a link to the row's image, in any status."""
    if row.get("image_id"):
        return conn.execute(LINKED_IMAGE, (place_id, row["image_id"])).fetchone()["linked"]
    return conn.execute(LINKED, (place_id, SOURCE_ID, row["title"])).fetchone()["linked"]


def refused_here(conn, place_id: str, row: dict) -> bool:
    if not row.get("title"):
        return False
    return conn.execute(REFUSED, (place_id, row["title"])).fetchone()["refused"]

REFUSED = """
select exists (
  select 1 from public.photo_refusals
  where place_id = %s::uuid and commons_title = %s
) as refused
"""

ECOREGION_PLACE = """
select place_id::text from public.place_source_ids
where source_id = 'resolve-ecoregions' and id_kind = 'eco_id'
  and match_status = 'confirmed' and source_record_id = %s
"""


def place_of(conn, row: dict) -> str | None:
    """The row's place in this database: by ECO_ID for an ecoregion."""
    if row.get("eco_id"):
        found = conn.execute(ECOREGION_PLACE, (row["eco_id"],)).fetchone()
        return found["place_id"] if found else None
    found = conn.execute(
        "select id::text from public.places where id = %s::uuid", (row["place_id"],)
    ).fetchone()
    return found["id"] if found else None


def counts(conn, work: Path) -> dict:
    result = {"rows": 0, "would_add": 0, "already_linked": 0, "refused": 0,
              "missing_place": 0}
    for row in read_output(work):
        result["rows"] += 1
        place_id = place_of(conn, row)
        if place_id is None:
            result["missing_place"] += 1
        elif linked(conn, place_id, row):
            result["already_linked"] += 1
        elif refused_here(conn, place_id, row):
            result["refused"] += 1
        else:
            result["would_add"] += 1
    conn.rollback()
    return result


def load(conn, work: Path) -> dict:
    rows = read_output(work)
    result = {"rows": len(rows), "images_added": 0, "links_added": 0,
              "already_linked": 0, "refused": 0, "missing_place": 0, "missing_image": 0}
    with conn.transaction():
        purged = conn.execute("select * from public.purge_rejected_photos()").fetchone()
        result["purged"] = {key: int(value) for key, value in purged.items()}
        for row in rows:
            place_id = place_of(conn, row)
            if place_id is None:
                result["missing_place"] += 1
                continue
            if refused_here(conn, place_id, row):
                result["refused"] += 1
                continue
            if row.get("image_id"):
                image = conn.execute(
                    "select id from public.images where id = %s::uuid", (row["image_id"],)
                ).fetchone()
                if image is None:
                    result["missing_image"] += 1
                    continue
            else:
                image = conn.execute(
                    "select id from public.images where source_id = %s and source_record_id = %s",
                    (SOURCE_ID, row["title"]),
                ).fetchone()
            if image is None:
                image = conn.execute(
                    """
                    insert into public.images (
                      external_url, source_id, source_record_id, source_url,
                      creator_name, licence_id, width, height
                    ) values (%s, %s, %s, %s, %s, %s, %s, %s)
                    returning id
                    """,
                    (row["file_url"], SOURCE_ID, row["title"], row["page_url"],
                     row["creator"], row["licence_id"], int(row["width"]), int(row["height"])),
                ).fetchone()
                result["images_added"] += 1
            added = conn.execute(
                """
                insert into public.place_images (
                  place_id, image_id, status, suggested_by_pipeline, suggestion_score,
                  caption, alt_text, suggested_from_place_id
                ) values (%s::uuid, %s, 'suggested', %s, %s, %s, %s, %s::uuid)
                on conflict (place_id, image_id) do nothing
                returning image_id
                """,
                (place_id, image["id"], PIPELINE, float(row["score"]),
                 row["caption"] or None, row["alt_text"], row.get("from_place_id") or None),
            ).fetchone()
            if added:
                result["links_added"] += 1
            else:
                result["already_linked"] += 1
    return result


OLD_SUGGESTIONS = """
select place_images.place_id::text, place_images.image_id::text, places.place_type_id,
  coalesce(curations.display_name, places.name) as place_name,
  images.source_record_id as title, place_images.suggestion_score as score
from public.place_images
join public.images on images.id = place_images.image_id and images.source_id = %s
join public.places on places.id = place_images.place_id
left join public.place_curations as curations on curations.place_id = places.id
where place_images.status = 'suggested'
  and place_images.suggested_by_pipeline = %s
  and place_images.suggested_from_place_id is null
order by place_images.place_id, place_images.suggestion_score desc, images.source_record_id
"""

SAMPLES = 5


def origin_of(score: float) -> str:
    """Where a suggest_photos/1 link was found, from its score."""
    if score >= 0.9:
        return "wikidata"
    return "category" if score >= 0.6 else "search"


def to_withdraw(links: list[dict], files: dict[str, CommonsFile]) -> list[tuple[dict, str]]:
    """The links the rules of version 2 refuse, each with its reason: `title` or
    `category` for a map, board, or sign, and `search` for each search result
    after the first of a place. `links` is in OLD_SUGGESTIONS's order."""
    found: list[tuple[dict, str]] = []
    searches: dict[str, int] = {}
    for link in links:
        file = files.get(link["title"])
        if excluded_title(link["title"], link["place_type_id"]):
            found.append((link, "title"))
            continue
        if file is not None and excluded_category(list(file.categories)):
            found.append((link, "category"))
            continue
        if origin_of(link["score"]) == "search":
            kept = searches.get(link["place_id"], 0)
            if kept >= SEARCH_PER_PLACE:
                found.append((link, "search"))
                continue
            searches[link["place_id"]] = kept + 1
    return found


def withdraw(conn, work: Path, write: bool = False, client: Client | None = None) -> dict:
    """Read, or with `write` withdraw, the suggest_photos/1 suggestions that
    version 2 refuses. A withdrawn link keeps a rerun from suggesting the file again."""
    links = conn.execute(OLD_SUGGESTIONS, (SOURCE_ID, OLD_PIPELINE)).fetchall()
    licences = {r["id"] for r in conn.execute("select id from public.licences").fetchall()}
    conn.rollback()
    client = client or Client(work / CACHE_NAME)
    files = file_infos(client, sorted({l["title"] for l in links}), licences)
    found = to_withdraw(links, files)
    result: dict = {"suggestions": len(links), "withdraw": len(found), "by_reason": {},
                    "by_type": {}, "samples": {}, "requests": client.requests}
    for link, reason in found:
        result["by_reason"][reason] = result["by_reason"].get(reason, 0) + 1
        result["by_type"][link["place_type_id"]] = result["by_type"].get(link["place_type_id"], 0) + 1
        samples = result["samples"].setdefault(reason, [])
        if len(samples) < SAMPLES:
            file = files.get(link["title"])
            note = excluded_category(list(file.categories)) if file and reason == "category" else None
            samples.append(f"{link['place_name']}: {link['title']}" + (f" ({note})" if note else ""))
    if not write:
        return result
    with conn.transaction():
        withdrawn = 0
        for link, reason in found:
            withdrawn += conn.execute(
                """
                update public.place_images
                set status = 'withdrawn', reviewed_at = now(), review_note = %s
                where place_id = %s::uuid and image_id = %s::uuid and status = 'suggested'
                """,
                (f"{PIPELINE}: {reason}", link["place_id"], link["image_id"]),
            ).rowcount
    result["withdrawn"] = withdrawn
    return result


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    args = sys.argv[2:]
    place_types = tuple(args) or tuple(PLACE_QUERIES)
    if command == "withdraw":
        valid = args in ([], ["--write"])
    elif command == "fetch":
        valid = all(t in PLACE_QUERIES for t in place_types)
    else:
        valid = command in ("counts", "load") and not args
    if not valid:
        raise SystemExit(
            "usage: suggest_photos.py fetch [world_heritage_site | ecoregion] | counts | load"
            " | withdraw [--write]"
        )
    conn = import_wdpa.open_connection()
    try:
        work = work_dir()
        if command == "fetch":
            result = fetch(conn, work, place_types=place_types)
        elif command == "withdraw":
            result = withdraw(conn, work, write=args == ["--write"])
        else:
            result = {"counts": counts, "load": load}[command](conn, work)
        print(json.dumps(result, indent=2), flush=True)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
