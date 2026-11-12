#!/usr/bin/env python3
"""Load the pinned October 2026 WDPCA extract into places, in five steps.

  build      Download and check the pinned zip, then write one filtered and
             validated file of terrestrial polygons of about 10 km2 or more.
             No database connection.
  probe      Time a connection to the database and test one small COPY.
             Writes nothing that stays.
  reconcile  Read-only. Match each record to a stored place on its SITE_PID and
             classify it as in decisions.md, record 4: unchanged, reshaped,
             very_different, new_in_known_site, new, or missing, with split or
             join candidates for a missing one. Writes reconciliation.csv and
             reconciliation.json to the work directory.
  upload     Run reconcile, and stop unless every record is unchanged or
             reshaped, with no flag. Then write the file in committed batches:
             names, details, and parcel ids, and a new current boundary version
             in place_boundaries for a reshaped record. It never inserts or
             deletes a place. A second start continues after the records
             already written.
  merge      Read-only check of the result against the file (the name is kept
             for the existing commands): counts, invalid boundaries, place_stats.
  attributes Build if needed, then set designation_type (WDPCA DESIG_TYPE) on
             both details tables, and criteria (INT_CRIT) on recognition_details,
             for places already stored. Writes nothing else. Reports the rows
             changed and the stored places the file does not have.

`run` (the default) does build, probe, then upload. Run `merge` afterwards.

The download URL and SHA-256 checksum are the WDPCA October 2026 row in
source_releases. This script always downloads that URL. It does not read a local
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

PINNED_SOURCE = "wdpca"
PINNED_VERSION = "October 2026"
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
    "DESIG_TYPE",
    "INT_CRIT",
    "IUCN_CAT",
    "REALM",
    "ISO3",
    "GIS_AREA",
)
# 112 km is longer than one degree anywhere on Earth, so a polygon whose
# planar area is below this cannot reach 10 km².
# WDPCA DESIG_TYPE as the details tables store it.
DESIGNATION_TYPES = {
    "National": "national",
    "Regional": "regional",
    "International": "international",
    "Not Applicable": "not_applicable",
}
TOO_SMALL_DEGREE_AREA = 10.0 / (112.0 * 112.0)
BATCH_ROWS = 50
# A few polygons are very large. Send a batch early when it reaches this size.
BATCH_BYTES = 4 * 1024 * 1024
MAX_SEGMENT = 1200
CONNECT_ATTEMPTS = 6
UPLOAD_ATTEMPTS = 6
COMMITTED = {"batches": 0}
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
    "designation_type",
    "criteria",
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
  designation_type text,
  criteria text,
  wkb_hex text
) on commit delete rows
"""
# The geometry as the boundaries store it.
PARSED_GEOM = """extensions.ST_Multi(
      extensions.ST_Force2D(
        extensions.ST_GeomFromWKB(decode(batch.wkb_hex, 'hex'), 4326)
      )
    )::extensions.geometry(MultiPolygon, 4326)"""

# --- reconcile ----------------------------------------------------------------
# Intersection over union, on the spheroid, at or above which a changed shape of
# a known SITE_PID is the same place reshaped (decisions.md, records 4 and 7).
RESHAPED_MIN_IOU = 0.95
# The stored SITE_ID of each place, from whichever details table it has.
DETAILS_SITE_IDS = """(
  select place_id, source_record_id from public.conservation_area_details
  union all
  select place_id, source_record_id from public.recognition_details
)"""
CLEAN_CLASSES = ("unchanged", "reshaped")
REPORT_CSV = "reconciliation.csv"
REPORT_JSON = "reconciliation.json"
REPORT_COLUMNS = ("site_pid", "site_id", "class", "place_id", "iou", "flags", "candidates")

CREATE_RECON = """
create temp table recon (
  site_pid text primary key,
  site_id text,
  place_id uuid,
  class text,
  iou double precision,
  flags text[] not null default '{}',
  candidates text[] not null default '{}'
)
"""
# Only new records keep their geometry, to find split and join candidates.
CREATE_RECON_NEW = """
create temp table recon_new (
  site_pid text primary key,
  geom extensions.geometry(MultiPolygon, 4326) not null
)
"""
# Classify one copied batch. A record under 10 km2 with an unknown SITE_PID is
# left out, as the upload leaves it out. A known one under 10 km2 is missing.
# A changed shape is left unclassified here and compared one record at a time.
RECONCILE_BATCH = f"""
with measured as (
  select
    batch.source_id,
    batch.site_id,
    {PARSED_GEOM} as geom
  from batch
),
sized as (
  select measured.*,
    extensions.st_area(measured.geom::extensions.geography, true) / 1e6 as area_km2
  from measured
)
insert into recon (site_pid, site_id, place_id, class, flags)
select
  sized.source_id,
  sized.site_id,
  ids.place_id,
  case
    when ids.place_id is null then
      case when known_site.present then 'new_in_known_site' else 'new' end
    when sized.area_km2 < 10 then 'missing'
    when boundary.id is null then 'very_different'
    when extensions.st_asbinary(boundary.geom) = extensions.st_asbinary(sized.geom)
      then 'unchanged'
  end,
  array_remove(array[
    case when ids.place_id is not null and sized.area_km2 < 10 then 'under_10_km2' end,
    case when ids.place_id is not null and boundary.id is null then 'no_current_boundary' end,
    case when ids.place_id is not null
      and details.source_record_id is distinct from sized.site_id then 'site_id_changed' end,
    case when parcels.n > 1 then 'merged_place' end
  ], null)
from sized
left join public.place_source_ids as ids
  on ids.source_id = 'wdpca'
  and ids.id_kind = 'wdpa_site_pid'
  and ids.match_status = 'confirmed'
  and ids.source_record_id = sized.source_id
left join public.place_boundaries as boundary
  on boundary.place_id = ids.place_id
  and boundary.is_current
left join {DETAILS_SITE_IDS} as details on details.place_id = ids.place_id
left join lateral (
  select count(*) as n
  from public.place_source_ids as other
  where other.place_id = ids.place_id
    and other.source_id = 'wdpca'
    and other.id_kind = 'wdpa_site_pid'
    and other.match_status = 'confirmed'
) as parcels on ids.place_id is not null
cross join lateral (
  select exists (
    select 1
    from public.place_source_ids as site
    where site.source_id = 'wdpca'
      and site.id_kind = 'wdpa_site_id'
      and site.match_status <> 'retired'
      and site.source_record_id = sized.site_id
  ) as present
) as known_site
where ids.place_id is not null or sized.area_km2 >= 10
"""
KEEP_NEW_GEOMETRY = f"""
insert into recon_new (site_pid, geom)
select batch.source_id, {PARSED_GEOM}
from batch
join recon
  on recon.site_pid = batch.source_id
  and recon.class in ('new', 'new_in_known_site')
"""
CHANGED_IN_BATCH = """
select recon.site_pid
from recon
join batch on batch.source_id = recon.site_pid
where recon.class is null
order by recon.site_pid
"""
SHAPE_IOU = f"""
select
  case
    when not (boundary.geom operator(extensions.&&) parsed.geom) then 0.0
    else extensions.st_area(
        extensions.st_intersection(boundary.geom, parsed.geom)::extensions.geography, true)
      / nullif(extensions.st_area(
        extensions.st_union(boundary.geom, parsed.geom)::extensions.geography, true), 0)
  end as iou
from batch
join recon on recon.site_pid = batch.source_id
join public.place_boundaries as boundary
  on boundary.place_id = recon.place_id
  and boundary.is_current
cross join lateral (select {PARSED_GEOM} as geom) as parsed
where batch.source_id = %(site_pid)s
"""
SET_SHAPE_CLASS = """
update recon
set iou = %(iou)s,
  class = case when %(iou)s >= %(min_iou)s then 'reshaped' else 'very_different' end
where site_pid = %(site_pid)s
"""
SHAPE_COMPARE_FAILED = """
update recon
set class = 'very_different', flags = flags || array['compare_failed']
where site_pid = %(site_pid)s
"""
# A stored SITE_PID that the file does not have.
ADD_MISSING = f"""
insert into recon (site_pid, site_id, place_id, class)
select ids.source_record_id, details.source_record_id, ids.place_id, 'missing'
from public.place_source_ids as ids
left join {DETAILS_SITE_IDS} as details on details.place_id = ids.place_id
where ids.source_id = 'wdpca'
  and ids.id_kind = 'wdpa_site_pid'
  and ids.match_status = 'confirmed'
  and not exists (select 1 from recon where recon.site_pid = ids.source_record_id)
"""
# New records that overlap a missing record's current boundary: a split or a join.
SPLIT_OR_JOIN = """
update recon
set candidates = found.site_pids
from (
  select missing.site_pid, array_agg(new.site_pid order by new.site_pid) as site_pids
  from recon as missing
  join public.place_boundaries as boundary
    on boundary.place_id = missing.place_id
    and boundary.is_current
  join recon_new as new
    on new.geom operator(extensions.&&) boundary.geom
    and extensions.st_intersects(new.geom, boundary.geom)
  where missing.class = 'missing'
  group by missing.site_pid
) as found
where recon.site_pid = found.site_pid
"""
REPORT_ROWS = """
select site_pid, site_id, class, place_id::text as place_id, iou, flags, candidates
from recon
order by class, site_pid
"""

# --- upload -------------------------------------------------------------------
CREATE_BATCH_PLACE = """
create temp table if not exists batch_place (
  source_id text,
  site_id text,
  name text,
  designation text,
  iucn_category text,
  iso3 text,
  realm text,
  designation_type text,
  criteria text,
  geom extensions.geometry(MultiPolygon, 4326),
  place_id uuid,
  boundary_id uuid,
  next_version integer,
  same_shape boolean
) on commit delete rows
"""
# Match each staged row to its place and current boundary through the confirmed
# SITE_PID row. reconcile has already refused a file with any other record, so
# every row of 10 km2 or more matches. write_batch checks that it did.
MATCH_BATCH = f"""
insert into batch_place (
  source_id, site_id, name, designation, iucn_category, iso3, realm,
  designation_type, criteria, geom,
  place_id, boundary_id, next_version, same_shape
)
select
  parsed.source_id, parsed.site_id, parsed.name, parsed.designation,
  parsed.iucn_category, parsed.iso3, parsed.realm,
  parsed.designation_type, parsed.criteria, parsed.geom,
  ids.place_id,
  boundary.id,
  (
    select max(version.version_number) + 1
    from public.place_boundaries as version
    where version.place_id = ids.place_id
  ),
  extensions.st_asbinary(boundary.geom) = extensions.st_asbinary(parsed.geom)
from (
  select
    batch.source_id, batch.site_id, batch.name, batch.designation,
    batch.iucn_category, batch.iso3, batch.realm,
    batch.designation_type, batch.criteria,
    {PARSED_GEOM} as geom
  from batch
) as parsed
join public.place_source_ids as ids
  on ids.source_id = 'wdpca'
  and ids.id_kind = 'wdpa_site_pid'
  and ids.match_status = 'confirmed'
  and ids.source_record_id = parsed.source_id
join public.place_boundaries as boundary
  on boundary.place_id = ids.place_id
  and boundary.is_current
where extensions.st_area(parsed.geom::extensions.geography, true) / 1e6 >= 10
"""
COUNT_BATCH = """
select
  (select count(*) from batch) as copied,
  (select count(*) from batch_place) as matched,
  (select count(*) from batch
   where extensions.st_area(
     extensions.ST_GeomFromWKB(decode(batch.wkb_hex, 'hex'), 4326)::extensions.geography,
     true) / 1e6 < 10) as small
"""
UPDATE_PLACES = """
update public.places
set name = batch_place.name
from batch_place
where places.id = batch_place.place_id
  and places.name is distinct from batch_place.name
"""
# A changed shape becomes the next version. The old one is superseded first,
# because a place has one current boundary.
SUPERSEDE_BOUNDARIES = """
update public.place_boundaries
set is_current = false, superseded_at = now()
from batch_place
where place_boundaries.id = batch_place.boundary_id
  and not batch_place.same_shape
"""
INSERT_BOUNDARIES = """
insert into public.place_boundaries (
  place_id, version_number, geom, source_id, source_release_id, source_record_id,
  source_url, review_status, reviewed_at, is_current
)
select
  place_id, next_version, geom, 'wdpca', %(release)s, source_id,
  'https://www.protectedplanet.net/' || site_id, 'approved', now(), true
from batch_place
where not same_shape
"""
# A place has conservation area details or recognition details, never both. Which
# kind a place is does not change on import (decisions.md, record 21).
UPDATE_DETAILS = """
update public.conservation_area_details as details
set
  designation = batch_place.designation,
  designation_type = batch_place.designation_type,
  iucn_category = batch_place.iucn_category,
  iso3 = string_to_array(batch_place.iso3, ';'),
  realm = batch_place.realm,
  source_release_id = %(release)s,
  source_record_id = batch_place.site_id,
  source_url = 'https://www.protectedplanet.net/' || batch_place.site_id
from batch_place
where details.place_id = batch_place.place_id
"""
UPDATE_RECOGNITION_DETAILS = """
update public.recognition_details as details
set
  designation = batch_place.designation,
  designation_type = batch_place.designation_type,
  criteria = batch_place.criteria,
  iso3 = string_to_array(batch_place.iso3, ';'),
  realm = batch_place.realm,
  source_release_id = %(release)s,
  source_record_id = batch_place.site_id,
  source_url = 'https://www.protectedplanet.net/' || batch_place.site_id
from batch_place
where details.place_id = batch_place.place_id
"""
UPDATE_PARCEL_IDS = """
update public.place_source_ids as ids
set last_seen_release_id = %(release)s
from batch_place
where ids.source_id = 'wdpca'
  and ids.id_kind = 'wdpa_site_pid'
  and ids.match_status = 'confirmed'
  and ids.source_record_id = batch_place.source_id
"""
# A site row of any match status is only marked as seen. The importer never adds
# one beside a proposed row: a site's rows change through review.
UPDATE_SITE_IDS = """
update public.place_source_ids as site
set last_seen_release_id = %(release)s
where site.source_id = 'wdpca'
  and site.id_kind = 'wdpa_site_id'
  and site.match_status in ('confirmed', 'proposed')
  and site.source_record_id in (
    select details.source_record_id
    from public.conservation_area_details as details
    where details.source_id = 'wdpca'
      and details.source_release_id = %(release)s
    union
    select details.source_record_id
    from public.recognition_details as details
    where details.source_id = 'wdpca'
      and details.source_release_id = %(release)s
  )
"""
# --- attributes ---------------------------------------------------------------
# DESIG_TYPE and INT_CRIT only, for places already stored. A merged place holds
# several SITE_PIDs and takes the values of its lowest, as place_summaries does.
ATTRIBUTE_ROWS = 5000
CREATE_ATTRIBUTE_BATCH = """
create temp table if not exists attribute_batch (
  site_pid text primary key,
  designation_type text,
  criteria text
) on commit delete rows
"""
COPY_ATTRIBUTE_BATCH = "copy attribute_batch (site_pid, designation_type, criteria) from stdin"
ATTRIBUTE_MATCH = """
select ids.place_id, batch.designation_type, batch.criteria
from attribute_batch as batch
join public.place_source_ids as ids
  on ids.source_id = 'wdpca'
  and ids.id_kind = 'wdpa_site_pid'
  and ids.match_status = 'confirmed'
  and ids.source_record_id = batch.site_pid
where ids.source_record_id = (
  select min(own.source_record_id)
  from public.place_source_ids as own
  where own.place_id = ids.place_id
    and own.source_id = 'wdpca'
    and own.id_kind = 'wdpa_site_pid'
    and own.match_status = 'confirmed'
)
"""
UPDATE_CONSERVATION_ATTRIBUTES = f"""
update public.conservation_area_details as details
set designation_type = matched.designation_type
from ({ATTRIBUTE_MATCH}) as matched
where details.place_id = matched.place_id
  and details.designation_type is distinct from matched.designation_type
"""
UPDATE_RECOGNITION_ATTRIBUTES = f"""
update public.recognition_details as details
set designation_type = matched.designation_type, criteria = matched.criteria
from ({ATTRIBUTE_MATCH}) as matched
where details.place_id = matched.place_id
  and (
    details.designation_type is distinct from matched.designation_type
    or details.criteria is distinct from matched.criteria
  )
"""
# Each place with details, by its lowest confirmed SITE_PID.
STORED_PRIMARY_PIDS = """
select min(ids.source_record_id) as site_pid
from public.place_source_ids as ids
where ids.source_id = 'wdpca'
  and ids.id_kind = 'wdpa_site_pid'
  and ids.match_status = 'confirmed'
  and (
    exists (select 1 from public.conservation_area_details as d where d.place_id = ids.place_id)
    or exists (select 1 from public.recognition_details as d where d.place_id = ids.place_id)
  )
group by ids.place_id
"""

# The SITE_PIDs stored for a release, with their place and current area.
STORED_PARCELS = """
select ids.source_record_id as source_id, ids.place_id as id, boundary.area_km2
from public.place_source_ids as ids
join public.place_boundaries as boundary
  on boundary.place_id = ids.place_id
  and boundary.is_current
where ids.source_id = 'wdpca'
  and ids.id_kind = 'wdpa_site_pid'
  and ids.match_status = 'confirmed'
  and ids.last_seen_release_id = %s
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
    elif command == "reconcile":
        reconcile(work)
    elif command == "upload":
        upload(work)
    elif command == "merge":
        merge(work)
    elif command == "attributes":
        build(work)
        attributes(work)
    elif command == "run":
        build(work)
        probe(work, 30)
        upload(work)
        print("upload finished. Check the stage, then run: merge", flush=True)
    else:
        raise SystemExit(
            f"unknown command {command!r}: "
            "build, probe, reconcile, upload, merge, attributes, run"
        )


def work_dir() -> Path:
    path = Path(os.environ.get("WDPA_WORK_DIR") or Path(tempfile.gettempdir()) / "wdpa-work")
    path.mkdir(parents=True, exist_ok=True)
    return path


# --- build: no database ------------------------------------------------------


def build(work: Path) -> dict:
    manifest_path = work / MANIFEST_NAME
    filtered = work / FILTERED_NAME
    if manifest_path.exists() and filtered.exists():
        if json.loads(manifest_path.read_text()).get("columns") == list(COLUMNS):
            manifest = read_manifest(work)
            print(f"filtered file already built: {manifest['kept']} polygons", flush=True)
            return manifest
        print("filtered file has older columns: building it again", flush=True)

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
        "columns": list(COLUMNS),
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
    designation_type = text(feature, "DESIG_TYPE")
    if designation_type not in DESIGNATION_TYPES:
        problems.append(f"{source_id}: DESIG_TYPE {designation_type!r} is outside the WDPA set")
        return None
    criteria = text(feature, "INT_CRIT")
    if criteria in ("Not Applicable", "Not Reported"):
        criteria = None
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
        DESIGNATION_TYPES[designation_type],
        criteria or "",
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
    if manifest.get("columns") != list(COLUMNS):
        raise SystemExit("filtered file has older columns: run build again")
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
                tcp_user_timeout=120_000,
            )
            limit_segment_size(conn)
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


def limit_segment_size(conn) -> None:
    """Send smaller TCP segments. On Fly a large COPY stalled, with data queued
    and never acknowledged, which is what a blocked path MTU looks like."""
    import socket

    try:
        sock = socket.socket(fileno=os.dup(conn.pgconn.socket))
        try:
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_MAXSEG, MAX_SEGMENT)
        finally:
            sock.close()
    except (OSError, AttributeError):
        pass


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


# --- reconcile ---------------------------------------------------------------


def reconcile(work: Path) -> dict:
    """Read-only: classify every record of the filtered file against the stored
    places (decisions.md, record 4), and write the report to the work directory.

    Temp tables only. The whole file's geometry is never held: each batch is
    classified and dropped, and only new records keep theirs.
    """
    import psycopg

    manifest = read_manifest(work)
    attempts = 0
    while True:
        conn = open_connection()
        try:
            report = reconcile_pass(conn, work, manifest)
            break
        except (psycopg.OperationalError, psycopg.InterfaceError) as exc:
            attempts += 1
            print(
                f"reconcile connection lost ({attempts} of {UPLOAD_ATTEMPTS}): "
                f"{first_line(exc)}. Starting the pass again.",
                flush=True,
            )
            if attempts >= UPLOAD_ATTEMPTS:
                raise SystemExit("reconcile stopped: the connection kept failing") from None
            time.sleep(30)
        finally:
            try:
                conn.close()
            except Exception:
                pass
    return report


def reconcile_pass(conn, work: Path, manifest: dict) -> dict:
    source = fetch_source(conn)
    with conn.cursor() as cur:
        cur.execute("drop table if exists recon, recon_new")
        cur.execute(CREATE_RECON)
        cur.execute(CREATE_RECON_NEW)
        cur.execute(CREATE_BATCH)
    conn.commit()

    batch: list[list[str]] = []
    batch_size = 0
    seen = 0

    def flush() -> None:
        nonlocal batch_size, seen
        if not batch:
            return
        with conn.cursor() as cur:
            copy_rows(cur, batch)
            cur.execute(RECONCILE_BATCH)
            cur.execute(KEEP_NEW_GEOMETRY)
            cur.execute(CHANGED_IN_BATCH)
            changed = [row["site_pid"] for row in cur.fetchall()]
            for site_pid in changed:
                compare_shape(conn, cur, site_pid)
            cur.execute("truncate batch")
        conn.commit()
        seen += len(batch)
        batch.clear()
        batch_size = 0
        if seen % (BATCH_ROWS * 200) < BATCH_ROWS:
            print(f"compared: {seen} of {manifest['kept']}", flush=True)

    for row in read_rows(work):
        batch.append(row)
        batch_size += len(row[-1])
        if len(batch) >= BATCH_ROWS or batch_size >= BATCH_BYTES:
            flush()
    flush()

    with conn.cursor() as cur:
        cur.execute(ADD_MISSING)
        cur.execute(SPLIT_OR_JOIN)
        cur.execute(REPORT_ROWS)
        rows = cur.fetchall()
    conn.commit()
    return write_report(work, rows, source, manifest)


def compare_shape(conn, cur, site_pid: str) -> None:
    """Intersection over union of one changed shape with its current boundary.
    A comparison PostGIS cannot make leaves the record very different."""
    import psycopg

    try:
        with conn.transaction():
            cur.execute(SHAPE_IOU, {"site_pid": site_pid})
            iou = cur.fetchone()["iou"]
    except psycopg.errors.InternalError:
        cur.execute(SHAPE_COMPARE_FAILED, {"site_pid": site_pid})
        return
    cur.execute(
        SET_SHAPE_CLASS,
        {"site_pid": site_pid, "iou": iou or 0.0, "min_iou": RESHAPED_MIN_IOU},
    )


def write_report(work: Path, rows: list[dict], source: dict, manifest: dict) -> dict:
    counts: dict[str, int] = {}
    flagged = 0
    for row in rows:
        counts[row["class"]] = counts.get(row["class"], 0) + 1
        if row["flags"]:
            flagged += 1
    split_or_join = sum(1 for row in rows if row["candidates"])
    clean = flagged == 0 and all(name in CLEAN_CLASSES for name in counts)
    with (work / REPORT_CSV).open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(REPORT_COLUMNS)
        for row in rows:
            writer.writerow(
                [
                    row["site_pid"],
                    row["site_id"] or "",
                    row["class"],
                    row["place_id"] or "",
                    "" if row["iou"] is None else f"{row['iou']:.6f}",
                    ";".join(row["flags"]),
                    ";".join(row["candidates"]),
                ]
            )
    report = {
        "source": source["source_id"],
        "release": source["version_label"],
        "rows_sha256": manifest["rows_sha256"],
        "reshaped_min_iou": RESHAPED_MIN_IOU,
        "written_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "counts": dict(sorted(counts.items())),
        "flagged": flagged,
        "split_or_join": split_or_join,
        "clean": clean,
    }
    (work / REPORT_JSON).write_text(json.dumps(report, indent=2) + "\n")
    for name, count in report["counts"].items():
        print(f"{name}: {count}", flush=True)
    print(f"flagged: {flagged}", flush=True)
    print(f"missing with split or join candidates: {split_or_join}", flush=True)
    print(f"clean: {'yes' if clean else 'no'}. Report: {work / REPORT_CSV}", flush=True)
    return report


# --- upload ------------------------------------------------------------------


def copy_rows(cur, rows: list[list[str]]) -> None:
    with cur.copy(COPY_BATCH) as copy:
        for row in rows:
            copy.write_row([value if value != "" else None for value in row])


def upload(work: Path) -> None:
    import psycopg

    manifest = read_manifest(work)
    report = reconcile(work)
    if not report["clean"]:
        raise SystemExit(
            "refusing to load: not every record matches a stored place cleanly. "
            f"See {work / REPORT_CSV}"
        )
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
            if COMMITTED["batches"]:
                attempts = 0
                COMMITTED["batches"] = 0
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
    """Create the batch tables and return the SITE_PIDs already written for this
    release. reconcile has already refused a file that misses a stored SITE_PID."""
    source = fetch_source(conn)
    refuse_leftover_stage(conn)
    with conn.cursor() as cur:
        cur.execute(CREATE_BATCH)
        cur.execute(CREATE_BATCH_PLACE)
        cur.execute(STORED_PARCELS, (source["id"],))
        stored = {row["source_id"] for row in cur.fetchall()}
    conn.commit()
    return stored


def refuse_leftover_stage(conn) -> None:
    """Stop if places_load from a run before task 04 is still there.

    Its rows have the old places columns, which no longer exist.
    """
    with conn.cursor() as cur:
        cur.execute("select to_regclass('public.places_load') is not null as present")
        present = bool(cur.fetchone()["present"])
    conn.commit()
    if present:
        raise SystemExit(
            "refusing to load: public.places_load from an older run still exists. "
            "Check it and drop it first."
        )


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
            write_batch(cur, source["id"])
            cur.execute("truncate batch")
        conn.commit()
        total += len(batch)
        staged.update(row[0] for row in batch)
        batch.clear()
        batch_size = 0
        sent_batches += 1
        COMMITTED["batches"] += 1
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
    with conn.cursor() as cur:
        cur.execute(UPDATE_SITE_IDS, {"release": source["id"]})
    conn.commit()
    return total


def write_batch(cur, release) -> None:
    """Write one copied batch: names, a new boundary version for a changed shape,
    details, and parcel ids. It never inserts a place."""
    cur.execute(MATCH_BATCH)
    cur.execute(COUNT_BATCH)
    counts = cur.fetchone()
    if counts["matched"] != counts["copied"] - counts["small"]:
        raise SystemExit(
            "refusing to write: a record of 10 km2 or more has no stored place "
            "with a current boundary. Run reconcile."
        )
    cur.execute(UPDATE_PLACES)
    cur.execute(SUPERSEDE_BOUNDARIES)
    cur.execute(INSERT_BOUNDARIES, {"release": release})
    cur.execute(UPDATE_DETAILS, {"release": release})
    cur.execute(UPDATE_RECOGNITION_DETAILS, {"release": release})
    cur.execute(UPDATE_PARCEL_IDS, {"release": release})
    cur.execute("truncate batch_place")


def fetch_source(conn) -> dict:
    with conn.cursor() as cur:
        cur.execute(
            """
            select
              source_releases.id,
              source_releases.source_id,
              source_releases.version_label,
              source_releases.released_on::text as released_on,
              source_releases.download_url,
              source_releases.checksum
            from public.source_releases
            join public.sources on sources.id = source_releases.source_id
            where source_releases.source_id = %s
              and source_releases.version_label = %s
            """,
            (PINNED_SOURCE, PINNED_VERSION),
        )
        row = cur.fetchone()
    if row is None:
        raise SystemExit(
            "WDPCA October 2026 release is missing from source_releases. Apply the migrations first."
        )
    download_url = row["download_url"]
    checksum = str(row["checksum"]).lower()
    if (
        row["source_id"] != PINNED_SOURCE
        or row["version_label"] != PINNED_VERSION
        or row["released_on"] != PINNED_RELEASE
        or download_url != PINNED_URL
        or checksum != PINNED_SHA256
    ):
        raise SystemExit(
            "source_releases row does not match the pinned October 2026 WDPCA download"
        )
    row["checksum"] = checksum
    return row


# --- attributes --------------------------------------------------------------


def attribute_row(row: list[str]) -> list[str | None]:
    """SITE_PID, designation type, and criteria from a filtered row."""
    values = dict(zip(COLUMNS, row))
    return [
        values["source_id"],
        values["designation_type"] or None,
        values["criteria"] or None,
    ]


def attributes(work: Path) -> dict:
    """Set designation_type on both details tables, and criteria on
    recognition_details, from the filtered file. Writes nothing else."""
    read_manifest(work)
    conn = open_connection()
    try:
        fetch_source(conn)
        result = attributes_pass(conn, work)
    finally:
        conn.close()
    print(json.dumps({key: result[key] for key in ("changed", "stored")}
                     | {"not_found": len(result["not_found"])}), flush=True)
    for site_pid in result["not_found"][:50]:
        print(f"not in the file: {site_pid}", flush=True)
    return result


def attributes_pass(conn, work: Path) -> dict:
    """Copy the attributes in batches, commit each, and update the details rows
    that differ."""
    changed = {"conservation_area_details": 0, "recognition_details": 0}
    in_file: set[str] = set()
    batch: list[list[str | None]] = []

    def flush() -> None:
        if not batch:
            return
        with conn.cursor() as cur:
            cur.execute(CREATE_ATTRIBUTE_BATCH)
            with cur.copy(COPY_ATTRIBUTE_BATCH) as copy:
                for values in batch:
                    copy.write_row(values)
            cur.execute(UPDATE_CONSERVATION_ATTRIBUTES)
            changed["conservation_area_details"] += cur.rowcount
            cur.execute(UPDATE_RECOGNITION_ATTRIBUTES)
            changed["recognition_details"] += cur.rowcount
            cur.execute("truncate attribute_batch")
        conn.commit()
        batch.clear()

    for row in read_rows(work):
        values = attribute_row(row)
        in_file.add(values[0])
        batch.append(values)
        if len(batch) >= ATTRIBUTE_ROWS:
            flush()
            print(f"attributes read: {len(in_file)}", flush=True)
    flush()
    with conn.cursor() as cur:
        cur.execute(STORED_PRIMARY_PIDS)
        stored = {row["site_pid"] for row in cur.fetchall()}
    return {"changed": changed, "stored": len(stored), "not_found": sorted(stored - in_file)}


# --- check -------------------------------------------------------------------


def merge(work: Path) -> None:
    """Read-only check of the stored parcels and their current boundaries
    against the filtered file."""
    manifest = read_manifest(work)
    conn = open_connection()
    source = fetch_source(conn)
    release = source["id"]
    expected = {row[0] for row in read_rows(work)}
    problems: list[str] = []
    with conn.cursor() as cur:
        cur.execute("set search_path to public, extensions")
        cur.execute(STORED_PARCELS, (release,))
        stored = {row["source_id"]: row["area_km2"] for row in cur.fetchall()}
        cur.execute(
            """
            select ids.source_record_id as source_id,
              extensions.ST_IsValidReason(boundary.geom) as reason
            from public.place_source_ids as ids
            join public.place_boundaries as boundary
              on boundary.place_id = ids.place_id
              and boundary.is_current
            where ids.source_id = 'wdpca'
              and ids.id_kind = 'wdpa_site_pid'
              and ids.match_status = 'confirmed'
              and ids.last_seen_release_id = %s
              and not extensions.ST_IsValid(boundary.geom)
            order by ids.source_record_id
            """,
            (release,),
        )
        invalid = cur.fetchall()
        cur.execute(
            """
            select
              (select count(distinct source_record_id)
               from (
                 select source_record_id from public.conservation_area_details
                 where source_id = 'wdpca' and source_release_id = %(release)s
                 union all
                 select source_record_id from public.recognition_details
                 where source_id = 'wdpca' and source_release_id = %(release)s
               ) as details) as sites,
              (select count(*)
               from public.place_source_ids
               where source_id = 'wdpca' and id_kind = 'wdpa_site_id'
                 and match_status in ('confirmed', 'proposed')
                 and last_seen_release_id = %(release)s) as site_ids
            """,
            {"release": release},
        )
        site_counts = cur.fetchone()
        cur.execute("select count(*) as n from public.place_stats")
        place_stats = int(cur.fetchone()["n"])
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
    if site_counts["site_ids"] != site_counts["sites"]:
        problems.append(
            f"{site_counts['sites']} sites but {site_counts['site_ids']} wdpa_site_id rows"
        )
    print(f"terrestrial polygons: {manifest['terrestrial']}", flush=True)
    print(f"GIS_AREA >= 10: {manifest['gis_area_ge_10']}", flush=True)
    print(f"stored areas of 10 km2 or more: {len(stored)}", flush=True)
    print(f"in the file but not stored (should be under 10 km2): {len(absent)}", flush=True)
    print(f"sites: {site_counts['sites']}", flush=True)
    print(f"place_stats: {place_stats}", flush=True)
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
