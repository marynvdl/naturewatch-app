#!/usr/bin/env python3
"""Derive located_in links from parks to ecoregions (Ecoregions task 02).

  compute        Read-only on the database. Read the current boundaries of the
                 published ecoregions, cut each on a 1 degree grid, and project
                 the pieces to EPSG:6933, which is equal area. Then read the
                 current boundaries of the published conservation areas and
                 recognitions in batches, cut them the same way, and intersect
                 each piece with the ecoregion pieces of its grid cell. Writes
                 ecoregion_links.tsv in the work directory: one link per park and
                 ecoregion whose shared area is at least 1% of either place. A
                 second start continues after the last park done.
  load           Insert the links in ecoregion_links.tsv as derived, proposed
                 located_in rows, in one transaction. A link whose boundary is no
                 longer current, whose place is no longer published, or whose
                 pair already has an active row, is skipped.
  counts         Read-only. Per park type and share of the park (subject_coverage)
                 of 1%, 5%, 10%, 25% and 50%: the links, the parks with a link,
                 the parks without one, and the median ecoregions per linked park.
  confirm SHARE  Set status confirmed on derived proposed located_in rows with
                 subject_coverage at or above SHARE (0 to 1). Changes nothing else.

The overlap is not computed in the database: place_overlaps() ran the hosted
Micro database out of memory on 12 November 2026.

The connection is the importer's: DATABASE_URL for the local database, or
SUPABASE_ACCESS_TOKEN for a short-lived hosted login role.
"""

from __future__ import annotations

import importlib.util
import json
import math
import os
import sys
import tempfile
import time
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "derive_recognises", Path(__file__).resolve().parent / "derive_recognises.py"
)
derive_recognises = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = derive_recognises
_spec.loader.exec_module(derive_recognises)
import_wdpa = derive_recognises.import_wdpa

GRID_STEPS = (10.0, 1.0)
MIN_SHARE = 0.01
THRESHOLDS = (0.01, 0.05, 0.1, 0.25, 0.5)
FETCH_ROWS = 200
LINKS_NAME = "ecoregion_links.tsv"
DONE_NAME = "ecoregion_links_done.txt"
FAILED_NAME = "ecoregion_links_failed.json"

ECOREGIONS = """
select places.id::text as place_id, boundary.id::text as boundary_id,
  extensions.st_asbinary(boundary.geom) as wkb
from public.places
join public.place_boundaries as boundary
  on boundary.place_id = places.id
  and boundary.is_current
where places.place_type_id = 'ecoregion'
  and places.publication_status = 'published'
order by places.id
"""
PARKS_WHERE = """
from public.places
join public.place_types on place_types.id = places.place_type_id
join public.place_boundaries as boundary
  on boundary.place_id = places.id
  and boundary.is_current
where places.publication_status = 'published'
  and (places.place_type_id = 'conservation_area' or place_types.place_category_id = 'recognition')
  and places.id > %(after)s::uuid
"""
PARKS = (
    "select places.id::text as place_id, boundary.id::text as boundary_id, "
    "extensions.st_asbinary(boundary.geom) as wkb" + PARKS_WHERE + "order by places.id"
)
PARKS_COUNT = "select count(*) as n" + PARKS_WHERE
NO_ID = "00000000-0000-0000-0000-000000000000"

INSERT_LOADED_LINKS = """
insert into public.place_relationships (
  subject_place_id, relationship_type_id, object_place_id, origin, status,
  subject_boundary_id, object_boundary_id, subject_coverage, object_coverage
)
select
  links.subject_place_id, 'located_in', links.object_place_id, 'derived', 'proposed',
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
  and (subject_type.id = 'conservation_area' or subject_type.place_category_id = 'recognition')
join public.places as object
  on object.id = links.object_place_id
  and object.publication_status = 'published'
  and object.place_type_id = 'ecoregion'
on conflict (subject_place_id, relationship_type_id, object_place_id)
  where retired_at is null
  do nothing
"""
COUNTS = """
with parks as (
  select places.id, places.place_type_id
  from public.places
  join public.place_types on place_types.id = places.place_type_id
  where places.publication_status = 'published'
    and (places.place_type_id = 'conservation_area' or place_types.place_category_id = 'recognition')
),
links as (
  select subject_place_id, subject_coverage
  from public.place_relationships
  where relationship_type_id = 'located_in'
    and origin = 'derived'
    and retired_at is null
),
shares as (
  select unnest(%(thresholds)s::double precision[]) as share
),
per_park as (
  select parks.place_type_id, parks.id, shares.share, count(links.subject_place_id) as n
  from parks
  cross join shares
  left join links
    on links.subject_place_id = parks.id
    and links.subject_coverage >= shares.share
  group by parks.place_type_id, parks.id, shares.share
)
select
  place_type_id,
  share,
  count(*) as parks,
  sum(n)::bigint as links,
  count(*) filter (where n > 0) as parks_linked,
  count(*) filter (where n = 0) as parks_unlinked,
  percentile_disc(0.5) within group (order by n) filter (where n > 0) as median_per_park
from per_park
group by place_type_id, share
order by place_type_id, share
"""
STATUS = """
select status, count(*) as links
from public.place_relationships
where relationship_type_id = 'located_in'
  and origin = 'derived'
  and retired_at is null
group by status
order by status
"""
CONFIRM = """
update public.place_relationships
set status = 'confirmed'
where relationship_type_id = 'located_in'
  and origin = 'derived'
  and status = 'proposed'
  and retired_at is null
  and subject_coverage >= %(share)s
"""


def work_dir() -> Path:
    path = Path(os.environ.get("ECOREGIONS_WORK_DIR") or Path(tempfile.gettempdir()) / "ecoregions-work")
    path.mkdir(parents=True, exist_ok=True)
    return path


# --- shapes ---------------------------------------------------------------------------


def grid_pieces(geom, steps: tuple[float, ...] = GRID_STEPS) -> list[tuple[tuple[int, int], object]]:
    """Cut a valid lon/lat shape on a grid of the last step's size, keyed by cell.
    Coarser steps come first, so a large shape is not clipped once per small cell."""
    return list(_cut(geom, steps, 0))


def _cut(geom, steps, level):
    import shapely

    size = steps[level]
    west, south, east, north = geom.bounds
    x0, y0 = math.floor(west / size), math.floor(south / size)
    x1, y1 = math.ceil(east / size), math.ceil(north / size)
    cells = [(x, y) for x in range(x0, max(x1, x0 + 1)) for y in range(y0, max(y1, y0 + 1))]
    last = level == len(steps) - 1
    if len(cells) == 1 and last:
        yield cells[0], geom
        return
    for x, y in cells:
        if len(cells) == 1:
            piece = geom
        else:
            box = shapely.box(x * size, y * size, (x + 1) * size, (y + 1) * size)
            piece = derive_recognises.polygonal(shapely.intersection(geom, box))
        if piece.is_empty or shapely.area(piece) == 0:
            continue
        if last:
            yield (x, y), piece
        else:
            yield from _cut(piece, steps, level + 1)


class Projector:
    def __init__(self):
        import pyproj

        self.transform = pyproj.Transformer.from_crs(4326, 6933, always_xy=True).transform

    def __call__(self, geom):
        import numpy
        import shapely

        return derive_recognises.polygonal(
            shapely.transform(geom, lambda xy: numpy.column_stack(self.transform(xy[:, 0], xy[:, 1])))
        )


def projected_pieces(wkb: bytes, project: Projector) -> list[tuple[tuple[int, int], object]]:
    import shapely

    geom = derive_recognises.polygonal(shapely.from_wkb(wkb))
    out = []
    for cell, piece in grid_pieces(geom):
        projected = project(piece)
        if not projected.is_empty:
            out.append((cell, projected))
    return out


def piece_area(piece, other) -> float:
    import shapely

    try:
        return float(shapely.area(shapely.intersection(piece, other)))
    except shapely.errors.GEOSException:
        return float(shapely.area(shapely.intersection(piece, other, grid_size=1.0)))


class Ecoregions:
    """The ecoregion pieces in EPSG:6933, by grid cell."""

    def __init__(self, rows: list[dict], project: Projector):
        import shapely

        self.ids: list[str] = []
        self.boundaries: list[str] = []
        self.areas: list[float] = []
        self.cells: dict[tuple[int, int], list[tuple[int, object]]] = {}
        for index, row in enumerate(rows):
            self.ids.append(row["place_id"])
            self.boundaries.append(row["boundary_id"])
            area = 0.0
            for cell, piece in projected_pieces(bytes(row["wkb"]), project):
                shapely.prepare(piece)
                self.cells.setdefault(cell, []).append((index, piece))
                area += shapely.area(piece)
            self.areas.append(area)

    def shared(self, pieces) -> dict[int, float]:
        """Shared m2 with each ecoregion, from a park's pieces."""
        import shapely

        shared: dict[int, float] = {}
        for cell, piece in pieces:
            for index, eco in self.cells.get(cell, ()):
                if not shapely.intersects(eco, piece):
                    continue
                area = piece_area(piece, eco)
                if area > 0:
                    shared[index] = shared.get(index, 0.0) + area
        return shared


def links_for_park(row: dict, ecoregions: Ecoregions, project: Projector) -> list[list[str]]:
    import shapely

    pieces = projected_pieces(bytes(row["wkb"]), project)
    park_area = sum(shapely.area(piece) for _, piece in pieces)
    if not park_area:
        return []
    out = []
    for index, shared in sorted(ecoregions.shared(pieces).items()):
        eco_area = ecoregions.areas[index]
        subject_share = min(shared / park_area, 1.0)
        object_share = min(shared / eco_area, 1.0) if eco_area else 0.0
        if subject_share < MIN_SHARE and object_share < MIN_SHARE:
            continue
        out.append([
            row["place_id"], ecoregions.ids[index], row["boundary_id"], ecoregions.boundaries[index],
            f"{shared / 1e6:.4f}", f"{subject_share:.6f}", f"{object_share:.6f}",
        ])
    return out


# --- commands ---------------------------------------------------------------------------


def compute(conn, work: Path) -> dict:
    started = time.monotonic()
    project = Projector()
    with conn.cursor() as cur:
        cur.execute(ECOREGIONS)
        ecoregion_rows = cur.fetchall()
    conn.commit()
    ecoregions = Ecoregions(ecoregion_rows, project)
    del ecoregion_rows
    print(f"ecoregions: {len(ecoregions.ids)}; grid cells: {len(ecoregions.cells)}; "
          f"{(time.monotonic() - started) / 60:.1f} min; peak memory {derive_recognises.peak_memory_mb()} MB",
          flush=True)

    done_path = work / DONE_NAME
    done = done_path.read_text().split() if done_path.exists() else []
    after = done[-1] if done else NO_ID
    with conn.cursor() as cur:
        cur.execute(PARKS_COUNT, {"after": after})
        todo = cur.fetchone()["n"]
    print(f"parks to do: {todo} (already done: {len(done)})", flush=True)

    failed: dict[str, str] = {}
    parks = written = unlinked = 0
    with (work / LINKS_NAME).open("a") as links, done_path.open("a") as log:
        with conn.cursor(name="ecoregion_link_parks") as cur:
            cur.itersize = FETCH_ROWS
            cur.execute(PARKS, {"after": after})
            for row in cur:
                parks += 1
                try:
                    rows = links_for_park(row, ecoregions, project)
                except Exception as exc:  # noqa: BLE001 - report and carry on
                    failed[row["place_id"]] = import_wdpa.first_line(exc)
                    rows = []
                links.write("".join("\t".join(r) + "\n" for r in rows))
                links.flush()
                log.write(row["place_id"] + "\n")
                log.flush()
                written += len(rows)
                unlinked += not rows and row["place_id"] not in failed
                if parks % 1000 == 0 or parks == todo:
                    print(f"parks: {parks} of {todo}; links: {written}; "
                          f"{(time.monotonic() - started) / 60:.1f} min; "
                          f"peak memory {derive_recognises.peak_memory_mb()} MB", flush=True)
        conn.commit()
    if failed:
        (work / FAILED_NAME).write_text(json.dumps(failed, indent=2) + "\n")
        print(f"{len(failed)} parks failed, see {work / FAILED_NAME}", flush=True)
    result = {
        "parks": parks,
        "links_written": written,
        "parks_without_link": unlinked,
        "failed": len(failed),
        "minutes": round((time.monotonic() - started) / 60, 1),
        "peak_memory_mb": derive_recognises.peak_memory_mb(),
    }
    print(json.dumps(result), flush=True)
    return result


def load(conn, work: Path) -> dict:
    with (work / LINKS_NAME).open() as handle:
        rows = [line.rstrip("\n").split("\t") for line in handle if line.strip()]
    with conn.cursor() as cur:
        cur.execute(derive_recognises.CREATE_LOADED_LINKS)
        cur.execute("truncate loaded_links")
        with cur.copy(derive_recognises.COPY_LOADED_LINKS) as copy:
            for row in rows:
                copy.write_row(row)
        cur.execute(INSERT_LOADED_LINKS)
        inserted = cur.rowcount
    conn.commit()
    result = {"in_file": len(rows), "inserted": inserted, "skipped": len(rows) - inserted}
    print(json.dumps(result), flush=True)
    return result


def counts(conn) -> dict:
    with conn.cursor() as cur:
        cur.execute(COUNTS, {"thresholds": list(THRESHOLDS)})
        rows = cur.fetchall()
        cur.execute(STATUS)
        status = {row["status"]: row["links"] for row in cur.fetchall()}
    conn.rollback()
    for row in rows:
        print(json.dumps({key: row[key] for key in row}), flush=True)
    print(json.dumps({"status": status}), flush=True)
    return {"rows": rows, "status": status}


def confirm(conn, share: float) -> int:
    if not 0 < share <= 1:
        raise SystemExit("the share must be above 0 and at most 1")
    with conn.cursor() as cur:
        cur.execute(CONFIRM, {"share": share})
        confirmed = cur.rowcount
    conn.commit()
    print(f"confirmed: {confirmed} links with subject_coverage >= {share}", flush=True)
    return confirmed


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command not in ("compute", "load", "counts", "confirm"):
        raise SystemExit("usage: derive_ecoregion_links.py compute | load | counts | confirm SHARE")
    if command == "confirm" and len(sys.argv) < 3:
        raise SystemExit("usage: derive_ecoregion_links.py confirm SHARE")
    conn = import_wdpa.open_connection()
    try:
        if command == "compute":
            compute(conn, work_dir())
        elif command == "load":
            load(conn, work_dir())
            counts(conn)
        elif command == "counts":
            counts(conn)
        else:
            confirm(conn, float(sys.argv[2]))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
