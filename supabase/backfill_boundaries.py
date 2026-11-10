#!/usr/bin/env python3
"""Copy every WDPCA site's geometry into place_boundaries (Database Honing task 05).

  run     Call backfill_place_boundaries() in committed batches, in place id
          order, until every site has its version 1 boundary. Then build the
          GiST index on place_boundaries.geom. A second start continues after
          the last committed batch.
  verify  Read-only. One current boundary per site, on its kept place, and none
          elsewhere. Single-parcel sites have the same area as places.geom and,
          on a random sample, the same shape. A multi-parcel site's area lies
          between its largest parcel and the sum of its parcels.

Apply 20261113100000_place_boundaries.sql first. Apply
20261113110000_boundaries_readers.sql after verify passes.

The connection is the importer's: DATABASE_URL, or the local database, or with
SUPABASE_ACCESS_TOKEN a short-lived login role on the hosted database.
"""

from __future__ import annotations

import importlib.util
import sys
import time
from pathlib import Path

BATCH_SITES = 500
SAMPLE_SHAPES = 500
RECONNECT_ATTEMPTS = 6

LAST_DONE = """
select place_id as last from public.place_boundaries
where version_number = 1
order by place_id desc
limit 1
"""
COUNTS = """
select
  (select count(*) from public.place_source_ids
   where source_id = 'wdpca' and id_kind = 'wdpa_site_id' and match_status = 'confirmed') as sites,
  (select count(*) from public.place_boundaries where version_number = 1) as boundaries
"""
# The places of one batch whose geometry is not valid, to name them.
INVALID_IN_BATCH = """
with batch as (
  select place_id, source_record_id as site_id
  from public.place_source_ids
  where source_id = 'wdpca' and id_kind = 'wdpa_site_id' and match_status = 'confirmed'
    and (%(after)s::uuid is null or place_id > %(after)s::uuid)
  order by place_id
  limit %(limit)s
)
select batch.site_id, places.id, places.name,
  extensions.st_isvalidreason(places.geom) as reason
from batch
join public.conservation_area_details as details
  on details.source_id = 'wdpca' and details.source_record_id = batch.site_id
join public.places on places.id = details.place_id
where not extensions.st_isvalid(places.geom)
order by batch.site_id, places.id
"""
VERIFY = {
    "sites without exactly one current boundary": """
        select count(*) as n
        from public.place_source_ids as kept
        where kept.source_id = 'wdpca' and kept.id_kind = 'wdpa_site_id'
          and kept.match_status = 'confirmed'
          and (select count(*) from public.place_boundaries as b
               where b.place_id = kept.place_id and b.is_current) <> 1
    """,
    "boundaries on a place that is not its site's kept place": """
        select count(*) as n
        from public.place_boundaries as b
        where not exists (
          select 1 from public.place_source_ids as kept
          where kept.place_id = b.place_id and kept.source_id = 'wdpca'
            and kept.id_kind = 'wdpa_site_id' and kept.match_status = 'confirmed')
    """,
    "current boundaries that are not approved": """
        select count(*) as n
        from public.place_boundaries
        where is_current and review_status <> 'approved'
    """,
    "single-parcel sites whose area differs from places.area_km2": """
        with single as (
          select details.source_record_id as site_id
          from public.conservation_area_details as details
          where details.source_id = 'wdpca'
          group by details.source_record_id
          having count(*) = 1
        )
        select count(*) as n
        from single
        join public.conservation_area_details as details
          on details.source_id = 'wdpca' and details.source_record_id = single.site_id
        join public.places on places.id = details.place_id
        join public.place_boundaries as b on b.place_id = places.id and b.is_current
        where abs(b.area_km2 - places.area_km2) > 1e-9 * places.area_km2
    """,
    "multi-parcel sites whose area is outside the largest parcel and the sum": """
        with parcels as (
          select details.source_record_id as site_id,
            max(places.area_km2) as largest, sum(places.area_km2) as total
          from public.conservation_area_details as details
          join public.places on places.id = details.place_id
          where details.source_id = 'wdpca'
          group by details.source_record_id
          having count(*) > 1
        )
        select count(*) as n
        from parcels
        join public.place_source_ids as kept
          on kept.source_id = 'wdpca' and kept.id_kind = 'wdpa_site_id'
          and kept.match_status = 'confirmed' and kept.source_record_id = parcels.site_id
        join public.place_boundaries as b on b.place_id = kept.place_id and b.is_current
        where b.area_km2 < parcels.largest * (1 - 1e-6)
          or b.area_km2 > parcels.total * (1 + 1e-6)
    """,
    "sampled single-parcel shapes that are not equal": f"""
        with single as (
          select min(details.place_id::text)::uuid as place_id
          from public.conservation_area_details as details
          where details.source_id = 'wdpca'
          group by details.source_record_id
          having count(*) = 1
        ),
        sample as (
          select place_id from single order by random() limit {SAMPLE_SHAPES}
        )
        select count(*) as n
        from sample
        join public.places on places.id = sample.place_id
        join public.place_boundaries as b on b.place_id = places.id and b.is_current
        where not extensions.st_equals(b.geom, places.geom)
    """,
}


def load_importer():
    path = Path(__file__).resolve().parent / "import_wdpa.py"
    spec = importlib.util.spec_from_file_location("import_wdpa", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


importer = load_importer()


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else "run"
    if command == "run":
        run()
    elif command == "verify":
        verify()
    else:
        raise SystemExit(f"unknown command {command!r}: run, verify")


def run() -> None:
    import psycopg

    conn = importer.open_connection()
    totals = conn.execute(COUNTS).fetchone()
    conn.commit()
    sites, done = int(totals["sites"]), int(totals["boundaries"])
    print(f"sites: {sites}, boundaries already copied: {done}", flush=True)
    started = time.monotonic()
    failures = 0
    while True:
        try:
            done_row = conn.execute(LAST_DONE).fetchone()
            after = done_row["last"] if done_row else None
            batch_started = time.monotonic()
            last = conn.execute(
                "select public.backfill_place_boundaries(%s, %s) as last",
                (after, BATCH_SITES),
            ).fetchone()["last"]
            conn.commit()
        except psycopg.errors.CheckViolation as exc:
            conn.rollback()
            name_invalid(conn, after)
            raise SystemExit(
                f"stopped: a boundary was refused ({importer.first_line(exc)}). "
                "Do not repair it here. Report it."
            ) from None
        except psycopg.OperationalError as exc:
            failures += 1
            print(f"connection lost ({importer.first_line(exc)}), attempt {failures}", flush=True)
            if failures >= RECONNECT_ATTEMPTS:
                raise SystemExit("stopped: the connection kept dropping") from None
            try:
                conn.close()
            except Exception:
                pass
            conn = importer.open_connection()
            continue
        failures = 0
        if last is None:
            break
        done = int(conn.execute(COUNTS).fetchone()["boundaries"])
        conn.commit()
        print(
            f"boundaries {done} of {sites}, batch {time.monotonic() - batch_started:.1f} s, "
            f"total {(time.monotonic() - started) / 60:.1f} min",
            flush=True,
        )
    print("copy finished, building place_boundaries_geom_idx", flush=True)
    index_started = time.monotonic()
    conn.execute("set maintenance_work_mem = '1GB'")
    conn.execute(
        "create index if not exists place_boundaries_geom_idx "
        "on public.place_boundaries using gist (geom)"
    )
    conn.execute("analyze public.place_boundaries")
    conn.commit()
    print(f"index built in {(time.monotonic() - index_started) / 60:.1f} min", flush=True)
    size = conn.execute(
        "select pg_size_pretty(pg_database_size(current_database())) as db, "
        "pg_size_pretty(pg_total_relation_size('public.place_boundaries')) as boundaries"
    ).fetchone()
    conn.commit()
    conn.close()
    print(f"database {size['db']}, place_boundaries {size['boundaries']}", flush=True)
    print("done. Run: verify", flush=True)


def name_invalid(conn, after) -> None:
    rows = conn.execute(INVALID_IN_BATCH, {"after": after, "limit": BATCH_SITES}).fetchall()
    conn.rollback()
    for row in rows:
        print(f"invalid: site {row['site_id']} place {row['id']} {row['name']}: {row['reason']}")
    if not rows:
        print("no invalid parcel geometry in the batch: the union of a site was refused")


def verify() -> None:
    conn = importer.open_connection()
    conn.execute("set transaction read only")
    problems = []
    totals = conn.execute(COUNTS).fetchone()
    print(f"sites: {totals['sites']}, version 1 boundaries: {totals['boundaries']}", flush=True)
    for label, sql in VERIFY.items():
        n = int(conn.execute(sql).fetchone()["n"])
        print(f"{label}: {n}", flush=True)
        if n:
            problems.append(label)
    conn.rollback()
    conn.close()
    if problems:
        raise SystemExit("verify failed: " + "; ".join(problems))
    print("verify ok", flush=True)


if __name__ == "__main__":
    main()
