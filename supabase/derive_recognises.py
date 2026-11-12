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
  confirm SHARE  Set status confirmed on derived proposed recognises rows with
                 object_coverage at or above SHARE (0 to 1). Changes nothing else.

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


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command not in ("derive", "counts", "confirm"):
        raise SystemExit("usage: derive_recognises.py derive | counts | confirm SHARE")
    conn = import_wdpa.open_connection()
    try:
        if command == "derive":
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
