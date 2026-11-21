#!/usr/bin/env python3
"""Load the terrestrial ecoregions of RESOLVE Ecoregions 2017 as places.

  build   Download and check the pinned zip, then write one filtered file of the
          846 ecoregions: Rock and Ice (ECO_ID 0) left out, invalid shapes
          repaired, every shape a MultiPolygon, with its geodesic km².
          No database connection.
  upload  Write the file in small committed batches. Each ecoregion is written
          whole: a published place, its current version 1 boundary, a confirmed
          eco_id source id, and its details. A second start skips the ECO_IDs
          already stored. It never updates or deletes a stored row.
  check   Read-only. Counts, valid current boundaries, and each boundary's
          area_km2 against the file's geodesic km².

The work directory is ECOREGIONS_WORK_DIR. The database is DATABASE_URL, or the
hosted database through a short-lived login role when SUPABASE_ACCESS_TOKEN is set
(see import_wdpa.py).
"""

from __future__ import annotations

import csv
import gzip
import hashlib
import hmac
import importlib.util
import json
import os
import sys
import tempfile
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "import_wdpa", Path(__file__).resolve().parent / "import_wdpa.py"
)
import_wdpa = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = import_wdpa
_spec.loader.exec_module(import_wdpa)

PINNED_SOURCE = "resolve-ecoregions"
PINNED_VERSION = "2017"
PINNED_URL = "https://storage.googleapis.com/teow2016/Ecoregions2017.zip"
PINNED_SHA256 = "be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60"
SHAPEFILE = "Ecoregions2017.shp"
ROCK_AND_ICE = 0
EXPECTED_ECOREGIONS = 846
PLACE_TYPE = "ecoregion"
ID_KIND = "eco_id"
# A repair may move a self-intersecting ring, not change the area.
REPAIR_TOLERANCE = 1e-4
# The stored spheroid area and the local geodesic area agree to about 1e-10.
AREA_TOLERANCE = 1e-4
BATCH_ROWS = 25
BATCH_BYTES = 4 * 1024 * 1024
ZIP_NAME = "Ecoregions2017.zip"
FILTERED_NAME = "ecoregions.tsv.gz"
MANIFEST_NAME = "ecoregions_manifest.json"
COLUMNS = ("eco_id", "name", "biome", "realm", "attributes", "area_km2", "wkb")

csv.field_size_limit(sys.maxsize)


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else "build"
    work = work_dir()
    if command == "build":
        build(work)
    elif command == "upload":
        build(work)
        upload(work)
    elif command == "check":
        check(work)
    else:
        raise SystemExit(f"unknown command {command!r}: build, upload, check")


def work_dir() -> Path:
    path = Path(
        os.environ.get("ECOREGIONS_WORK_DIR")
        or Path(tempfile.gettempdir()) / "ecoregions-work"
    )
    path.mkdir(parents=True, exist_ok=True)
    return path


# --- build: no database ------------------------------------------------------


def build(work: Path) -> dict:
    manifest_path = work / MANIFEST_NAME
    if manifest_path.exists() and (work / FILTERED_NAME).exists():
        manifest = read_manifest(work)
        print(f"filtered file ready: {manifest['rows']} ecoregions", flush=True)
        return manifest
    zip_path = work / ZIP_NAME
    if not zip_path.exists() or not hmac.compare_digest(
        import_wdpa.file_sha256(zip_path), PINNED_SHA256
    ):
        print("download started", flush=True)
        download(PINNED_URL, zip_path, PINNED_SHA256)
    shapefile = extract(zip_path, work / "shapefile")
    manifest = write_filtered(shapefile, work / FILTERED_NAME)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2), flush=True)
    return manifest


def download(url: str, dest: Path, expected_sha256: str) -> None:
    if url != PINNED_URL:
        raise SystemExit(f"refusing to download a URL that is not the pinned source: {url}")
    hasher = hashlib.sha256()
    request = urllib.request.Request(url, headers={"User-Agent": "sooty-earth-records"})
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            with dest.open("wb") as handle:
                while chunk := response.read(1024 * 1024):
                    hasher.update(chunk)
                    handle.write(chunk)
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"download failed for {url}: HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"download failed for {url}: {exc.reason}") from exc
    actual = hasher.hexdigest()
    if not hmac.compare_digest(actual, expected_sha256):
        dest.unlink(missing_ok=True)
        raise SystemExit(
            f"checksum mismatch for {url}\nexpected {expected_sha256}\nactual   {actual}"
        )
    if not zipfile.is_zipfile(dest):
        dest.unlink(missing_ok=True)
        raise SystemExit(f"download is not a zip file: {url}")


def extract(zip_path: Path, dest: Path) -> Path:
    with zipfile.ZipFile(zip_path) as archive:
        for member in archive.namelist():
            name = Path(member).name
            if Path(member).is_absolute() or ".." in Path(member).parts or not name:
                raise SystemExit(f"refusing an unsafe path in the zip: {member}")
        archive.extractall(dest)
    found = sorted(dest.rglob(SHAPEFILE))
    if len(found) != 1:
        raise SystemExit(f"expected one {SHAPEFILE} in the zip, found {len(found)}")
    return found[0]


def write_filtered(shapefile: Path, out: Path) -> dict:
    from osgeo import ogr

    ogr.UseExceptions()
    dataset = ogr.Open(str(shapefile))
    layer = dataset.GetLayer()
    names = [layer.GetLayerDefn().GetFieldDefn(i).GetName() for i in range(layer.GetLayerDefn().GetFieldCount())]
    stats = {"read": 0, "rock_and_ice": 0, "repaired": 0}
    seen: set[int] = set()
    tmp = out.with_suffix(".tmp")
    with gzip.open(tmp, "wt", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t", lineterminator="\n")
        for feature in layer:
            stats["read"] += 1
            attributes = {name: feature.GetField(name) for name in names}
            row = source_row(attributes, bytes(feature.GetGeometryRef().ExportToIsoWkb()), stats)
            if row is None:
                continue
            if row[0] in seen:
                raise SystemExit(f"ECO_ID {row[0]} is in the file twice")
            seen.add(row[0])
            writer.writerow(row)
    tmp.replace(out)
    if len(seen) != EXPECTED_ECOREGIONS:
        raise SystemExit(f"expected {EXPECTED_ECOREGIONS} ecoregions, found {len(seen)}")
    return {
        "pin_sha256": PINNED_SHA256,
        "columns": list(COLUMNS),
        "rows": len(seen),
        "rows_sha256": import_wdpa.file_sha256(out),
        **stats,
    }


def source_row(attributes: dict, wkb: bytes, stats: dict | None = None) -> list | None:
    """One filtered row, or None for Rock and Ice."""
    eco_id = int(attributes["ECO_ID"])
    if eco_id == ROCK_AND_ICE:
        if stats is not None:
            stats["rock_and_ice"] += 1
        return None
    shape, repaired = multipolygon(wkb, f"ECO_ID {eco_id}")
    if repaired and stats is not None:
        stats["repaired"] += 1
    return [
        eco_id,
        attributes["ECO_NAME"],
        attributes["BIOME_NAME"],
        attributes["REALM"],
        json.dumps(attributes, sort_keys=True, ensure_ascii=False),
        repr(geodesic_km2(shape)),
        shape.wkb_hex,
    ]


def multipolygon(wkb: bytes, label: str):
    """The shape as one valid MultiPolygon, and whether it was repaired."""
    import shapely
    from shapely import wkb as shapely_wkb
    from shapely.geometry import MultiPolygon

    shape = shapely_wkb.loads(wkb)
    repaired = not shape.is_valid
    if repaired:
        before = geodesic_km2(shape)
        if before <= 0:
            raise SystemExit(f"{label}: the invalid shape has no area to compare a repair with")
        fixed = shapely.make_valid(shape)
        parts = [part for part in getattr(fixed, "geoms", [fixed]) if part.geom_type in ("Polygon", "MultiPolygon")]
        shape = shapely.unary_union(parts) if parts else MultiPolygon()
        if shape.is_empty or not shape.is_valid:
            raise SystemExit(f"{label}: the repaired shape is empty or still invalid")
        change = abs(geodesic_km2(shape) - before) / before
        if change > REPAIR_TOLERANCE:
            raise SystemExit(f"{label}: the repair changed the area by {change:.4%}")
    if shape.geom_type == "Polygon":
        shape = MultiPolygon([shape])
    if shape.geom_type != "MultiPolygon" or shape.is_empty:
        raise SystemExit(f"{label}: not a polygon shape ({shape.geom_type})")
    return shape, repaired


_geod = None


def geodesic_km2(shape) -> float:
    """Area on the WGS84 ellipsoid, as place_boundaries.area_km2 measures it."""
    global _geod
    from pyproj import Geod

    if _geod is None:
        _geod = Geod(ellps="WGS84")
    area_m2, _perimeter = _geod.geometry_area_perimeter(shape)
    return abs(float(area_m2)) / 1e6


def read_manifest(work: Path) -> dict:
    manifest = json.loads((work / MANIFEST_NAME).read_text())
    if manifest.get("pin_sha256") != PINNED_SHA256 or manifest.get("columns") != list(COLUMNS):
        raise SystemExit("the filtered file was built from another pin or format: delete it and build again")
    if import_wdpa.file_sha256(work / FILTERED_NAME) != manifest.get("rows_sha256"):
        raise SystemExit("the filtered file does not match its manifest checksum")
    return manifest


def read_rows(work: Path):
    with gzip.open(work / FILTERED_NAME, "rt", newline="") as handle:
        for row in csv.reader(handle, delimiter="\t"):
            yield row


# --- upload ------------------------------------------------------------------

RELEASE_SQL = """
select releases.id, releases.checksum
from public.source_releases as releases
where releases.source_id = %(source)s and releases.version_label = %(version)s
"""

STORED_SQL = """
select source_record_id
from public.place_source_ids
where source_id = %(source)s and id_kind = %(kind)s and match_status = 'confirmed'
"""

INSERT_SQL = """
with place as (
  insert into public.places (name, place_type_id, publication_status)
  values (%(name)s, %(type)s, 'published')
  returning id
),
boundary as (
  insert into public.place_boundaries (
    place_id, version_number, geom, source_id, source_release_id, source_record_id,
    review_status, is_current
  )
  select place.id, 1, extensions.st_geomfromwkb(%(wkb)s, 4326), %(source)s, %(release)s,
    %(eco_id)s, 'approved', true
  from place
  returning place_id
),
ids as (
  insert into public.place_source_ids (
    place_id, source_id, id_kind, source_record_id, match_status,
    first_seen_release_id, last_seen_release_id
  )
  select place.id, %(source)s, %(kind)s, %(eco_id)s, 'confirmed', %(release)s, %(release)s
  from place
  returning place_id
)
insert into public.ecoregion_details (
  place_id, biome, realm, source_id, source_release_id, source_record_id, source_attributes
)
select place.id, %(biome)s, %(realm)s, %(source)s, %(release)s, %(eco_id)s, %(attributes)s::jsonb
from place
join boundary on boundary.place_id = place.id
join ids on ids.place_id = place.id
"""


def fetch_release(conn) -> str:
    with conn.cursor() as cur:
        cur.execute(RELEASE_SQL, {"source": PINNED_SOURCE, "version": PINNED_VERSION})
        row = cur.fetchone()
    conn.commit()
    if row is None:
        raise SystemExit("no RESOLVE 2017 release: push 20261127100000_ecoregions.sql first")
    if row["checksum"].lower() != PINNED_SHA256:
        raise SystemExit("the stored RESOLVE release has another checksum than the pin")
    return row["id"]


def stored_eco_ids(conn) -> set[str]:
    with conn.cursor() as cur:
        cur.execute(STORED_SQL, {"source": PINNED_SOURCE, "kind": ID_KIND})
        ids = {row["source_record_id"] for row in cur.fetchall()}
    conn.commit()
    return ids


def upload(work: Path) -> int:
    manifest = read_manifest(work)
    conn = import_wdpa.open_connection()
    try:
        release = fetch_release(conn)
        stored = stored_eco_ids(conn)
        print(f"already stored: {len(stored)} of {manifest['rows']}", flush=True)
        batch: list[dict] = []
        size = 0
        written = 0

        def flush() -> None:
            nonlocal size, written
            if not batch:
                return
            with conn.cursor() as cur:
                for params in batch:
                    cur.execute(INSERT_SQL, params)
            conn.commit()
            written += len(batch)
            print(f"written: {len(stored) + written} of {manifest['rows']}", flush=True)
            batch.clear()
            size = 0

        for row in read_rows(work):
            record = dict(zip(COLUMNS, row))
            if record["eco_id"] in stored:
                continue
            wkb = bytes.fromhex(record["wkb"])
            if batch and (len(batch) >= BATCH_ROWS or size + len(wkb) > BATCH_BYTES):
                flush()
            batch.append(
                {
                    "name": record["name"],
                    "type": PLACE_TYPE,
                    "wkb": wkb,
                    "source": PINNED_SOURCE,
                    "release": release,
                    "kind": ID_KIND,
                    "eco_id": record["eco_id"],
                    "biome": record["biome"],
                    "realm": record["realm"],
                    "attributes": record["attributes"],
                }
            )
            size += len(wkb)
        flush()
        print(f"upload finished: {written} written. Run: check", flush=True)
        return written
    finally:
        conn.close()


# --- check -------------------------------------------------------------------

CHECK_SQL = """
select
  ids.source_record_id as eco_id,
  places.name,
  places.publication_status,
  places.place_type_id,
  (select count(*) from public.place_boundaries as b
    where b.place_id = places.id and b.is_current) as current_boundaries,
  boundary.version_number,
  boundary.area_km2,
  extensions.st_isvalid(boundary.geom) as valid,
  details.place_id is not null as has_details,
  (select count(*) from public.place_source_ids as other
    where other.place_id = places.id and other.match_status = 'confirmed') as confirmed_ids
from public.place_source_ids as ids
join public.places on places.id = ids.place_id
left join public.place_boundaries as boundary
  on boundary.place_id = places.id and boundary.is_current
left join public.ecoregion_details as details on details.place_id = places.id
where ids.source_id = %(source)s and ids.id_kind = %(kind)s and ids.match_status = 'confirmed'
"""

COUNT_SQL = """
select count(*) as n from public.places where place_type_id = %(type)s
"""


def check(work: Path) -> dict:
    expected = {
        row[0]: (row[1], float(row[5])) for row in read_rows(work)
    }
    conn = import_wdpa.open_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(CHECK_SQL, {"source": PINNED_SOURCE, "kind": ID_KIND})
            rows = cur.fetchall()
            cur.execute(COUNT_SQL, {"type": PLACE_TYPE})
            typed = cur.fetchone()["n"]
        conn.commit()
    finally:
        conn.close()
    result = check_rows(rows, expected, typed)
    print(json.dumps(result, indent=2), flush=True)
    if result["problems"]:
        raise SystemExit("check failed")
    print("check ok", flush=True)
    return result


def check_rows(rows: list[dict], expected: dict, typed: int) -> dict:
    problems: list[str] = []
    found = {row["eco_id"]: row for row in rows}
    missing = sorted(set(expected) - set(found), key=int)
    extra = sorted(set(found) - set(expected), key=int)
    if missing:
        problems.append(f"{len(missing)} ecoregions not stored, first {missing[:5]}")
    if extra:
        problems.append(f"{len(extra)} stored ecoregions not in the file: {extra[:5]}")
    if typed != len(found):
        problems.append(f"{typed} places of type {PLACE_TYPE}, {len(found)} with an eco_id")
    worst = 0.0
    for eco_id, row in found.items():
        label = f"ECO_ID {eco_id}"
        if row["publication_status"] != "published" or row["place_type_id"] != PLACE_TYPE:
            problems.append(f"{label}: {row['place_type_id']} {row['publication_status']}")
        if row["current_boundaries"] != 1 or row["version_number"] != 1 or not row["valid"]:
            problems.append(f"{label}: not one valid current version 1 boundary")
        if not row["has_details"] or row["confirmed_ids"] != 1:
            problems.append(f"{label}: details or source id missing")
        if eco_id in expected and row["area_km2"] is not None:
            want = expected[eco_id][1]
            change = abs(row["area_km2"] - want) / want
            worst = max(worst, change)
            if change > AREA_TOLERANCE:
                problems.append(f"{label}: area_km2 {row['area_km2']:.2f}, file {want:.2f}")
    areas = sorted(
        ((row["area_km2"] or 0.0, row["name"]) for row in found.values()), reverse=True
    )
    return {
        "stored": len(found),
        "expected": len(expected),
        "total_km2": round(sum(area for area, _name in areas), 1),
        "largest": [{"name": name, "km2": round(area, 1)} for area, name in areas[:5]],
        "worst_area_difference": worst,
        "problems": problems,
    }


if __name__ == "__main__":
    main()
