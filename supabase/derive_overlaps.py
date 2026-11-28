#!/usr/bin/env python3
"""Derive overlaps links between conservation areas (Shaping Boundaries task 04).

  compute        Read-only on the database. Every pair of published conservation
                 areas whose shapes meet, once, with the smaller id as subject,
                 computed on this machine from the importer's filtered file, with
                 the shapes of derive_recognises.py (EPSG:6933, equal area). A pair
                 is kept when the shared area is at least 1% of either place.
                 Writes derive_overlaps_links.tsv in the work directory, one park
                 at a time, and resumes where it stopped. Prints the counts and
                 its peak memory.
  counts         Read-only. The counts of compute, from the links file: how many
                 pairs reach 25%, 50%, 75%, and 90% of the smaller place.
  load SHARE     Insert the pairs whose larger share is at or above SHARE (0 to 1)
                 as derived, proposed overlaps rows, in one transaction. A pair
                 whose boundary is no longer current, or that already has an
                 active row, is skipped.

The admin reviews the proposed rows in the app (review_overlap). The connection is
the importer's: DATABASE_URL for the local database, or SUPABASE_ACCESS_TOKEN for a
short-lived hosted login role.
"""

from __future__ import annotations

import importlib.util
import json
import sys
import time
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "derive_recognises", Path(__file__).resolve().parent / "derive_recognises.py"
)
derive_recognises = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = derive_recognises
_spec.loader.exec_module(derive_recognises)
import_wdpa = derive_recognises.import_wdpa

MIN_SHARE = 0.01
THRESHOLDS = (0.25, 0.5, 0.75, 0.9)
LINKS_NAME = "derive_overlaps_links.tsv"
LINKS_DONE_NAME = "derive_overlaps_links_done.txt"
LINKS_FAILED_NAME = "derive_overlaps_links_failed.json"

INSERT_LOADED_LINKS = """
insert into public.place_relationships (
  subject_place_id, relationship_type_id, object_place_id, origin, status,
  subject_boundary_id, object_boundary_id, subject_coverage, object_coverage
)
select
  links.subject_place_id, 'overlaps', links.object_place_id, 'derived', 'proposed',
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
  and subject.place_type_id = 'conservation_area'
join public.places as object
  on object.id = links.object_place_id
  and object.publication_status = 'published'
  and object.place_type_id = 'conservation_area'
where greatest(links.subject_coverage, links.object_coverage) >= %(share)s
  and links.subject_place_id < links.object_place_id
on conflict (subject_place_id, relationship_type_id, object_place_id)
  where retired_at is null
  do nothing
"""


def fetch_parks(conn) -> dict[str, dict]:
    """Published conservation areas, with their current boundary and SITE_PIDs."""
    places = derive_recognises.fetch_places(conn)
    return {p: place for p, place in places.items() if place["place_type_id"] == "conservation_area"}


def compute(places: dict[str, dict], work: Path) -> dict:
    """Write the links file for every park not yet done."""
    import shapely

    started = time.monotonic()
    pids = {pid for place in places.values() for pid in place["pids"]}
    parcels = derive_recognises.index_shapes(work, pids)
    missing = sorted(pid for pid in pids if pid not in parcels)
    shapes = derive_recognises.Shapes(work, places, parcels)
    try:
        boxes = {place_id: shapes.bbox(place_id) for place_id in places}
        parks = [p for p in places if boxes[p]]
        tree = shapely.STRtree([shapely.box(*boxes[p]) for p in parks])
        done_path = work / LINKS_DONE_NAME
        done = set(done_path.read_text().split()) if done_path.exists() else set()
        todo = [p for p in parks if p not in done]
        # Neighbours together, so the parks they share stay in the cache.
        todo.sort(key=lambda p: (int((boxes[p][1] + boxes[p][3]) // 10), (boxes[p][0] + boxes[p][2]) / 2))
        print(f"parks to do: {len(todo)} (already done: {len(done)}); "
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
                        other_id = parks[k]
                        # Each pair once, with the smaller id as subject.
                        if other_id <= place_id:
                            continue
                        other = shapes.get(other_id)
                        other_area = shapes.area(other_id)
                        shared = derive_recognises.shared_area(subject, other)
                        if shared <= 0 or not subject_area or not other_area:
                            continue
                        subject_share = min(shared / subject_area, 1.0)
                        object_share = min(shared / other_area, 1.0)
                        if subject_share < MIN_SHARE and object_share < MIN_SHARE:
                            continue
                        rows.append([
                            place_id, other_id, places[place_id]["boundary_id"],
                            places[other_id]["boundary_id"], f"{shared / 1e6:.4f}",
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
                if n % 1000 == 0 or n == len(todo):
                    print(f"parks: {n} of {len(todo)}; pairs: {written}; "
                          f"{(time.monotonic() - started) / 60:.1f} min; "
                          f"peak memory {derive_recognises.peak_memory_mb()} MB", flush=True)
    finally:
        shapes.close()
    if failed:
        (work / LINKS_FAILED_NAME).write_text(json.dumps(failed, indent=2) + "\n")
        print(f"{len(failed)} parks failed, see {work / LINKS_FAILED_NAME}", flush=True)
    result = {
        "pairs_written": written,
        "failed": len(failed),
        "missing_site_pids": len(missing),
        "minutes": round((time.monotonic() - started) / 60, 1),
        "peak_memory_mb": derive_recognises.peak_memory_mb(),
    }
    print(json.dumps(result), flush=True)
    print(json.dumps(file_counts(work)), flush=True)
    return result


def file_counts(work: Path) -> dict:
    """How many pairs reach each share of the smaller place, and how many parks they touch."""
    counts = {"pairs": 0, **{f"at_{round(t * 100)}": 0 for t in THRESHOLDS}}
    parks = {f"parks_at_{round(t * 100)}": set() for t in THRESHOLDS}
    with (work / LINKS_NAME).open() as handle:
        for line in handle:
            subject, obj, _, _, _, subject_share, object_share = line.rstrip("\n").split("\t")
            share = max(float(subject_share), float(object_share))
            counts["pairs"] += 1
            for t in THRESHOLDS:
                if share >= t:
                    counts[f"at_{round(t * 100)}"] += 1
                    parks[f"parks_at_{round(t * 100)}"].update((subject, obj))
    return {**counts, **{key: len(ids) for key, ids in parks.items()}}


def load(conn, work: Path, share: float) -> dict:
    """Insert the pairs at or above the share in one transaction."""
    if not 0 < share <= 1:
        raise SystemExit("SHARE must be above 0 and at most 1")
    path = work / LINKS_NAME
    with path.open() as handle:
        rows = [line.rstrip("\n").split("\t") for line in handle if line.strip()]
    kept = [row for row in rows if max(float(row[5]), float(row[6])) >= share]
    with conn.cursor() as cur:
        cur.execute(derive_recognises.CREATE_LOADED_LINKS)
        cur.execute("truncate loaded_links")
        with cur.copy(derive_recognises.COPY_LOADED_LINKS) as copy:
            for row in kept:
                copy.write_row(row)
        cur.execute(INSERT_LOADED_LINKS, {"share": share})
        inserted = cur.rowcount
    conn.commit()
    result = {"in_file": len(rows), "at_share": len(kept), "inserted": inserted,
              "skipped": len(kept) - inserted}
    print(json.dumps(result), flush=True)
    return result


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command not in ("compute", "counts", "load"):
        raise SystemExit("usage: derive_overlaps.py compute | counts | load SHARE")
    work = derive_recognises.work_dir()
    if command == "counts":
        print(json.dumps(file_counts(work)), flush=True)
        return
    if command == "load" and len(sys.argv) < 3:
        raise SystemExit("usage: derive_overlaps.py load SHARE")
    conn = import_wdpa.open_connection()
    try:
        if command == "compute":
            places = fetch_parks(conn)
            conn.close()
            compute(places, work)
        else:
            load(conn, work, float(sys.argv[2]))
    finally:
        if not conn.closed:
            conn.close()


if __name__ == "__main__":
    main()
