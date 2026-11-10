# Task 01 — Verify

Parcel: [Database Honing](../../parcels/database-honing.md)

Repository: naturewatch-app. Start only after the Database Honing planning documents have merged into `develop` (pull request #382, merged 10 November 2026).

## Goal

Run the read-only queries in the parcel's **To verify** section against the hosted database. Record the results in the parcel. Write the decision record on whether a Place is a WDPCA site or a parcel.

## Facts already stored

- `places.source_id` is `SITE_PID` and `places.site_id` is `SITE_ID` (`supabase/migrations/20261021120000_records.sql`). Only terrestrial parcels with calculated `area_km2` of at least 10 are stored, so a site's smaller parcels are not in the database.
- The 941 South Africa cropland facts were written on 22 October 2026 by Batch job `facts-cropland-2024-v1-20261022180517` (`naturewatch-analysis/facts/README.md`). The global load ran on 31 October 2026 and its upsert overwrote `geom` for places that already existed (`supabase/import_wdpa.py`).
- The facts run stored no place area. It stored `area_km2`, `percent = 100 × area_km2 / valid km²`, and `valid_coverage = valid km² / places.area_km2`, at full precision. So, where `percent` and `valid_coverage` are both above 0, the place area at the time of the run is `100 × area_km2 / (percent × valid_coverage)`.
- `places.id` is a UUID. Batches page by id with keyset pagination (`where id > $last order by id limit $n`), not `id between`.
- The decision is open in record 4 of [decisions.md](../../database/decisions.md). Its leaning is that a Place is the whole site.

## Do this

Run every query read-only: in a read-only transaction or as a read-only role, with a `statement_timeout`. Do not change the compute size for this task.

1. **Multi-parcel sites.** Count the sites with more than one stored parcel, the places in them, the largest parcel count for one site, and how many of those sites keep one name across their parcels. List the ten sites with the most parcels.
2. **South Africa geometry.** For each fact with `percent > 0` and `valid_coverage > 0`, compare the reconstructed place area with today's `places.area_km2`. Report how many agree within a relative difference of 1e-9, how many differ, and the largest difference. Report how many facts could not be checked because `percent` or `valid_coverage` is 0. The check passes if every checkable fact agrees. Say in the parcel that equal areas show the boundary is unchanged but do not prove it.
3. **Shape statistics.** Run the components, holes, and vertices query in batches of at most 1,000 places. Record the distribution of each (median, 90th, 99th percentile, maximum) and the 20 places with the most components and the most vertices. Keep the full per-place output out of the repo.
4. **Recognitions.** Run the designation count. Record the designations that are international or regional, with their counts.
5. **Disk.** Record the disk size and free space from the Supabase dashboard, and `pg_database_size` and `pg_total_relation_size('public.places')` from the database. Propose the size to grow to before task 05, with the reason.
6. Write the results under **To verify** in the parcel. Mark each settled statement as verified, with the date and the query. Where a result changes a statement elsewhere in the parcel or in `design.md`, correct that statement.
7. Add a decision record to [decisions.md](../../database/decisions.md): a Place is a WDPCA site or a parcel. Use the counts from step 1 and the effect on the 10 km² rule. The user chooses. Update the **Open** paragraph of record 4 to point at the new record.
8. Tick task 01 in the parcel.

## Do not

- Do not write to the hosted database. No migration, insert, update, delete, `create`, `analyze`, or `vacuum`.
- Do not grow the disk or change the compute size. Task 05 grows the disk.
- Do not download the WDPCA source file.
- Do not commit a database URL, token, password, or login role.
- Do not commit the per-place shape output.
- Do not start task 02.

## Done when

- Every item under **To verify** in the parcel has a result, a date, and the query that produced it.
- The South Africa geometry check has passed or failed, and the parcel's Stats backfill rule says which applies.
- The site-or-parcel decision record is written, with the user's choice, and record 4 points to it.
- No database, migration, or production change was made.
- The work is on a branch from `develop`, in one pull request into `develop`. Report the pull request address. Do not merge it.

## How to work

Branch from `develop`. Do this task only. Get approval for the connection method before the first query. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
