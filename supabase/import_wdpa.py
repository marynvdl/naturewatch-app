#!/usr/bin/env python3
"""Load the pinned October 2026 WDPCA extract into places, in four steps.

  build   Download and check the pinned zip, then write one filtered and
          validated file of terrestrial polygons of about 10 km2 or more.
          No database connection.
  probe   Time a connection to the database and test one small COPY.
          Writes nothing that stays.
  upload  Write the filtered file straight into public.places in committed
          batches, on (source_release_id, source_id). Rows under 10 km2 are
          left out. A second start continues from the places already there.
          It never deletes a place. The geometry is stored once, because the
          database disk is too small to hold a stage and the places.
  merge   Read-only check of the result against the file (the name is kept
          for the existing commands): counts, invalid geometry, facts.

`run` (the default) does build, probe, then upload. Run `merge` afterwards.

The download URL and SHA-256 checksum are the sources row from the records
migration. This script always downloads that URL. It does not read a local
geodatabase as the source.
"""

from __future__ import annotations

import csv
import gzip
import hashlib
import hmac
import json
import os
import posixpath
import shutil
import statistics
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from urllib.parse import quote

PINNED_NAME = "WDPCA"
PINNED_RELEASE = "2026-10-01"
PINNED_URL = (
    "https://pp-import-production.s3.eu-west-1.amazonaws.com/"
    "WDPA_WDOECM_Oct2026_Public.zip"
)
PINNED_SHA256 = "f5f5e50f230923619ad60faf8296e4f39a4d8c1b14bb6ea80e82ea6db6292b1c"
DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
# Hosted project ref and the direct database host. Identifiers, not secrets.
HOSTED_PROJECT_REF = "fwfbmvwdbsutmalhszvi"
HOSTED_DIRECT_HOST = f"db.{HOSTED_PROJECT_REF}.supabase.co"
PROGRESS_EVERY = 10_000
# The local geodesic area matches PostGIS to about 1e-10. A polygon below this
# cannot reach 10 km2 once PostGIS measures it.
STAGE_MIN_KM2 = 9.99
IUCN_CATEGORIES = {
    "Ia",
    "Ib",
    "II",
    "III",
    "IV",
    "V",
    "VI",
    "Not Applicable",
    "Not Assigned",
    "Not Reported",
}
REQUIRED_FIELDS = (
    "SITE_PID",
    "SITE_ID",
    "NAME",
    "NAME_ENG",
    "DESIG_ENG",
    "IUCN_CAT",
    "REALM",
    "ISO3",
    "GIS_AREA",
)
# 112 km is longer than one degree anywhere on Earth, so a polygon whose
# planar area is below this cannot reach 10 km².
TOO_SMALL_DEGREE_AREA = 10.0 / (112.0 * 112.0)
BATCH_ROWS = 100
# A few polygons are very large. Send a batch early when it reaches this size.
BATCH_BYTES = 64 * 1024 * 1024
CONNECT_ATTEMPTS = 6
UPLOAD_ATTEMPTS = 6
FILTERED_NAME = "filtered.tsv.gz"
MANIFEST_NAME = "manifest.json"
COLUMNS = (
    "source_id",
    "site_id",
    "name",
    "designation",
    "iucn_category",
    "iso3",
    "realm",
    "wkb_hex",
)
COPY_BATCH = f"copy batch ({', '.join(COLUMNS)}) from stdin"
CREATE_BATCH = """
create temp table if not exists batch (
  source_id text,
  site_id text,
  name text,
  designation text,
  iucn_category text,
  iso3 text,
  realm text,
  wkb_hex text
) on commit delete rows
"""
INSERT_BATCH = """
with parsed as (
  select
    source_id, site_id, name, designation, iucn_category, iso3, realm,
    extensions.ST_Multi(
      extensions.ST_Force2D(
        extensions.ST_GeomFromWKB(decode(wkb_hex, 'hex'), 4326)
      )
    )::extensions.geometry(MultiPolygon, 4326) as geom
  from batch
)
insert into public.places (
  source_release_id, source_id, site_id, name, place_type, designation,
  iucn_category, iso3, realm, geom
)
select
  %s, source_id, site_id, name, 'protected_area', designation,
  iucn_category, iso3, realm, geom
from parsed
where extensions.st_area(geom::extensions.geography, true) / 1e6 >= 10
on conflict (source_release_id, source_id) do update
set
  site_id = excluded.site_id,
  name = excluded.name,
  place_type = excluded.place_type,
  designation = excluded.designation,
  iucn_category = excluded.iucn_category,
  iso3 = excluded.iso3,
  realm = excluded.realm,
  geom = excluded.geom
"""

csv.field_size_limit(2**31 - 1)


class LoginRoleError(Exception):
    """The database login could not be minted. Safe to retry."""


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("WDPA_STEP", "run")
    work = work_dir()
    if command == "build":
        build(work)
    elif command == "probe":
        default_seconds = os.environ.get("WDPA_PROBE_SECONDS", "120")
        probe(work, int(sys.argv[2]) if len(sys.argv) > 2 else int(default_seconds))
    elif command == "upload":
        upload(work)
    elif command == "merge":
        merge(work)
    elif command == "run":
        build(work)
        probe(work, 30)
        upload(work)
        print("upload finished. Check the stage, then run: merge", flush=True)
    else:
        raise SystemExit(f"unknown command {command!r}: build, probe, upload, merge, run")


def work_dir() -> Path:
    path = Path(os.environ.get("WDPA_WORK_DIR") or Path(tempfile.gettempdir()) / "wdpa-work")
    path.mkdir(parents=True, exist_ok=True)
    return path


# --- build: no database ------------------------------------------------------


def build(work: Path) -> dict:
    manifest_path = work / MANIFEST_NAME
    filtered = work / FILTERED_NAME
    if manifest_path.exists() and filtered.exists():
        manifest = read_manifest(work)
        print(f"filtered file already built: {manifest['kept']} polygons", flush=True)
        return manifest

    zip_path = work / "wdpa.zip"
    if zip_path.exists() and file_sha256(zip_path) == PINNED_SHA256:
        print("download already on disk and matches the pin", flush=True)
    else:
        print("download started", flush=True)
        download(PINNED_URL, zip_path, PINNED_SHA256)
        print("download finished", flush=True)
    extract_dir = work / "extract"
    marker = extract_dir / ".complete"
    if marker.exists():
        gdbs = sorted(path for path in extract_dir.rglob("*.gdb") if path.is_dir())
        gdb = gdbs[0]
    else:
        gdb = extract_geodatabase(zip_path, extract_dir)
        marker.write_text("ok\n")
    print(f"geodatabase ready: {gdb.name}", flush=True)

    part = work / (FILTERED_NAME + ".part")
    stats = write_filtered(gdb, part)
    digest = file_sha256(part)
    part.replace(filtered)
    # The geodatabase is not needed again. Free its space on the volume.
    shutil.rmtree(extract_dir, ignore_errors=True)
    manifest = {
        "pin_sha256": PINNED_SHA256,
        "rows_sha256": digest,
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        **stats,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest), flush=True)
    return manifest


def write_filtered(gdb: Path, out: Path) -> dict:
    try:
        from osgeo import ogr
    except ImportError as exc:
        raise SystemExit("GDAL Python bindings (osgeo) are required") from exc
    require_area_libraries()

    ogr.UseExceptions()
    dataset = ogr.Open(str(gdb), 0)
    if dataset is None:
        raise SystemExit(f"could not open geodatabase {gdb.name}")
    problems: list[str] = []
    seen: set[str] = set()
    stats = {
        "terrestrial": 0,
        "gis_area_ge_10": 0,
        "kept": 0,
        "kept_gis_area_ge_10": 0,
        "skipped_below_threshold": 0,
        "unmeasured": 0,
    }
    try:
        layers = polygon_layers(dataset)
        if not layers:
            raise SystemExit("download has no polygon layer")
        with gzip.open(out, "wt", newline="", compresslevel=3) as handle:
            writer = csv.writer(handle, delimiter="\t", lineterminator="\n")
            for layer in layers:
                missing = [
                    name
                    for name in REQUIRED_FIELDS
                    if layer.GetLayerDefn().GetFieldIndex(name) < 0
                ]
                if missing:
                    raise SystemExit(
                        f"{layer.GetName()} is missing fields: {', '.join(missing)}"
                    )
                for feature in layer:
                    row = filter_feature(feature, ogr, seen, problems, stats)
                    if row is not None:
                        writer.writerow(row)
                        stats["kept"] += 1
    finally:
        dataset.Release()
    if stats["terrestrial"] == 0:
        raise SystemExit("no terrestrial polygons in the download")
    if problems:
        out.unlink(missing_ok=True)
        for problem in problems[:100]:
            print(problem)
        raise SystemExit(f"{len(problems)} polygons failed validation")
    return stats


def filter_feature(feature, ogr, seen: set[str], problems: list[str], stats: dict):
    """Return the row to stage, or None when the polygon is left out."""
    realm = text(feature, "REALM")
    if realm != "Terrestrial":
        return None
    stats["terrestrial"] += 1
    if stats["terrestrial"] % PROGRESS_EVERY == 0:
        print(
            f"terrestrial polygons read: {stats['terrestrial']}; kept: {stats['kept']}",
            flush=True,
        )
    source_id = text(feature, "SITE_PID")
    if not source_id:
        problems.append("missing SITE_PID on a terrestrial polygon")
        return None
    if source_id in seen:
        problems.append(f"duplicate SITE_PID {source_id}")
        return None
    seen.add(source_id)
    geometry = feature.GetGeometryRef()
    if geometry is None or geometry.IsEmpty():
        problems.append(f"invalid geometry {source_id}: missing geometry")
        return None
    flat_type = ogr.GT_Flatten(geometry.GetGeometryType())
    if flat_type not in (ogr.wkbPolygon, ogr.wkbMultiPolygon):
        problems.append(f"invalid geometry {source_id}: {geometry.GetGeometryName()}")
        return None
    site_id = text(feature, "SITE_ID")
    if not site_id:
        problems.append(f"missing SITE_ID for {source_id}")
        return None
    name = text(feature, "NAME_ENG") or text(feature, "NAME")
    if not name:
        problems.append(f"missing name for {source_id}")
        return None
    iucn = text(feature, "IUCN_CAT")
    if iucn is not None and iucn not in IUCN_CATEGORIES:
        problems.append(f"{source_id}: IUCN_CAT {iucn!r} is outside the WDPA set")
        return None
    gis_area = number(feature, "GIS_AREA")
    if gis_area is not None and gis_area >= 10:
        stats["gis_area_ge_10"] += 1
    if not stage_this_polygon(geometry, gis_area, stats):
        stats["skipped_below_threshold"] += 1
        return None
    if not geometry.IsValid():
        problems.append(f"invalid geometry {source_id}: not valid")
        return None
    if gis_area is not None and gis_area >= 10:
        stats["kept_gis_area_ge_10"] += 1
    return [
        source_id,
        site_id,
        name,
        text(feature, "DESIG_ENG") or "",
        iucn or "",
        text(feature, "ISO3") or "",
        realm,
        bytes(geometry.ExportToWkb(ogr.wkbNDR)).hex(),
    ]


def stage_this_polygon(geometry, gis_area: float | None, stats: dict | None = None) -> bool:
    """True when the polygon should go into the filtered file.

    GIS_AREA of at least 10 is kept. A smaller or missing GIS_AREA is kept only
    when a geodesic measurement of the outline reaches STAGE_MIN_KM2. A polygon
    that cannot be measured is kept and counted, so a measuring fault can never
    drop a place. PostGIS makes the final decision at the merge.
    """
    if too_small_to_store(geometry, gis_area):
        return False
    if gis_area is not None and gis_area >= 10:
        return True
    measured = geodesic_area_km2(geometry)
    if measured is None:
        if stats is not None:
            stats["unmeasured"] = stats.get("unmeasured", 0) + 1
        return True
    return measured >= STAGE_MIN_KM2


def require_area_libraries() -> None:
    try:
        import pyproj  # noqa: F401
        import shapely  # noqa: F401
    except ImportError as exc:
        raise SystemExit(
            "shapely and pyproj are required to measure polygon areas"
        ) from exc


_geod = None


def geodesic_area_km2(geometry) -> float | None:
    """Geodesic area on the WGS84 ellipsoid, as PostGIS measures a geography.

    GDAL returns the geometry as a bytearray and shapely reads only bytes.
    Returns None when this one geometry cannot be measured.
    """
    global _geod
    require_area_libraries()
    from pyproj import Geod
    from shapely import wkb as shapely_wkb

    try:
        if _geod is None:
            _geod = Geod(ellps="WGS84")
        shape = shapely_wkb.loads(bytes(geometry.ExportToIsoWkb()))
        area_m2, _perimeter = _geod.geometry_area_perimeter(shape)
        return abs(float(area_m2)) / 1e6
    except Exception:
        return None


def too_small_to_store(geometry, gis_area: float | None) -> bool:
    """True when both the source area and the outline are below 10 km².

    GIS_AREA under 1 km² can still hide a large outline, so the outline is
    checked too. Calculated area_km2 remains the rule for anything stored.
    """
    if gis_area is None or gis_area >= 1:
        return False
    try:
        planar = abs(float(geometry.GetArea()))
    except (TypeError, ValueError):
        return False
    return 0 < planar < TOO_SMALL_DEGREE_AREA


def read_manifest(work: Path) -> dict:
    manifest_path = work / MANIFEST_NAME
    filtered = work / FILTERED_NAME
    if not manifest_path.exists() or not filtered.exists():
        raise SystemExit("no filtered file: run build first")
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("pin_sha256") != PINNED_SHA256:
        raise SystemExit("filtered file was built from a different pin")
    if file_sha256(filtered) != manifest.get("rows_sha256"):
        raise SystemExit("filtered file does not match its manifest checksum")
    return manifest


def read_rows(work: Path):
    with gzip.open(work / FILTERED_NAME, "rt", newline="") as handle:
        for row in csv.reader(handle, delimiter="\t"):
            yield row


def file_sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


# --- database connection -----------------------------------------------------


def database_url_for_run() -> tuple[str, bool]:
    """Return a database URL and whether it is the hosted login role.

    The hosted run sets SUPABASE_ACCESS_TOKEN and mints a short-lived login role
    when it connects. The URL uses the direct database host.
    """
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not token:
        return os.environ.get("DATABASE_URL") or DEFAULT_DATABASE_URL, False
    _secrets.append(token)
    request = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{HOSTED_PROJECT_REF}/cli/login-role",
        data=json.dumps({"read_only": False}).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "sooty-earth-records",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            raise SystemExit(f"login role refused: HTTP {exc.code}") from None
        raise LoginRoleError(f"login role failed: HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise LoginRoleError(f"login role failed: {type(exc).__name__}") from None
    role = str(payload.get("role") or "")
    password = str(payload.get("password") or "")
    if not role or not password:
        raise LoginRoleError("login role response did not include a role")
    _secrets.append(password)
    print(f"login role ready, ttl_seconds={payload.get('ttl_seconds')}", flush=True)
    user = quote(role, safe="")
    url = (
        f"postgresql://{user}:{quote(password, safe='')}"
        f"@{HOSTED_DIRECT_HOST}:5432/postgres"
    )
    return url, True


def open_connection(attempts: int = CONNECT_ATTEMPTS):
    """Connect, retrying a login or connection timeout with a growing pause."""
    import psycopg
    from psycopg.rows import dict_row

    delay = 15
    for attempt in range(1, attempts + 1):
        try:
            url, hosted = database_url_for_run()
            conn = psycopg.connect(
                url,
                row_factory=dict_row,
                connect_timeout=30,
                keepalives=1,
                keepalives_idle=30,
                keepalives_interval=10,
                keepalives_count=5,
            )
            prepare_session(conn, hosted)
            conn.commit()
            return conn
        except (psycopg.OperationalError, LoginRoleError) as exc:
            print(
                f"connect attempt {attempt} of {attempts} failed: {first_line(exc)}",
                flush=True,
            )
            if attempt == attempts:
                raise SystemExit("could not connect to the database") from None
            time.sleep(delay)
            delay = min(delay * 2, 240)
    raise SystemExit("could not connect to the database")


def prepare_session(conn, hosted: bool) -> None:
    conn.execute("set statement_timeout = 0")
    conn.execute("set idle_in_transaction_session_timeout = 0")
    if not hosted:
        return
    conn.execute("set role postgres")
    who = conn.execute("select current_user").fetchone()
    print(f"connected as {who['current_user']}", flush=True)


def scrub(text_value: str) -> str:
    cleaned = text_value
    for secret in _secrets:
        if secret:
            cleaned = cleaned.replace(secret, "***")
    return cleaned


def first_line(exc: BaseException) -> str:
    lines = scrub(str(exc)).splitlines()
    return lines[0] if lines else type(exc).__name__


_secrets: list[str] = []


# --- probe -------------------------------------------------------------------


def probe(work: Path, seconds: int = 120) -> None:
    """Time the connection, then test one COPY. Nothing stays in the database."""
    import psycopg

    conn = open_connection()
    latencies: list[float] = []
    failures = 0
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        started = time.monotonic()
        try:
            conn.execute("select 1").fetchone()
            conn.commit()
            latencies.append(time.monotonic() - started)
        except psycopg.Error as exc:
            failures += 1
            print(f"probe ping failed: {first_line(exc)}", flush=True)
            conn = open_connection(2)
        time.sleep(5)
    if latencies:
        print(
            "probe pings: "
            f"{len(latencies)} ok, {failures} failed, "
            f"min {min(latencies) * 1000:.0f} ms, "
            f"median {statistics.median(latencies) * 1000:.0f} ms, "
            f"max {max(latencies) * 1000:.0f} ms",
            flush=True,
        )
    if failures or not latencies:
        raise SystemExit("probe failed: the connection is not reliable")
    if (work / FILTERED_NAME).exists():
        rows = []
        for row in read_rows(work):
            rows.append(row)
            if len(rows) == BATCH_ROWS:
                break
        with conn.cursor() as cur:
            cur.execute("set search_path to public, extensions")
            cur.execute(CREATE_BATCH)
            copy_rows(cur, rows)
            cur.execute(
                "select count(*) as rows, "
                "sum(extensions.ST_NPoints(extensions.ST_GeomFromWKB(decode(wkb_hex, 'hex'), 4326))) as points "
                "from batch"
            )
            result = cur.fetchone()
        conn.rollback()
        print(f"probe copy: {result['rows']} rows, {result['points']} points", flush=True)
    conn.close()


# --- upload ------------------------------------------------------------------


def copy_rows(cur, rows: list[list[str]]) -> None:
    with cur.copy(COPY_BATCH) as copy:
        for row in rows:
            copy.write_row([value if value != "" else None for value in row])


def upload(work: Path) -> None:
    import psycopg

    manifest = read_manifest(work)
    conn = open_connection()
    attempts = 0
    while True:
        try:
            staged = prepare_stage(conn, work)
            print(f"already stored: {len(staged)} of {manifest['kept']}", flush=True)
            total = send_rows(conn, work, staged, manifest["kept"])
            print(f"stored: {total} of {manifest['kept']} (rows under 10 km2 are left out)", flush=True)
            break
        except (psycopg.OperationalError, psycopg.InterfaceError) as exc:
            if isinstance(exc, psycopg.errors.InsufficientResources):
                raise
            attempts += 1
            print(
                f"upload connection lost ({attempts} of {UPLOAD_ATTEMPTS}): "
                f"{first_line(exc)}",
                flush=True,
            )
            if attempts >= UPLOAD_ATTEMPTS:
                raise SystemExit("upload stopped: the connection kept failing") from None
            try:
                conn.close()
            except Exception:
                pass
            time.sleep(30)
            conn = open_connection()
    conn.close()


def prepare_stage(conn, work: Path) -> set[str]:
    source = fetch_source(conn)
    with conn.cursor() as cur:
        cur.execute("set search_path to public, extensions")
        cur.execute(
            "select source_id from public.places where source_release_id = %s",
            (source["id"],),
        )
        stored = {row["source_id"] for row in cur.fetchall()}
    conn.commit()
    in_file = {row[0] for row in read_rows(work)}
    missing = sorted(stored - in_file)
    if missing:
        raise SystemExit(
            f"refusing to load: {len(missing)} stored places are not in the filtered "
            f"file: {', '.join(missing[:20])}"
        )
    move_leftover_stage(conn, source["id"])
    with conn.cursor() as cur:
        cur.execute(CREATE_BATCH)
        cur.execute(
            "select source_id from public.places where source_release_id = %s",
            (source["id"],),
        )
        stored = {row["source_id"] for row in cur.fetchall()}
    conn.commit()
    return stored


def move_leftover_stage(conn, release) -> None:
    """Move rows left in places_load by an earlier run into places, then drop it."""
    with conn.cursor() as cur:
        cur.execute("select to_regclass('public.places_load') is not null as present")
        present = bool(cur.fetchone()["present"])
    conn.commit()
    if not present:
        return
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.places (
              source_release_id, source_id, site_id, name, place_type, designation,
              iucn_category, iso3, realm, geom
            )
            select source_release_id, source_id, site_id, name, 'protected_area',
              designation, iucn_category, iso3, realm, geom
            from public.places_load
            where source_release_id = %s and area_km2 >= 10
            on conflict (source_release_id, source_id) do update
            set site_id = excluded.site_id, name = excluded.name,
              place_type = excluded.place_type, designation = excluded.designation,
              iucn_category = excluded.iucn_category, iso3 = excluded.iso3,
              realm = excluded.realm, geom = excluded.geom
            """,
            (release,),
        )
        print(f"moved {cur.rowcount} rows from places_load into places", flush=True)
        cur.execute("drop table public.places_load")
    conn.commit()


def send_rows(conn, work: Path, staged: set[str], expected: int) -> int:
    source = fetch_source(conn)
    batch: list[list[str]] = []
    batch_size = 0
    total = len(staged)
    sent_batches = 0

    def flush() -> None:
        nonlocal total, sent_batches, batch_size
        if not batch:
            return
        with conn.cursor() as cur:
            copy_rows(cur, batch)
            cur.execute(INSERT_BATCH, (source["id"],))
        conn.commit()
        total += len(batch)
        staged.update(row[0] for row in batch)
        batch.clear()
        batch_size = 0
        sent_batches += 1
        if sent_batches % 5 == 0:
            print(f"sent: {total} of {expected}", flush=True)

    for row in read_rows(work):
        if row[0] in staged:
            continue
        batch.append(row)
        batch_size += len(row[-1])
        if len(batch) >= BATCH_ROWS or batch_size >= BATCH_BYTES:
            flush()
    flush()
    return total


def fetch_source(conn) -> dict:
    with conn.cursor() as cur:
        cur.execute(
            """
            select id, name, release_month::text as release_month, download_url, checksum
            from public.sources
            where name = %s and release_month = %s::date
            """,
            (PINNED_NAME, PINNED_RELEASE),
        )
        row = cur.fetchone()
    if row is None:
        raise SystemExit(
            "WDPCA October 2026 source row is missing. Apply the records migration first."
        )
    download_url = row["download_url"]
    checksum = str(row["checksum"]).lower()
    if (
        row["name"] != PINNED_NAME
        or row["release_month"] != PINNED_RELEASE
        or download_url != PINNED_URL
        or checksum != PINNED_SHA256
    ):
        raise SystemExit(
            "sources row does not match the pinned October 2026 WDPCA download"
        )
    row["checksum"] = checksum
    return row


# --- check -------------------------------------------------------------------


def merge(work: Path) -> None:
    """Read-only check of public.places against the filtered file."""
    manifest = read_manifest(work)
    conn = open_connection()
    source = fetch_source(conn)
    release = source["id"]
    expected = {row[0] for row in read_rows(work)}
    problems: list[str] = []
    with conn.cursor() as cur:
        cur.execute("set search_path to public, extensions")
        cur.execute(
            "select source_id, area_km2 from public.places where source_release_id = %s",
            (release,),
        )
        stored = {row["source_id"]: row["area_km2"] for row in cur.fetchall()}
        cur.execute(
            """
            select source_id, extensions.ST_IsValidReason(geom) as reason
            from public.places
            where source_release_id = %s and not extensions.ST_IsValid(geom)
            order by source_id
            """,
            (release,),
        )
        invalid = cur.fetchall()
        cur.execute("select count(*) as n from public.facts")
        facts = int(cur.fetchone()["n"])
        cur.execute("select to_regclass('public.places_load') is not null as present")
        stage_left = bool(cur.fetchone()["present"])
    conn.rollback()
    conn.close()
    unknown = sorted(set(stored) - expected)
    absent = sorted(
        source_id for source_id in expected - set(stored)
    )
    under = sorted(source_id for source_id, area in stored.items() if area < 10)
    if unknown:
        problems.append(f"{len(unknown)} stored places are not in the file")
    if under:
        problems.append(f"{len(under)} stored places are under 10 km2")
    if invalid:
        problems.append(f"{len(invalid)} invalid geometries")
        for row in invalid[:20]:
            print(f"invalid geometry {row['source_id']}: {row['reason']}")
    if stage_left:
        problems.append("places_load still exists")
    print(f"terrestrial polygons: {manifest['terrestrial']}", flush=True)
    print(f"GIS_AREA >= 10: {manifest['gis_area_ge_10']}", flush=True)
    print(f"stored areas of 10 km2 or more: {len(stored)}", flush=True)
    print(f"in the file but not stored (should be under 10 km2): {len(absent)}", flush=True)
    print(f"facts: {facts}", flush=True)
    if len(stored) < manifest["gis_area_ge_10"]:
        problems.append("fewer places stored than polygons with GIS_AREA >= 10")
    if problems:
        raise SystemExit("check failed: " + "; ".join(problems))
    print("check ok", flush=True)


# --- download and geodatabase ------------------------------------------------


def download(url: str, dest: Path, expected_sha256: str) -> None:
    if url != PINNED_URL:
        raise SystemExit(f"refusing to download a URL that is not the pinned source: {url}")
    hasher = hashlib.sha256()
    request = urllib.request.Request(url, headers={"User-Agent": "sooty-earth-records"})
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            status = getattr(response, "status", 200)
            if status != 200:
                raise SystemExit(f"download failed for {url}: HTTP {status}")
            with dest.open("wb") as handle:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
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


def extract_geodatabase(zip_path: Path, dest: Path) -> Path:
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as archive:
        members = []
        for info in archive.infolist():
            name = info.filename
            if ".gdb/" not in name and not name.endswith(".gdb"):
                continue
            normalized = posixpath.normpath(name)
            if normalized.startswith("/") or normalized.startswith(".."):
                raise SystemExit(f"download contains an unsafe path: {name}")
            members.append(info)
        if not members:
            raise SystemExit("download has no geodatabase")
        for info in members:
            archive.extract(info, dest)
    gdbs = sorted(path for path in dest.rglob("*.gdb") if path.is_dir())
    if len(gdbs) != 1:
        raise SystemExit(f"expected one geodatabase, found {[str(path) for path in gdbs]}")
    return gdbs[0]


def polygon_layers(dataset):
    from osgeo import ogr

    layers = []
    for index in range(dataset.GetLayerCount()):
        layer = dataset.GetLayerByIndex(index)
        geom_type = ogr.GT_Flatten(layer.GetGeomType())
        if geom_type in (ogr.wkbPolygon, ogr.wkbMultiPolygon):
            layers.append(layer)
    return layers


def text(feature, name: str) -> str | None:
    index = feature.GetDefnRef().GetFieldIndex(name)
    if not feature.IsFieldSet(index) or feature.IsFieldNull(index):
        return None
    value = str(feature.GetField(index)).strip()
    return value or None


def number(feature, name: str) -> float | None:
    index = feature.GetDefnRef().GetFieldIndex(name)
    if not feature.IsFieldSet(index) or feature.IsFieldNull(index):
        return None
    return float(feature.GetField(index))


if __name__ == "__main__":
    import psycopg

    try:
        main()
    except psycopg.Error as exc:
        raise SystemExit(f"database error: {scrub(str(exc))}") from None
