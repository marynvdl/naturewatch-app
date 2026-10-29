#!/usr/bin/env python3
"""Load the pinned October 2026 WDPCA extract into places.

The download URL and SHA-256 checksum are the sources row from the records
migration. This script always downloads that URL. It does not read a local
geodatabase as the source.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import posixpath
import tempfile
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path

PINNED_NAME = "WDPCA"
PINNED_RELEASE = "2026-10-01"
PINNED_URL = (
    "https://pp-import-production.s3.eu-west-1.amazonaws.com/"
    "WDPA_WDOECM_Oct2026_Public.zip"
)
PINNED_SHA256 = "f5f5e50f230923619ad60faf8296e4f39a4d8c1b14bb6ea80e82ea6db6292b1c"
DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
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
INSERT_CANDIDATE = """
insert into candidate (
  source_id, site_id, name, designation, iucn_category, iso3, realm, geom
)
values (
  %s, %s, %s, %s, %s, %s, %s,
  extensions.ST_Multi(
    extensions.ST_Force2D(extensions.ST_GeomFromWKB(%s, 4326))
  )::extensions.geometry(MultiPolygon, 4326)
)
"""
# 112 km is longer than one degree anywhere on Earth, so a polygon whose
# planar area is below this cannot reach 10 km².
TOO_SMALL_DEGREE_AREA = 10.0 / (112.0 * 112.0)
BATCH_ROWS = 200


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

    database_url = os.environ.get("DATABASE_URL") or DEFAULT_DATABASE_URL
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        source = fetch_source(conn)
        with tempfile.TemporaryDirectory(prefix="wdpa-") as tmp:
            root = Path(tmp)
            zip_path = root / "wdpa.zip"
            download(source["download_url"], zip_path, source["checksum"])
            gdb = extract_geodatabase(zip_path, root / "extract")
            terrestrial, gis_area_count, stored = import_geodatabase(
                conn, source["id"], gdb
            )
    print(f"terrestrial polygons: {terrestrial}")
    print(f"GIS_AREA >= 10: {gis_area_count}")
    print(f"stored area_km2 >= 10: {stored}")


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
            cur.execute(
                """
                create temp table candidate (
                  source_id text primary key,
                  site_id text,
                  name text,
                  designation text,
                  iucn_category text,
                  iso3 text,
                  realm text,
                  geom extensions.geometry(MultiPolygon, 4326) not null,
                  area_km2 double precision generated always as (
                    extensions.st_area(geom::extensions.geography, true) / 1e6
                  ) stored
                ) on commit drop
                """
            )
            terrestrial, gis_area_count, _accepted = stream_candidates(cur, layers)
            if terrestrial == 0:
                raise SystemExit("no terrestrial polygons in the download")
            reject_invalid(cur)
            stored = upsert_places(cur, source_release_id)
        if stored == 0:
            raise SystemExit("refusing to store zero places")
        return terrestrial, gis_area_count, stored
    finally:
        dataset.Release()


def stream_candidates(cur, layers) -> tuple[int, int, int]:
    from osgeo import ogr

    problems: list[str] = []
    seen: set[str] = set()
    batch: list[tuple] = []
    terrestrial = 0
    gis_area_count = 0
    accepted = 0

    def flush() -> None:
        nonlocal accepted
        if not batch:
            return
        cur.executemany(INSERT_CANDIDATE, batch)
        accepted += len(batch)
        batch.clear()

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
            iso3 = text(feature, "ISO3")
            source_id = text(feature, "SITE_PID")
            if not source_id:
                problems.append("missing SITE_PID on a terrestrial polygon")
                continue
            if source_id in seen:
                problems.append(f"duplicate SITE_PID {source_id}")
                continue
            seen.add(source_id)
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
            if too_small_to_store(geometry, gis_area):
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
        from candidate
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
        from candidate
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
            from candidate
            where candidate.source_id = place.source_id
              and candidate.area_km2 >= 10
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
    except psycopg.errors.ForeignKeyViolation as exc:
        raise SystemExit(
            "refusing to replace October 2026 places that already have facts"
        ) from exc
    except psycopg.Error as exc:
        raise SystemExit(f"database error: {exc}") from exc
