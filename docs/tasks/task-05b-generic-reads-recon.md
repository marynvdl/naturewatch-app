# Task 05b — Generic reads and reconciliation

Parcel: [Database Honing](../parcels/database-honing.md)

Repository: naturewatch-app. Start only after task 05a has merged into `develop` (pull request #400) and its follow-up `20261115100000_places_name_storage.sql` (pull request #401, merged 11 November 2026).

## Goal

Add generic `place_*` reads that take a place type, and turn the existing `protected_area*` functions and the `protected_areas` view into thin wrappers over them. Move the importer's writes from `places.geom` to `place_boundaries`. Add a reconciliation report: before writing anything, the importer matches each record on SITE_PID, classifies it as in record 4 of [decisions.md](../database/decisions.md), and refuses to write unless every record matches cleanly.

Decided 11 November 2026 by the user:

- The generic reads keep today's crop parameters and sorts. The crops ids sit in one place, which task 07 replaces with `stat_selections`.
- A clean match is a known SITE_PID whose shape is identical or similar. Every other class is reported and stops the upload. Its writes are deferred.
- The hosted step pushes the reads migration only. The report is tested locally. The first hosted report runs with the next import.

## Facts already stored

From the migrations and the code on 11 November 2026, and task 05a's hosted checks:

- 51,001 published places, each with one current boundary in `place_boundaries`. 186 confirmed `wdpa_site_pid` rows for the 74 multi-parcel sites, each on its own place. 74 `proposed` `wdpa_site_id` rows. `protected_areas` returns 51,001 rows, so its realm and 10 km² filters exclude nothing today.
- `places.geom` is `not null`. Nothing in this repo reads it after task 05, except `import_wdpa.py merge` (validity check) and the importer's writes. The analysis scripts `facts/cropland.py` and `places/protected_areas.py` still read it. Task 07 moves them.
- The frontend (`frontend/naturewatch/src/places/api.ts`) calls `protected_area_window`, `protected_area_rank`, `protected_area_window_count`, `protected_area_filter_stats`, `place_bounds`, and reads `protected_areas` and `facts`. `protected_area_matched` and `protected_areas_in_extent` are called only by other functions. `protected_area_kept_ids` is called by nothing. `facts/cropland.py` reads `protected_areas`.
- The crops ids `cropland-2024-v1` and `area-weighted-spheroid-v1` are written into `protected_area_matched` and `protected_area_filter_stats` (`20261030100000_protected_areas.sql`).
- `protected_areas_in_extent` and `place_bounds` are `security definer`. The others are `security invoker`. All are granted to `anon`, `authenticated`, and `service_role`.
- The importer (`supabase/import_wdpa.py`) matches rows on the confirmed `wdpa_site_pid`, then inserts new places with `geom`, overwrites `places.name` and `places.geom` on known ones, and upserts details and source ids. It writes no boundary. `UPSERT_SITE_IDS` only conflicts with a confirmed row, so it would add a confirmed `wdpa_site_id` beside each `proposed` one. It refuses to start when a stored SITE_PID is missing from the file. The README says not to run `upload` until this task.
- The boundary copy keeps the bytes of `places.geom`, which came from the same `ST_Multi(ST_Force2D(ST_GeomFromWKB(...)))` path as the importer. A rerun of the October 2026 file should therefore find every shape identical.
- The importer holds no stage of the whole file, because the disk cannot hold the geometry a third time (16 GB disk, about 7 GB used after task 05).

## Do this

1. **Migration `supabase/migrations/20261116100000_generic_place_reads.sql`.** Functions and views only. No table, column, or data change.
   - **`place_summaries` view** (`security_invoker`): published places with their current boundary's `area_km2` and box, the boundary's source title and release month and citation, and, left joined, the conservation area details (designation, IUCN category, `iso3` joined with `;`, realm, SITE_ID) and the first SITE_PID. It has `place_type_id`. It does not filter on realm or area.
   - **Generic functions**, each with `p_place_type text` as its first, required parameter, and otherwise the parameters, columns, sorts, limits, and security of the function it replaces: `places_in_extent`, `place_matched`, `place_window`, `place_window_count`, `place_rank`, `place_kept_ids`, `place_filter_stats`. They read `place_summaries` and the current boundary's box. The crops figure comes from one helper, `place_crops_percent` or a view of that name, the only place the two crops ids are written. Columns keep the name `cropland_percent`.
   - **`place_bounds(p_id)`** keeps its name and signature and drops the `conservation_area` condition: any published place.
   - **Wrappers.** `protected_areas` becomes `place_summaries` filtered on `conservation_area`, terrestrial, and at least 10 km², with its current columns, names, and order. Each `protected_area*` function becomes one call of its generic function with `'conservation_area'`, keeping its signature, columns, and grants. A comment on each says task 08 drops it.
   - Revoke from `public` and grant explicitly, as the existing migrations do. `geom` stays ungranted.
   - Check `explain analyze` of `protected_area_window` (default sort, name sort, a search, and an extent) and `protected_area_filter_stats` locally against the fixture, and on the hosted database read-only after the push. They must not be slower than before by more than noise.
2. **Importer.** In `supabase/import_wdpa.py`:
   - **Reconcile.** A new read-only command `reconcile`, which `upload` also runs first. It copies the filtered file in the existing batches into a temp table, compares each record with the stored places, and keeps only a small result row per record. It never holds the whole file's geometry. Classes, from record 4:
     - `unchanged`: known SITE_PID, current boundary byte-identical (`ST_AsBinary`).
     - `reshaped`: known SITE_PID, shape differs, intersection over union on the spheroid at least 0.95. The threshold is a constant in the script (record 7).
     - `very_different`: known SITE_PID, intersection over union below 0.95.
     - `new_in_known_site`: unknown SITE_PID whose SITE_ID is stored.
     - `new`: unknown SITE_PID and SITE_ID.
     - `missing`: a stored SITE_PID not in the file. If its current boundary overlaps `new` or `new_in_known_site` records, those SITE_PIDs are listed as `split_or_join` candidates. Only new records' geometries are kept for this, in a temp table.
     It writes `reconciliation.csv` (SITE_PID, SITE_ID, class, place id, intersection over union, candidates) and `reconciliation.json` (counts per class, release, file checksum) to the work directory, and prints the counts. Temp tables only. Nothing permanent is written.
   - **Refuse.** `upload` writes only when every record is `unchanged` or `reshaped`. Otherwise it prints the counts and the path of the report and stops, before any write. This replaces the current "stored places are not in the file" refusal.
   - **Writes.** For `unchanged`: update the place's name, its details, and `last_seen_release_id` on its source ids. For `reshaped`: also add the next boundary version, `approved`, current, source and release and SITE_PID and Protected Planet URL as in task 05a, and set the old one `is_current = false` with `superseded_at`, in the same transaction. Do not write `places.geom` or insert a place. `wdpa_site_id` rows of any `match_status` only get `last_seen_release_id`. Do not add one.
   - **Check.** `merge` reads the current boundary instead of `places.geom` for validity and area.
3. **Tests.**
   - Extend `supabase/tests/records_fixture.sql` to check that every wrapper returns the same rows, in the same order, as before this migration, for each sort, a search, an extent across the antimeridian, a crop range, and `place_rank` of one place. Check that `place_bounds` and `place_summaries` work for a published place and not for a merged one.
   - Add a reconciliation test against the local database, skipped when it is not running, rolled back: one record of each class, and a check that `upload` refuses without writing when one record is not clean, and writes a new current version for a `reshaped` one.
   - Update `supabase/tests/test_import_wdpa.py` for the changed SQL.
   - Run the local database steps in `supabase/README.md`, the importer tests, the catalog suite, `npm run type-check`, and `npm run lint`. The frontend should need no change. If it does, stop and say why.
4. **Docs.**
   - `supabase/README.md`: replace the "Do not run `upload` until task 05b" warning and describe `reconcile`, its classes, its files, and the refusal. Keep the hosted import section.
   - `docs/blueprint.md`: name the generic reads and say the `protected_area*` names are wrappers until task 08.
   - `docs/database/design.md`: mark the read path and the reconciliation report *in place*.
   - In the parcel, under weakness 1 and weakness 13, say what this task did. Under **I. Deferred**, add: the importer's writes for `very_different`, `new_in_known_site`, `new`, `missing`, and `split_or_join` (draft places, `proposed` boundaries and mappings, flags), with the first release or review that needs them; importing `STATUS`, `STATUS_YR`, `GOV_TYPE`, and `PA_DEF`.
5. **Hosted, after approval.** Open the pull request first. Then wait for approval.
   - `supabase migration list`, then push the migration. It changes no data.
   - Check read-only: `protected_areas` returns 51,001 rows; `place_summaries` filtered on `conservation_area` returns 51,001; `protected_area_window` with the defaults returns the same first 50 ids as before the push (record them before); `explain analyze` as in step 1.
6. Run the `browser-check` skill against the hosted database on `/places`, the map's "In view" list with a size and a cropland filter, and the profile of one South Africa place with a cropland figure, wide and narrow.
7. Archive the task on this branch, as the `task` skill says.

## Do not

- Do not change the frontend. Task 08 moves it to the generic reads.
- Do not add a table or a column, or change a constraint. Do not make `places.geom` nullable.
- Do not write, null, or drop `places.geom`, and do not drop a wrapper or `facts`. Task 08 does that.
- Do not build the writes for the unclean classes, a review queue, or a flag column. Task 06 designs the queue.
- Do not import `DESIG_TYPE` (task 09) or the other missing WDPCA fields.
- Do not touch `stat_selections` or the stats tables (task 07), or the analysis repo.
- Do not run `upload` or `reconcile` against the hosted database, and do not create the Fly import app.
- Do not push the hosted migration before approval, and do not change compute or disk.
- Do not commit a database URL, token, password, or login role.
- Do not start task 06.

## Done when

- The generic reads exist, and every old name is a wrapper that returns what it did before, locally and on the hosted database.
- The importer's `reconcile` writes the report with all six classes and the `split_or_join` candidates, `upload` refuses unless every record is `unchanged` or `reshaped`, and no importer path writes `places.geom` or a confirmed `wdpa_site_id` beside a proposed one.
- The fixture checks, the reconciliation test, the importer tests, the catalog suite, type-check, and lint pass.
- `/places`, the map list with filters, and a profile work on a wide and a narrow screen against the hosted database.
- The README, blueprint, design, and parcel match the code.
- The work is in one pull request into `develop`. Report its address and the required checks. Do not merge it.

## How to work

Branch from `develop`. Do this task only. Get approval before the hosted step. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
