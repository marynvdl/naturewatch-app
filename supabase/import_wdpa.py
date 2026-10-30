#!/usr/bin/env python3
"""Load the pinned October 2026 WDPCA extract into places.

The download URL and SHA-256 checksum are the sources row from the records
migration. This script always downloads that URL. It does not read a local
geodatabase as the source.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import posixpath
import tempfile
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass
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
# Bulk COPY goes to this host. The pooler stalls on large geometry binds.
HOSTED_PROJECT_REF = "fwfbmvwdbsutmalhszvi"
HOSTED_DIRECT_HOST = f"db.{HOSTED_PROJECT_REF}.supabase.co"
PROGRESS_EVERY = 10_000
# Local geodesic area can sit just under the PostGIS spheroid area.
LOCAL_AREA_MARGIN_KM2 = 9.9
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
COPY_BATCH = """
copy batch (
  source_id, site_id, name, designation, iucn_category, iso3, realm, wkb
) from stdin
"""
INSERT_BATCH = """
insert into public.places_load (
  source_release_id, source_id, site_id, name, designation,
  iucn_category, iso3, realm, geom
)
select
  %s,
  source_id,
  site_id,
  name,
  designation,
  iucn_category,
  iso3,
  realm,
  extensions.ST_Multi(
    extensions.ST_Force2D(extensions.ST_GeomFromWKB(wkb, 4326))
  )::extensions.geometry(MultiPolygon, 4326)
from batch
on conflict (source_release_id, source_id) do nothing
"""


@dataclass(frozen=True)
class PlaceFeature:
    source_id: str
    site_id: str
    name: str
    designation: str | None
    iucn_category: str | None
    iso3: str | None
    realm: str
    wkb: bytes


def main() -> None:
    import psycopg
    from psycopg.rows import dict_row

    if os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip():
        confirm_direct_connection()
    with tempfile.TemporaryDirectory(prefix="wdpa-") as tmp:
        root = Path(tmp)
        zip_path = root / "wdpa.zip"
        print("download started", flush=True)
        download(PINNED_URL, zip_path, PINNED_SHA256)
        print("download finished", flush=True)
        gdb = extract_geodatabase(zip_path, root / "extract")
        print(f"geodatabase ready: {gdb.name}", flush=True)
        database_url, hosted = database_url_for_run()
        with psycopg.connect(
            database_url,
            row_factory=dict_row,
            connect_timeout=30,
            keepalives=1,
            keepalives_idle=30,
            keepalives_interval=10,
            keepalives_count=5,
        ) as conn:
            prepare_session(conn, hosted)
            source = fetch_source(conn)
            print("source row matches the pin", flush=True)
            print("import started", flush=True)
            terrestrial, gis_area_count, stored = import_geodatabase(
                conn, source["id"], gdb
            )
    print(f"terrestrial polygons: {terrestrial}", flush=True)
    print(f"GIS_AREA >= 10: {gis_area_count}", flush=True)
    print(f"stored area_km2 >= 10: {stored}", flush=True)


def database_url_for_run() -> tuple[str, bool]:
    """Return a database URL and whether it is the hosted login role.

    The hosted run sets SUPABASE_ACCESS_TOKEN and mints a login role only after
    the zip is on disk. The URL uses the direct database host.
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
        raise SystemExit(f"login role failed: HTTP {exc.code}") from exc
    role = str(payload.get("role") or "")
    password = str(payload.get("password") or "")
    if not role or not password:
        raise SystemExit("login role response did not include a role")
    _secrets.append(password)
    print(f"login role ready, ttl_seconds={payload.get('ttl_seconds')}", flush=True)
    print(f"connecting directly to {HOSTED_DIRECT_HOST}", flush=True)
    user = quote(role, safe="")
    url = (
        f"postgresql://{user}:{quote(password, safe='')}"
        f"@{HOSTED_DIRECT_HOST}:5432/postgres"
    )
    return url, True


def confirm_direct_connection() -> None:
    import psycopg
    from psycopg.rows import dict_row

    database_url, hosted = database_url_for_run()
    with psycopg.connect(
        database_url,
        row_factory=dict_row,
        connect_timeout=30,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5,
    ) as conn:
        prepare_session(conn, hosted)
        conn.execute("select 1")
    print("direct connection ok", flush=True)


def prepare_session(conn, hosted: bool) -> None:
    conn.execute("set statement_timeout = 0")
    conn.execute("set idle_in_transaction_session_timeout = 0")
    if not hosted:
        return
    conn.execute("set role postgres")
    who = conn.execute("select current_user").fetchone()
    print(f"connected as {who['current_user']}", flush=True)


def scrub(text: str) -> str:
    cleaned = text
    for secret in _secrets:
        if secret:
            cleaned = cleaned.replace(secret, "***")
    return cleaned


_secrets: list[str] = []


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


def import_geodatabase(conn, source_release_id, gdb: Path) -> tuple[int, int, int]:
    try:
        from osgeo import ogr
    except ImportError as exc:
        raise SystemExit("GDAL Python bindings (osgeo) are required") from exc

    ogr.UseExceptions()
    dataset = ogr.Open(str(gdb), 0)
    if dataset is None:
        raise SystemExit(f"could not open geodatabase {gdb.name}")
    try:
        layers = polygon_layers(dataset)
        if not layers:
            raise SystemExit("download has no polygon layer")
        with conn.cursor() as cur:
            cur.execute("set search_path to public, extensions")
            ensure_places_load(cur)
            conn.commit()
            cur.execute(
                """
                create temp table batch (
                  source_id text,
                  site_id text,
                  name text,
                  designation text,
                  iucn_category text,
                  iso3 text,
                  realm text,
                  wkb bytea
                ) on commit delete rows
                """
            )
            conn.commit()
            staged = load_staged_ids(cur, source_release_id)
            print(f"already staged: {len(staged)}", flush=True)
            terrestrial, gis_area_count, accepted = stream_candidates(
                conn, cur, layers, source_release_id, staged
            )
            print(
                f"staged: {accepted}; checking geometry validity",
                flush=True,
            )
            if terrestrial == 0:
                raise SystemExit("no terrestrial polygons in the download")
            reject_invalid(cur)
            print("upsert started", flush=True)
            stored = upsert_places(cur, source_release_id)
            if stored == 0:
                conn.rollback()
                raise SystemExit("refusing to store zero places")
            conn.commit()
            cur.execute("drop table public.places_load")
            conn.commit()
        return terrestrial, gis_area_count, stored
    finally:
        dataset.Release()


def ensure_places_load(cur) -> None:
    cur.execute(
        """
        create table if not exists public.places_load (
          source_release_id uuid not null,
          source_id text not null,
          site_id text not null,
          name text not null,
          designation text,
          iucn_category text,
          iso3 text,
          realm text not null,
          geom extensions.geometry(MultiPolygon, 4326) not null,
          area_km2 double precision generated always as (
            extensions.st_area(geom::extensions.geography, true) / 1e6
          ) stored,
          primary key (source_release_id, source_id)
        )
        """
    )
    cur.execute("alter table public.places_load enable row level security")
    cur.execute(
        """
        revoke all on table public.places_load
        from public, anon, authenticated, service_role
        """
    )


def load_staged_ids(cur, source_release_id) -> set[str]:
    cur.execute(
        """
        select source_id
        from public.places_load
        where source_release_id = %s
        """,
        (source_release_id,),
    )
    return {row["source_id"] for row in cur.fetchall()}


def stream_candidates(conn, cur, layers, source_release_id, staged: set[str]) -> tuple[int, int, int]:
    from osgeo import ogr

    problems: list[str] = []
    seen: set[str] = set()
    batch: list[tuple] = []
    terrestrial = 0
    gis_area_count = 0
    accepted = len(staged)

    def flush() -> None:
        nonlocal accepted
        if not batch:
            return
        with cur.copy(COPY_BATCH) as copy:
            for row in batch:
                copy.write_row(row)
        cur.execute(INSERT_BATCH, (source_release_id,))
        accepted += len(batch)
        staged.update(row[0] for row in batch)
        batch.clear()
        conn.commit()
        print(f"staged: {accepted}", flush=True)

    for layer in layers:
        missing = [
            name
            for name in REQUIRED_FIELDS
            if layer.GetLayerDefn().GetFieldIndex(name) < 0
        ]
        if missing:
            raise SystemExit(f"{layer.GetName()} is missing fields: {', '.join(missing)}")
        for feature in layer:
            realm = text(feature, "REALM")
            if realm != "Terrestrial":
                continue
            terrestrial += 1
            if terrestrial % PROGRESS_EVERY == 0:
                print(
                    f"terrestrial polygons read: {terrestrial}; "
                    f"staged: {accepted + len(batch)}",
                    flush=True,
                )
            iso3 = text(feature, "ISO3")
            source_id = text(feature, "SITE_PID")
            if not source_id:
                problems.append("missing SITE_PID on a terrestrial polygon")
                continue
            if source_id in seen:
                problems.append(f"duplicate SITE_PID {source_id}")
                continue
            seen.add(source_id)
            if source_id in staged:
                continue
            geometry = feature.GetGeometryRef()
            if geometry is None or geometry.IsEmpty():
                problems.append(f"invalid geometry {source_id}: missing geometry")
                continue
            flat_type = ogr.GT_Flatten(geometry.GetGeometryType())
            if flat_type not in (ogr.wkbPolygon, ogr.wkbMultiPolygon):
                problems.append(
                    f"invalid geometry {source_id}: {geometry.GetGeometryName()}"
                )
                continue
            site_id = text(feature, "SITE_ID")
            if not site_id:
                problems.append(f"missing SITE_ID for {source_id}")
                continue
            name = text(feature, "NAME_ENG") or text(feature, "NAME")
            if not name:
                problems.append(f"missing name for {source_id}")
                continue
            iucn = text(feature, "IUCN_CAT")
            if iucn is not None and iucn not in IUCN_CATEGORIES:
                problems.append(f"{source_id}: IUCN_CAT {iucn!r} is outside the WDPA set")
                continue
            gis_area = number(feature, "GIS_AREA")
            if gis_area is not None and gis_area >= 10:
                gis_area_count += 1
            if not stage_this_polygon(geometry, gis_area):
                continue
            batch.append(
                (
                    source_id,
                    site_id,
                    name,
                    text(feature, "DESIG_ENG"),
                    iucn,
                    iso3,
                    realm,
                    geometry.ExportToWkb(ogr.wkbNDR),
                )
            )
            if len(batch) >= BATCH_ROWS:
                flush()
    flush()
    if problems:
        for problem in problems:
            print(problem)
        raise SystemExit(1)
    return terrestrial, gis_area_count, accepted


def stage_this_polygon(geometry, gis_area: float | None) -> bool:
    """True when the polygon should be copied into the staging table.

    GIS_AREA of at least 10 is staged and checked again in PostGIS.
    Anything smaller is staged only when a local geodesic measurement is
    near 10 km², or when that measurement cannot be made.
    """
    if too_small_to_store(geometry, gis_area):
        return False
    if gis_area is not None and gis_area >= 10:
        return True
    measured = geodesic_area_km2(geometry)
    if measured is None:
        return True
    return measured >= LOCAL_AREA_MARGIN_KM2


def geodesic_area_km2(geometry) -> float | None:
    global _geod
    try:
        from pyproj import Geod
        from shapely import wkb as shapely_wkb
    except ImportError:
        return None
    try:
        if _geod is None:
            _geod = Geod(ellps="WGS84")
        shape = shapely_wkb.loads(geometry.ExportToIsoWkb())
        area_m2, _perimeter = _geod.geometry_area_perimeter(shape)
        return abs(float(area_m2)) / 1e6
    except Exception:
        return None


_geod = None


def too_small_to_store(geometry, gis_area: float | None) -> bool:
    """True when both the source area and the outline are below 10 km².

    GIS_AREA under 1 km² can still hide a large outline, so the outline is
    checked too. Calculated area_km2 remains the rule for anything inserted.
    """
    if gis_area is None or gis_area >= 1:
        return False
    try:
        planar = abs(float(geometry.GetArea()))
    except (TypeError, ValueError):
        return False
    return 0 < planar < TOO_SMALL_DEGREE_AREA


def reject_invalid(cur) -> None:
    cur.execute(
        """
        select source_id, extensions.ST_IsValidReason(geom) as reason
        from public.places_load
        where not extensions.ST_IsValid(geom)
        order by source_id
        """
    )
    invalid = cur.fetchall()
    if not invalid:
        return
    for row in invalid:
        print(f"invalid geometry {row['source_id']}: {row['reason']}")
    raise SystemExit(1)


def upsert_places(cur, source_release_id) -> int:
    cur.execute(
        """
        insert into public.places (
          source_release_id,
          source_id,
          site_id,
          name,
          place_type,
          designation,
          iucn_category,
          iso3,
          realm,
          geom
        )
        select
          %s,
          source_id,
          site_id,
          name,
          'protected_area',
          designation,
          iucn_category,
          iso3,
          realm,
          geom
        from public.places_load
        where area_km2 >= 10
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
        """,
        (source_release_id,),
    )
    cur.execute(
        """
        delete from public.places as place
        where place.source_release_id = %s
          and not exists (
            select 1
            from public.places_load
            where places_load.source_id = place.source_id
              and places_load.area_km2 >= 10
          )
        """,
        (source_release_id,),
    )
    cur.execute(
        """
        select count(*) as stored
        from public.places
        where source_release_id = %s
        """,
        (source_release_id,),
    )
    return int(cur.fetchone()["stored"])


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
    except psycopg.errors.ForeignKeyViolation:
        raise SystemExit(
            "refusing to replace October 2026 places that already have facts"
        ) from None
    except psycopg.Error as exc:
        raise SystemExit(f"database error: {scrub(str(exc))}") from None
