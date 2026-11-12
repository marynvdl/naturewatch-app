#!/usr/bin/env python3
"""Derive recognises links from overlap (Database Honing task 09).

  derive         For each published recognition, in committed batches, call
                 place_overlaps() and insert a derived, proposed recognises row
                 to each published conservation area it overlaps, when the shared
                 area is at least 1% of either place. Each row records both
                 boundary versions and both coverages. A rerun skips the
                 recognitions it has finished (a progress file in the work
                 directory) and any pair that already has an active row.
  counts         Read-only. Per recognition type, how many derived rows have
                 object_coverage (the share of the park inside the recognition)
                 of at least 25%, 50%, 75%, and 90%.
  compute        Read-only on the database. The same links, computed on this
                 machine from the importer's filtered file: each place's
                 SITE_PID parcels (unioned for a merged place) in EPSG:6933,
                 equal area. Writes derive_recognises_links.tsv in the work
                 directory, one recognition at a time, and resumes where it
                 stopped. Prints the counts and its peak memory.
  load           Insert the links in derive_recognises_links.tsv as derived,
                 proposed rows, in one transaction. A link whose boundary is no
                 longer current, or whose pair already has an active row, is
                 skipped.
  counts         Read-only. Per recognition type, how many derived rows have
                 object_coverage (the share of the park inside the recognition)
                 of at least 25%, 50%, 75%, and 90%.
  confirm SHARE  Set status confirmed on derived proposed recognises rows with
                 object_coverage at or above SHARE (0 to 1). Changes nothing else.

On the hosted Micro compute, derive ran the database out of memory on a
Natura 2000 site of 862,145 vertices (12 November 2026), so the hosted links
were made with compute and load.

The connection is the importer's: DATABASE_URL for the local database, or
SUPABASE_ACCESS_TOKEN for a short-lived hosted login role.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import time
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "import_wdpa", Path(__file__).resolve().parent / "import_wdpa.py"
)
import_wdpa = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = import_wdpa
_spec.loader.exec_module(import_wdpa)

BATCH = 25
MIN_SHARE = 0.01
THRESHOLDS = (0.25, 0.5, 0.75, 0.9)
PROGRESS_NAME = "derive_recognises_done.txt"
FAILED_NAME = "derive_recognises_failed.json"
LINKS_NAME = "derive_recognises_links.tsv"
LINKS_DONE_NAME = "derive_recognises_links_done.txt"
LINKS_FAILED_NAME = "derive_recognises_links_failed.json"
SHAPES_NAME = "derive_recognises_shapes.bin"
SHAPES_INDEX_NAME = "derive_recognises_shapes.json"
# Parsed shapes kept in memory, counted in WKB bytes.
CACHE_BYTES = 800_000_000

PLACES_TO_COMPUTE = """
select places.id::text as place_id, places.place_type_id,
  place_types.place_category_id = 'recognition' as is_recognition,
  boundary.id::text as boundary_id, ids.source_record_id as site_pid
from public.places
join public.place_types on place_types.id = places.place_type_id
join public.place_boundaries as boundary
  on boundary.place_id = places.id
  and boundary.is_current
join public.place_source_ids as ids
  on ids.place_id = places.id
  and ids.source_id = 'wdpca'
  and ids.id_kind = 'wdpa_site_pid'
  and ids.match_status = 'confirmed'
where places.publication_status = 'published'
  and (places.place_type_id = 'conservation_area' or place_types.place_category_id = 'recognition')
"""
CREATE_LOADED_LINKS = """
create temp table if not exists loaded_links (
  subject_place_id uuid,
  object_place_id uuid,
  subject_boundary_id uuid,
  object_boundary_id uuid,
  intersection_km2 double precision,
  subject_coverage double precision,
  object_coverage double precision
) on commit drop
"""
COPY_LOADED_LINKS = "copy loaded_links from stdin"
INSERT_LOADED_LINKS = """
insert into public.place_relationships (
  subject_place_id, relationship_type_id, object_place_id, origin, status,
  subject_boundary_id, object_boundary_id, subject_coverage, object_coverage
)
select
  links.subject_place_id, 'recognises', links.object_place_id, 'derived', 'proposed',
  links.subject_boundary_id, links.object_boundary_id,
  links.subject_coverage, links.object_coverage
from loaded_links as links
join public.place_boundaries as subject_boundary
  on subject_boundary.id = links.subject_boundary_id
  and subject_boundary.place_id = links.subject_place_id
  and subject_boundary.is_current
join public.place_boundaries as object_boundary
  on object_boundary.id = links.object_boundary_id
  and object_boundary.place_id = links.object_place_id
  and object_boundary.is_current
join public.places as subject
  on subject.id = links.subject_place_id
  and subject.publication_status = 'published'
join public.place_types as subject_type
  on subject_type.id = subject.place_type_id
  and subject_type.place_category_id = 'recognition'
join public.places as object
  on object.id = links.object_place_id
  and object.publication_status = 'published'
  and object.place_type_id = 'conservation_area'
on conflict (subject_place_id, relationship_type_id, object_place_id)
  where retired_at is null
  do nothing
"""

RECOGNITIONS = """
select places.id::text as id
from public.places
join public.place_types on place_types.id = places.place_type_id
where place_types.place_category_id = 'recognition'
  and places.publication_status = 'published'
order by places.id
"""
INSERT_LINKS = """
insert into public.place_relationships (
  subject_place_id, relationship_type_id, object_place_id, origin, status,
  subject_boundary_id, object_boundary_id, subject_coverage, object_coverage
)
select
  recognition.id, 'recognises', overlap.place_id, 'derived', 'proposed',
  overlap.subject_boundary_id, overlap.object_boundary_id,
  overlap.subject_coverage, overlap.object_coverage
from unnest(%(ids)s::uuid[]) as recognition(id)
cross join lateral public.place_overlaps(recognition.id) as overlap
where overlap.place_type_id = 'conservation_area'
  and (overlap.subject_coverage >= %(min_share)s or overlap.object_coverage >= %(min_share)s)
on conflict (subject_place_id, relationship_type_id, object_place_id)
  where retired_at is null
  do nothing
"""
COUNTS = """
select
  places.place_type_id,
  count(distinct links.subject_place_id) as recognitions,
  count(*) as links,
  count(*) filter (where links.object_coverage >= 0.25) as at_25,
  count(*) filter (where links.object_coverage >= 0.5) as at_50,
  count(*) filter (where links.object_coverage >= 0.75) as at_75,
  count(*) filter (where links.object_coverage >= 0.9) as at_90,
  count(distinct links.object_place_id) filter (where links.object_coverage >= 0.5) as parks_at_50,
  count(*) filter (where links.status = 'confirmed') as confirmed
from public.place_relationships as links
join public.places on places.id = links.subject_place_id
where links.relationship_type_id = 'recognises'
  and links.origin = 'derived'
  and links.retired_at is null
group by places.place_type_id
order by places.place_type_id
"""
CONFIRM = """
update public.place_relationships
set status = 'confirmed'
where relationship_type_id = 'recognises'
  and origin = 'derived'
  and status = 'proposed'
  and retired_at is null
  and object_coverage >= %(share)s
"""


def work_dir() -> Path:
    path = Path(os.environ.get("WDPA_WORK_DIR") or Path(tempfile.gettempdir()) / "wdpa-work")
    path.mkdir(parents=True, exist_ok=True)
    return path


def insert_batch(conn, ids: list[str]) -> int:
    with conn.cursor() as cur:
        cur.execute(INSERT_LINKS, {"ids": ids, "min_share": MIN_SHARE})
        inserted = cur.rowcount
    conn.commit()
    return inserted


def derive(conn, work: Path) -> dict:
    """Insert proposed links batch by batch. A batch that fails is retried one
    recognition at a time, and a recognition that still fails is reported."""
    import psycopg

    progress = work / PROGRESS_NAME
    done = set(progress.read_text().split()) if progress.exists() else set()
    with conn.cursor() as cur:
        cur.execute(RECOGNITIONS)
        todo = [row["id"] for row in cur.fetchall() if row["id"] not in done]
    conn.commit()
    print(f"recognitions to do: {len(todo)} (already done: {len(done)})", flush=True)
    inserted = 0
    failed: dict[str, str] = {}
    started = time.monotonic()
    with progress.open("a") as log:
        for start in range(0, len(todo), BATCH):
            ids = todo[start : start + BATCH]
            try:
                inserted += insert_batch(conn, ids)
                finished = ids
            except psycopg.errors.DatabaseError as exc:
                conn.rollback()
                finished = []
                for place_id in ids:
                    try:
                        inserted += insert_batch(conn, [place_id])
                        finished.append(place_id)
                    except psycopg.errors.DatabaseError as one:
                        conn.rollback()
                        failed[place_id] = import_wdpa.first_line(one)
                if not finished and not failed:
                    raise exc
            log.write("".join(f"{place_id}\n" for place_id in finished))
            log.flush()
            count = start + len(ids)
            if count % (BATCH * 20) == 0 or count == len(todo):
                minutes = (time.monotonic() - started) / 60
                print(
                    f"recognitions: {count} of {len(todo)}; links inserted: {inserted}; "
                    f"{minutes:.1f} min",
                    flush=True,
                )
    if failed:
        (work / FAILED_NAME).write_text(json.dumps(failed, indent=2) + "\n")
        print(f"{len(failed)} recognitions failed, see {work / FAILED_NAME}", flush=True)
    return {"inserted": inserted, "failed": failed, "minutes": (time.monotonic() - started) / 60}


def counts(conn) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(COUNTS)
        rows = cur.fetchall()
    conn.rollback()
    for row in rows:
        print(json.dumps({key: row[key] for key in row}), flush=True)
    return rows


def confirm(conn, share: float) -> int:
    if not 0 < share <= 1:
        raise SystemExit("the share must be above 0 and at most 1")
    with conn.cursor() as cur:
        cur.execute(CONFIRM, {"share": share})
        confirmed = cur.rowcount
    conn.commit()
    print(f"confirmed: {confirmed} links with object_coverage >= {share}", flush=True)
    return confirmed


# --- compute on this machine, then load ------------------------------------------


def fetch_places(conn) -> dict[str, dict]:
    """Published conservation areas and recognitions, with their current
    boundary and SITE_PIDs. Read-only."""
    with conn.cursor() as cur:
        cur.execute(PLACES_TO_COMPUTE)
        rows = cur.fetchall()
    conn.commit()
    places: dict[str, dict] = {}
    for row in rows:
        place = places.setdefault(
            row["place_id"],
            {
                "place_type_id": row["place_type_id"],
                "is_recognition": row["is_recognition"],
                "boundary_id": row["boundary_id"],
                "pids": [],
            },
        )
        place["pids"].append(row["site_pid"])
    return places


def peak_memory_mb() -> int:
    import resource

    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return round(peak / (1024 * 1024 if sys.platform == "darwin" else 1024))


def index_shapes(work: Path, pids: set[str]) -> dict[str, list]:
    """Copy each wanted parcel's WKB from the filtered file into one plain file,
    and index it by SITE_PID: [offset, length, west, south, east, north].
    Reused while the filtered file's checksum is the same."""
    import shapely

    manifest = import_wdpa.read_manifest(work)
    index_path = work / SHAPES_INDEX_NAME
    if index_path.exists():
        stored = json.loads(index_path.read_text())
        if stored.get("rows_sha256") == manifest["rows_sha256"] and pids <= set(stored["parcels"]):
            return stored["parcels"]
    wkb_column = import_wdpa.COLUMNS.index("wkb_hex")
    parcels: dict[str, list] = {}
    offset = 0
    with (work / SHAPES_NAME).open("wb") as out:
        for row in import_wdpa.read_rows(work):
            if row[0] not in pids:
                continue
            wkb = bytes.fromhex(row[wkb_column])
            out.write(wkb)
            parcels[row[0]] = [offset, len(wkb), *shapely.bounds(shapely.from_wkb(wkb)).tolist()]
            offset += len(wkb)
            if len(parcels) % 10_000 == 0:
                print(f"shapes indexed: {len(parcels)}", flush=True)
    index_path.write_text(json.dumps({"rows_sha256": manifest["rows_sha256"], "parcels": parcels}))
    print(f"shapes indexed: {len(parcels)} ({offset / 1e9:.2f} GB)", flush=True)
    return parcels


class Shapes:
    """Each place's shape in EPSG:6933, read from the shapes file on demand and
    kept in a cache bounded by WKB size."""

    def __init__(self, work: Path, places: dict[str, dict], parcels: dict[str, list]):
        from collections import OrderedDict

        import pyproj

        self.file = (work / SHAPES_NAME).open("rb")
        self.places = places
        self.parcels = parcels
        self.project = pyproj.Transformer.from_crs(4326, 6933, always_xy=True).transform
        self.cache: OrderedDict[str, tuple] = OrderedDict()
        self.cached_bytes = 0
        self.areas: dict[str, float] = {}

    def close(self) -> None:
        self.file.close()

    def bbox(self, place_id: str) -> tuple[float, float, float, float] | None:
        boxes = [self.parcels[pid][2:] for pid in self.places[place_id]["pids"] if pid in self.parcels]
        if not boxes:
            return None
        return (
            min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes),
        )

    def get(self, place_id: str):
        import numpy
        import shapely

        if place_id in self.cache:
            self.cache.move_to_end(place_id)
            return self.cache[place_id][0]
        parts, size = [], 0
        for pid in self.places[place_id]["pids"]:
            if pid not in self.parcels:
                continue
            offset, length = self.parcels[pid][:2]
            self.file.seek(offset)
            parts.append(shapely.from_wkb(self.file.read(length)))
            size += length
        geom = shapely.transform(
            shapely.union_all(parts) if len(parts) > 1 else parts[0],
            lambda xy: numpy.column_stack(self.project(xy[:, 0], xy[:, 1])),
        )
        geom = polygonal(geom)
        self.areas[place_id] = shapely.area(geom)
        self.cache[place_id] = (geom, size)
        self.cached_bytes += size
        while self.cached_bytes > CACHE_BYTES and len(self.cache) > 1:
            _, (_, dropped) = self.cache.popitem(last=False)
            self.cached_bytes -= dropped
        return geom

    def area(self, place_id: str) -> float:
        if place_id not in self.areas:
            self.get(place_id)
        return self.areas[place_id]


def polygonal(geom):
    """A valid shape keeping only its polygons."""
    import shapely

    if not shapely.is_valid(geom):
        geom = shapely.make_valid(geom)
    if geom.geom_type in ("Polygon", "MultiPolygon"):
        return geom
    parts = [part for part in shapely.get_parts(geom) if part.geom_type in ("Polygon", "MultiPolygon")]
    return shapely.union_all(parts) if parts else shapely.Polygon()


def shared_area(subject, other) -> float:
    """Area of the intersection, after clipping each shape to the other's box."""
    import shapely

    sx0, sy0, sx1, sy1 = subject.bounds
    ox0, oy0, ox1, oy1 = other.bounds
    window = (max(sx0, ox0), max(sy0, oy0), min(sx1, ox1), min(sy1, oy1))
    if window[0] >= window[2] or window[1] >= window[3]:
        return 0.0
    box = shapely.box(*window)
    a = polygonal(shapely.intersection(subject, box))
    b = polygonal(shapely.intersection(other, box))
    if a.is_empty or b.is_empty:
        return 0.0
    try:
        return float(shapely.area(shapely.intersection(a, b)))
    except shapely.errors.GEOSException:
        # A topology error on two valid shapes: snap to a 1 m grid and retry.
        return float(shapely.area(shapely.intersection(a, b, grid_size=1.0)))


def compute(places: dict[str, dict], work: Path) -> dict:
    """Write the links file for every recognition not yet done."""
    import shapely

    started = time.monotonic()
    pids = {pid for place in places.values() for pid in place["pids"]}
    parcels = index_shapes(work, pids)
    missing = sorted(pid for pid in pids if pid not in parcels)
    shapes = Shapes(work, places, parcels)
    try:
        boxes = {place_id: shapes.bbox(place_id) for place_id in places}
        parks = [p for p, place in places.items() if not place["is_recognition"] and boxes[p]]
        tree = shapely.STRtree([shapely.box(*boxes[p]) for p in parks])
        done_path = work / LINKS_DONE_NAME
        done = set(done_path.read_text().split()) if done_path.exists() else set()
        todo = [p for p, place in places.items() if place["is_recognition"] and boxes[p] and p not in done]
        # Neighbours together, so the parks they share stay in the cache.
        todo.sort(key=lambda p: (int((boxes[p][1] + boxes[p][3]) // 10), (boxes[p][0] + boxes[p][2]) / 2))
        print(f"recognitions to do: {len(todo)} (already done: {len(done)}); "
              f"SITE_PIDs not in the file: {len(missing)}", flush=True)
        failed: dict[str, str] = {}
        written = 0
        with (work / LINKS_NAME).open("a") as links, done_path.open("a") as log:
            for n, place_id in enumerate(todo, 1):
                rows = []
                try:
                    subject = shapes.get(place_id)
                    subject_area = shapes.area(place_id)
                    for k in tree.query(shapely.box(*boxes[place_id])):
                        park_id = parks[k]
                        other = shapes.get(park_id)
                        shared = shared_area(subject, other)
                        if shared <= 0 or not subject_area or not shapes.area(park_id):
                            continue
                        subject_share = min(shared / subject_area, 1.0)
                        object_share = min(shared / shapes.area(park_id), 1.0)
                        if subject_share < MIN_SHARE and object_share < MIN_SHARE:
                            continue
                        rows.append([
                            place_id, park_id, places[place_id]["boundary_id"],
                            places[park_id]["boundary_id"], f"{shared / 1e6:.4f}",
                            f"{subject_share:.6f}", f"{object_share:.6f}",
                        ])
                except Exception as exc:  # noqa: BLE001 - report and carry on
                    failed[place_id] = import_wdpa.first_line(exc)
                    continue
                links.write("".join("\t".join(row) + "\n" for row in rows))
                links.flush()
                log.write(place_id + "\n")
                log.flush()
                written += len(rows)
                if n % 250 == 0 or n == len(todo):
                    print(f"recognitions: {n} of {len(todo)}; links: {written}; "
                          f"{(time.monotonic() - started) / 60:.1f} min; peak memory {peak_memory_mb()} MB",
                          flush=True)
    finally:
        shapes.close()
    if failed:
        (work / LINKS_FAILED_NAME).write_text(json.dumps(failed, indent=2) + "\n")
        print(f"{len(failed)} recognitions failed, see {work / LINKS_FAILED_NAME}", flush=True)
    result = {
        "links_written": written,
        "failed": len(failed),
        "missing_site_pids": len(missing),
        "minutes": round((time.monotonic() - started) / 60, 1),
        "peak_memory_mb": peak_memory_mb(),
    }
    print(json.dumps(result), flush=True)
    for row in file_counts(work, places):
        print(json.dumps(row), flush=True)
    return result


def file_counts(work: Path, places: dict[str, dict]) -> list[dict]:
    """The counts of COUNTS, from the links file."""
    rows: dict[str, dict] = {}
    with (work / LINKS_NAME).open() as handle:
        for line in handle:
            subject, obj, _, _, _, _, object_share = line.rstrip("\n").split("\t")
            kind = places[subject]["place_type_id"]
            row = rows.setdefault(kind, {"place_type_id": kind, "recognitions": set(), "links": 0,
                                         **{f"at_{round(t * 100)}": 0 for t in THRESHOLDS},
                                         "parks_at_50": set()})
            row["recognitions"].add(subject)
            row["links"] += 1
            share = float(object_share)
            for t in THRESHOLDS:
                row[f"at_{round(t * 100)}"] += share >= t
            if share >= 0.5:
                row["parks_at_50"].add(obj)
    out = []
    for kind in sorted(rows):
        row = rows[kind]
        out.append({**row, "recognitions": len(row["recognitions"]), "parks_at_50": len(row["parks_at_50"])})
    return out


def load(conn, work: Path) -> dict:
    """Insert the links file in one transaction."""
    path = work / LINKS_NAME
    with path.open() as handle:
        rows = [line.rstrip("\n").split("\t") for line in handle if line.strip()]
    with conn.cursor() as cur:
        cur.execute(CREATE_LOADED_LINKS)
        cur.execute("truncate loaded_links")
        with cur.copy(COPY_LOADED_LINKS) as copy:
            for row in rows:
                copy.write_row(row)
        cur.execute(INSERT_LOADED_LINKS)
        inserted = cur.rowcount
    conn.commit()
    result = {"in_file": len(rows), "inserted": inserted, "skipped": len(rows) - inserted}
    print(json.dumps(result), flush=True)
    return result


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command not in ("derive", "compute", "load", "counts", "confirm"):
        raise SystemExit("usage: derive_recognises.py derive | compute | load | counts | confirm SHARE")
    conn = import_wdpa.open_connection()
    if command == "compute":
        try:
            places = fetch_places(conn)
        finally:
            conn.close()
        compute(places, work_dir())
        return
    try:
        if command == "load":
            load(conn, work_dir())
            counts(conn)
        elif command == "derive":
            result = derive(conn, work_dir())
            print(json.dumps({k: v for k, v in result.items() if k != "failed"}), flush=True)
            counts(conn)
        elif command == "counts":
            counts(conn)
        else:
            if len(sys.argv) < 3:
                raise SystemExit("usage: derive_recognises.py confirm SHARE")
            confirm(conn, float(sys.argv[2]))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
