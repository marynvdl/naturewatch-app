#!/usr/bin/env python3
"""Boundary QC (Shaping Boundaries task 01).

  measure   Read-only on the database. Read every current boundary in batches
            and measure it on this machine: validity, vertices, parts, holes,
            and how many parts and holes fall below each size in SIZE_EDGES_KM2
            (areas in EPSG:6933, which is equal area). Writes
            boundary_measures.tsv in the work directory. A second start
            continues after the last boundary done.
  summary   No database. From the TSV, per place type: percentiles of each
            measure, and how many boundaries the thresholds below would flag
            or leave over the vertex cap.
  load      From the TSV, in committed batches: insert the four findings per
            boundary into boundary_checks, set qc_status, and set the first
            stats_eligibility. A boundary that is no longer current, or that
            already has findings from this CHECKER_VERSION, is skipped, so a
            second start continues. An accepted or rejected qc_status is kept. Eligibility
            set by a person is kept.

measure --unchecked and load --unchecked do the same for the current boundaries
still unchecked, such as an approved upload, in boundary_measures_unchecked.tsv.
measure --unchecked starts that file afresh each time.

The geometry is never checked in the database: place_overlaps() ran the hosted
Micro database out of memory on 12 November 2026. load commits in batches
because each update re-runs the boundary's validity CHECK and area.

The connection is the importer's: DATABASE_URL for the local database, or
SUPABASE_ACCESS_TOKEN for a short-lived hosted login role.
"""

from __future__ import annotations

import csv
import importlib.util
import json
import os
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "derive_recognises", Path(__file__).resolve().parent / "derive_recognises.py"
)
derive_recognises = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = derive_recognises
_spec.loader.exec_module(derive_recognises)
import_wdpa = derive_recognises.import_wdpa

CHECKER_VERSION = "check_boundaries 1"
SIZE_EDGES_KM2 = (0.0001, 0.001, 0.01, 0.1, 1.0, 10.0, 100.0)
FETCH_ROWS = 50
LOAD_BATCH = 500
MEASURES_NAME = "boundary_measures.tsv"
UNCHECKED_NAME = "boundary_measures_unchecked.tsv"
FAILED_NAME = "boundary_measures_failed.json"
NO_ID = "00000000-0000-0000-0000-000000000000"


@dataclass(frozen=True)
class Thresholds:
    """When the modelling checks warn, for one place type.

    small_components warns when a boundary has at least min_parts parts and the
    share of parts under part_km2 is at least small_share. holes warns when it
    has at least min_holes holes and the share of holes under hole_km2 is at
    least tiny_share. part_km2 and hole_km2 must be in SIZE_EDGES_KM2.
    """

    part_km2: float
    min_parts: int
    small_share: float
    hole_km2: float
    min_holes: int
    tiny_share: float


# Approved on 27 November 2026 after measure on the hosted database: one setting for
# every place type, which flagged 0-2% of each type.
DEFAULT_THRESHOLDS = Thresholds(
    part_km2=0.01, min_parts=50, small_share=0.5, hole_km2=0.001, min_holes=50, tiny_share=0.5
)
THRESHOLDS: dict[str, Thresholds] = {}
VERTEX_CAP = 100_000

COLUMNS = (
    ["boundary_id", "place_type_id", "valid", "valid_reason", "vertices", "parts", "holes"]
    + [f"parts_lt_{edge:g}" for edge in SIZE_EDGES_KM2]
    + [f"holes_lt_{edge:g}" for edge in SIZE_EDGES_KM2]
)

BOUNDARIES_WHERE = """
from public.place_boundaries as boundary
join public.places on places.id = boundary.place_id
where boundary.is_current
  and boundary.id > %(after)s::uuid
  and (not %(unchecked)s or boundary.qc_status = 'unchecked')
"""
BOUNDARIES = (
    "select boundary.id::text as boundary_id, places.place_type_id, "
    "extensions.st_asbinary(boundary.geom) as wkb" + BOUNDARIES_WHERE + "order by boundary.id"
)
BOUNDARIES_COUNT = "select count(*) as n" + BOUNDARIES_WHERE

CREATE_LOADED = """
create temporary table if not exists loaded_checks (
  boundary_id uuid not null,
  check_id text not null,
  check_category text not null,
  outcome text not null,
  measured_value double precision,
  threshold_used double precision,
  details jsonb not null
) on commit delete rows;
create temporary table if not exists loaded_status (
  boundary_id uuid primary key,
  qc_status text not null,
  eligible boolean not null,
  reason text
) on commit delete rows;
truncate loaded_checks, loaded_status;
"""
COPY_CHECKS = (
    "copy loaded_checks (boundary_id, check_id, check_category, outcome, measured_value, "
    "threshold_used, details) from stdin"
)
COPY_STATUS = "copy loaded_status (boundary_id, qc_status, eligible, reason) from stdin"
# Boundaries in this batch that are current and not yet checked by this version.
KEEP_TODO = """
delete from loaded_status as s
where not exists (
    select 1 from public.place_boundaries as b where b.id = s.boundary_id and b.is_current
  )
  or exists (
    select 1 from public.boundary_checks as c
    where c.boundary_id = s.boundary_id and c.checker_version = %(version)s
  )
"""
INSERT_CHECKS = """
insert into public.boundary_checks (
  boundary_id, check_id, check_category, outcome, measured_value, threshold_used,
  checker_version, details
)
select c.boundary_id, c.check_id, c.check_category, c.outcome, c.measured_value,
  c.threshold_used, %(version)s, c.details
from loaded_checks as c
join loaded_status as s on s.boundary_id = c.boundary_id
"""
# An accepted or rejected status stays: it is a person's verdict on the shape, and a
# rejected boundary is never made eligible. A boundary made eligible by a person stays as it is,
# unless it becomes flagged, which the eligibility CHECK refuses; then it goes
# back to pending. Only a boundary never decided is made eligible here.
UPDATE_STATUS = """
update public.place_boundaries as b
set qc_status = case when b.qc_status in ('accepted', 'rejected') then b.qc_status else s.qc_status end,
  stats_eligibility = case
    when b.stats_eligibility = 'eligible' and b.qc_status <> 'accepted' and s.qc_status <> 'passed'
      then 'pending'
    when b.stats_eligibility = 'pending' and b.stats_eligibility_set_at is null and s.eligible and b.qc_status <> 'rejected'
      then 'eligible'
    else b.stats_eligibility
  end,
  stats_eligibility_reason = case
    when b.stats_eligibility = 'eligible' and b.qc_status <> 'accepted' and s.qc_status <> 'passed'
      then %(version)s || ': flagged, back to pending'
    when b.stats_eligibility = 'pending' and b.stats_eligibility_set_at is null and s.eligible and b.qc_status <> 'rejected'
      then s.reason
    else b.stats_eligibility_reason
  end,
  stats_eligibility_set_at = case
    when (b.stats_eligibility = 'eligible' and b.qc_status <> 'accepted' and s.qc_status <> 'passed')
      or (b.stats_eligibility = 'pending' and b.stats_eligibility_set_at is null and s.eligible and b.qc_status <> 'rejected')
      then now()
    else b.stats_eligibility_set_at
  end
from loaded_status as s
where b.id = s.boundary_id
"""
COUNTS = """
select places.place_type_id, boundary.qc_status, boundary.stats_eligibility, count(*) as n
from public.place_boundaries as boundary
join public.places on places.id = boundary.place_id
where boundary.is_current
group by 1, 2, 3
order by 1, 2, 3
"""


def work_dir() -> Path:
    path = Path(os.environ.get("BOUNDARY_QC_WORK_DIR") or Path(tempfile.gettempdir()) / "boundary-qc-work")
    path.mkdir(parents=True, exist_ok=True)
    return path


def thresholds_for(place_type_id: str) -> Thresholds:
    return THRESHOLDS.get(place_type_id, DEFAULT_THRESHOLDS)


# --- measuring ------------------------------------------------------------------------


class Projector:
    """EPSG:4326 to EPSG:6933, equal area, in metres."""

    def __init__(self):
        import pyproj

        self.transform = pyproj.Transformer.from_crs(4326, 6933, always_xy=True).transform

    def __call__(self, geom):
        import numpy
        import shapely

        return shapely.transform(geom, lambda xy: numpy.column_stack(self.transform(xy[:, 0], xy[:, 1])))


def below(areas_km2, edges=SIZE_EDGES_KM2) -> list[int]:
    import numpy

    areas = numpy.asarray(areas_km2, dtype=float)
    return [int((areas < edge).sum()) for edge in edges]


def measure(wkb: bytes, project: Projector) -> dict:
    """The measures of one boundary, as written to the TSV."""
    import shapely

    raw = shapely.from_wkb(wkb)
    valid = (
        bool(shapely.is_valid(raw))
        and not raw.is_empty
        and raw.geom_type in ("Polygon", "MultiPolygon")
    )
    reason = "" if valid else ("empty" if raw.is_empty else shapely.is_valid_reason(raw))
    geom = raw if valid else derive_recognises.polygonal(raw)
    projected = project(geom)
    parts = shapely.get_parts(projected)
    part_areas = shapely.area(parts) / 1e6
    hole_areas = []
    for part in parts:
        rings = shapely.get_interior_ring(part, range(shapely.get_num_interior_rings(part)))
        if len(rings):
            hole_areas.extend(shapely.area(shapely.polygons(rings)) / 1e6)
    return {
        "valid": valid,
        "valid_reason": reason,
        "vertices": int(shapely.get_num_coordinates(raw)),
        "parts": len(parts),
        "holes": len(hole_areas),
        "parts_lt": below(part_areas),
        "holes_lt": below(hole_areas),
    }


def to_row(boundary_id: str, place_type_id: str, m: dict) -> list[str]:
    return (
        [boundary_id, place_type_id, "1" if m["valid"] else "0",
         m["valid_reason"].replace("\t", " ").replace("\n", " "),
         str(m["vertices"]), str(m["parts"]), str(m["holes"])]
        + [str(n) for n in m["parts_lt"]]
        + [str(n) for n in m["holes_lt"]]
    )


def from_row(row: dict) -> dict:
    return {
        "boundary_id": row["boundary_id"],
        "place_type_id": row["place_type_id"],
        "valid": row["valid"] == "1",
        "valid_reason": row["valid_reason"],
        "vertices": int(row["vertices"]),
        "parts": int(row["parts"]),
        "holes": int(row["holes"]),
        "parts_lt": [int(row[f"parts_lt_{edge:g}"]) for edge in SIZE_EDGES_KM2],
        "holes_lt": [int(row[f"holes_lt_{edge:g}"]) for edge in SIZE_EDGES_KM2],
    }


def measures_name(unchecked: bool) -> str:
    return UNCHECKED_NAME if unchecked else MEASURES_NAME


def read_measures(work: Path, unchecked: bool = False) -> list[dict]:
    path = work / measures_name(unchecked)
    if not path.exists():
        raise SystemExit(f"no measures yet: run measure first ({path})")
    with path.open(newline="") as handle:
        return [from_row(row) for row in csv.DictReader(handle, delimiter="\t", quoting=csv.QUOTE_NONE)]


# --- outcomes -------------------------------------------------------------------------


def share_below(m: dict, kind: str, edge: float) -> float:
    total = m[kind]
    return m[f"{kind}_lt"][SIZE_EDGES_KM2.index(edge)] / total if total else 0.0


def outcomes(m: dict, t: Thresholds, vertex_cap: int = VERTEX_CAP) -> tuple[list[dict], str, bool]:
    """The four findings of one boundary, its qc_status, and whether it is eligible."""
    small = share_below(m, "parts", t.part_km2)
    tiny = share_below(m, "holes", t.hole_km2)
    small_n = m["parts_lt"][SIZE_EDGES_KM2.index(t.part_km2)]
    tiny_n = m["holes_lt"][SIZE_EDGES_KM2.index(t.hole_km2)]
    checks = [
        {
            "check_id": "geometry_valid",
            "check_category": "technical",
            "outcome": "pass" if m["valid"] else "fail",
            "measured_value": None,
            "threshold_used": None,
            "details": {"reason": m["valid_reason"]} if m["valid_reason"] else {},
        },
        {
            "check_id": "small_components",
            "check_category": "modelling",
            "outcome": "warn" if m["parts"] >= t.min_parts and small >= t.small_share else "pass",
            "measured_value": small,
            "threshold_used": t.small_share,
            "details": {"parts": m["parts"], "small_parts": small_n,
                        "part_km2": t.part_km2, "min_parts": t.min_parts},
        },
        {
            "check_id": "holes",
            "check_category": "modelling",
            "outcome": "warn" if m["holes"] >= t.min_holes and tiny >= t.tiny_share else "pass",
            "measured_value": tiny,
            "threshold_used": t.tiny_share,
            "details": {"holes": m["holes"], "tiny_holes": tiny_n,
                        "hole_km2": t.hole_km2, "min_holes": t.min_holes},
        },
        {
            "check_id": "vertex_count",
            "check_category": "processing_cost",
            "outcome": "warn" if m["vertices"] > vertex_cap else "pass",
            "measured_value": float(m["vertices"]),
            "threshold_used": float(vertex_cap),
            "details": {},
        },
    ]
    flagged = any(c["outcome"] != "pass" for c in checks if c["check_category"] != "processing_cost")
    qc_status = "flagged" if flagged else "passed"
    eligible = qc_status == "passed" and checks[3]["outcome"] == "pass"
    return checks, qc_status, eligible


def eligible_reason(vertex_cap: int = VERTEX_CAP) -> str:
    return f"{CHECKER_VERSION}: passed QC, at most {vertex_cap:,} vertices"


# --- commands -------------------------------------------------------------------------


def run_measure(conn, work: Path, unchecked: bool = False) -> dict:
    started = time.monotonic()
    project = Projector()
    path = work / measures_name(unchecked)
    if unchecked:
        path.unlink(missing_ok=True)
    done = []
    if path.exists():
        with path.open(newline="") as handle:
            done = [row["boundary_id"] for row in csv.DictReader(handle, delimiter="\t", quoting=csv.QUOTE_NONE)]
    after = max(done) if done else NO_ID
    with conn.cursor() as cur:
        cur.execute(BOUNDARIES_COUNT, {"after": after, "unchecked": unchecked})
        todo = cur.fetchone()["n"]
    print(f"boundaries to do: {todo} (already done: {len(done)})", flush=True)

    failed: dict[str, str] = {}
    count = 0
    new_file = not path.exists()
    with path.open("a", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t", quoting=csv.QUOTE_NONE, escapechar="\\", lineterminator="\n")
        if new_file:
            writer.writerow(COLUMNS)
        with conn.cursor(name="boundary_qc") as cur:
            cur.itersize = FETCH_ROWS
            cur.execute(BOUNDARIES, {"after": after, "unchecked": unchecked})
            for row in cur:
                count += 1
                try:
                    m = measure(bytes(row["wkb"]), project)
                except Exception as exc:  # noqa: BLE001 - report and carry on
                    failed[row["boundary_id"]] = import_wdpa.first_line(exc)
                    continue
                writer.writerow(to_row(row["boundary_id"], row["place_type_id"], m))
                handle.flush()
                if count % 1000 == 0 or count == todo:
                    print(f"boundaries: {count} of {todo}; "
                          f"{(time.monotonic() - started) / 60:.1f} min; "
                          f"peak memory {derive_recognises.peak_memory_mb()} MB", flush=True)
        conn.commit()
    if failed:
        (work / FAILED_NAME).write_text(json.dumps(failed, indent=2) + "\n")
        print(f"{len(failed)} boundaries failed, see {work / FAILED_NAME}", flush=True)
    result = {
        "boundaries": count,
        "failed": len(failed),
        "minutes": round((time.monotonic() - started) / 60, 1),
        "peak_memory_mb": derive_recognises.peak_memory_mb(),
    }
    print(json.dumps(result), flush=True)
    return result


def percentiles(values, qs=(50, 90, 99, 100)) -> list:
    import numpy

    if not len(values):
        return [None] * len(qs)
    return [round(float(v), 3) for v in numpy.percentile(numpy.asarray(values, dtype=float), qs)]


def summary(measures: list[dict]) -> dict:
    by_type: dict[str, list[dict]] = {}
    for m in measures:
        by_type.setdefault(m["place_type_id"], []).append(m)
    out = {}
    for place_type, rows in sorted(by_type.items()):
        t = thresholds_for(place_type)
        results = [outcomes(m, t) for m in rows]
        many_parts = [m for m in rows if m["parts"] >= 2]
        many_holes = [m for m in rows if m["holes"] >= 1]
        out[place_type] = {
            "boundaries": len(rows),
            "invalid": sum(not m["valid"] for m in rows),
            "vertices_p50_p90_p99_max": percentiles([m["vertices"] for m in rows]),
            "parts_p50_p90_p99_max": percentiles([m["parts"] for m in rows]),
            "holes_p50_p90_p99_max": percentiles([m["holes"] for m in rows]),
            "multipart": len(many_parts),
            "small_part_share_p50_p90_p99_by_km2": {
                f"{edge:g}": percentiles([share_below(m, "parts", edge) for m in many_parts], (50, 90, 99))
                for edge in SIZE_EDGES_KM2
            },
            "with_holes": len(many_holes),
            "tiny_hole_share_p50_p90_p99_by_km2": {
                f"{edge:g}": percentiles([share_below(m, "holes", edge) for m in many_holes], (50, 90, 99))
                for edge in SIZE_EDGES_KM2
            },
            "thresholds": t.__dict__,
            "warn_small_components": sum(c[1]["outcome"] == "warn" for c, _, _ in results),
            "warn_holes": sum(c[2]["outcome"] == "warn" for c, _, _ in results),
            "over_vertex_cap": sum(c[3]["outcome"] == "warn" for c, _, _ in results),
            "flagged": sum(status == "flagged" for _, status, _ in results),
            "eligible": sum(eligible for _, _, eligible in results),
        }
    for place_type, row in out.items():
        print(json.dumps({"place_type_id": place_type, **row}), flush=True)
    totals = {key: sum(row[key] for row in out.values())
              for key in ("boundaries", "invalid", "flagged", "over_vertex_cap", "eligible")}
    print(json.dumps({"total": totals, "vertex_cap": VERTEX_CAP}), flush=True)
    return out


def load(conn, measures: list[dict], batch: int = LOAD_BATCH) -> dict:
    started = time.monotonic()
    reason = eligible_reason()
    checked = 0
    with conn.cursor() as cur:
        for start in range(0, len(measures), batch):
            chunk = measures[start:start + batch]
            cur.execute(CREATE_LOADED)
            with cur.copy(COPY_CHECKS) as copy:
                for m in chunk:
                    checks, _, _ = outcomes(m, thresholds_for(m["place_type_id"]))
                    for c in checks:
                        copy.write_row([m["boundary_id"], c["check_id"], c["check_category"], c["outcome"],
                                        c["measured_value"], c["threshold_used"], json.dumps(c["details"])])
            with cur.copy(COPY_STATUS) as copy:
                for m in chunk:
                    _, status, eligible = outcomes(m, thresholds_for(m["place_type_id"]))
                    copy.write_row([m["boundary_id"], status, eligible, reason if eligible else None])
            cur.execute(KEEP_TODO, {"version": CHECKER_VERSION})
            cur.execute(INSERT_CHECKS, {"version": CHECKER_VERSION})
            cur.execute(UPDATE_STATUS, {"version": CHECKER_VERSION})
            checked += cur.rowcount
            conn.commit()
            print(f"loaded: {min(start + batch, len(measures))} of {len(measures)}; checked {checked}; "
                  f"{(time.monotonic() - started) / 60:.1f} min", flush=True)
    result = {"in_file": len(measures), "checked": checked, "skipped": len(measures) - checked,
              "minutes": round((time.monotonic() - started) / 60, 1)}
    print(json.dumps(result), flush=True)
    return result


def counts(conn) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(COUNTS)
        rows = cur.fetchall()
    conn.rollback()
    for row in rows:
        print(json.dumps(dict(row)), flush=True)
    return rows


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    options = sys.argv[2:]
    if command not in ("measure", "summary", "load", "counts") or not set(options) <= {"--unchecked"} \
            or (options and command not in ("measure", "load")):
        raise SystemExit("usage: check_boundaries.py measure [--unchecked] | summary | load [--unchecked] | counts")
    unchecked = "--unchecked" in options
    if command == "summary":
        summary(read_measures(work_dir()))
        return
    conn = import_wdpa.open_connection()
    try:
        if command == "measure":
            run_measure(conn, work_dir(), unchecked)
        elif command == "load":
            load(conn, read_measures(work_dir(), unchecked))
            counts(conn)
        else:
            counts(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
