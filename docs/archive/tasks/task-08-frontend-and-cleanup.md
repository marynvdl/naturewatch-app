# Task 08 — Frontend and cleanup

Parcel: [Database Honing](../../parcels/database-honing.md)

Repository: naturewatch-app. Start only after task 07 has merged into `develop` (pull request #406, merged 12 November 2026).

## Goal

Move the frontend to the generic `place_*` reads and `place_stats_preferred`. Then drop what only the old frontend and the task 05–07 backfills needed: the `protected_area*` wrappers, `facts`, the one-off backfill functions, and `places.geom` with the columns, trigger, and index that hang on it. Reclaim the disk `places.geom` held.

Decided 12 November 2026 by the user:

- **The hosted drop runs after the pull request merges.** The develop Fly app `naturewatch` calls the wrappers until the new frontend deploys. So the pull request merges first, once its checks pass and the user approves, and the migration is pushed after the `naturewatch` deploy is live. The task is archived on the branch before the merge, as the `task` skill says. The hosted step is reported afterwards.
- **A profile opens any published place.** `/places/:id` reads `place_summaries`, the rule `place_bounds` has used since task 05b. The list, the map filter, and the filter charts keep reading `listed_places` through the generic functions.

## Facts already stored

From the code and the migrations on 12 November 2026:

- The frontend reads the database only in `frontend/naturewatch/src/places/api.ts`. It calls `protected_area_window`, `protected_area_rank`, `protected_area_window_count`, `protected_area_filter_stats`, `place_bounds`, and `place_merged_into`. It reads the `protected_areas` view for a profile and for the release month, and `facts` for a profile's cropland, filtered on `CROPLAND_SPROUT_ID` and `CROPLAND_METHOD_ID` from `places/display.ts`. Nothing else uses those two constants.
- Each generic function takes `p_place_type text` first, and otherwise the parameters and columns of its wrapper (`20261116100000_generic_place_reads.sql`). `place_window`, `place_window_count`, `place_rank`, and `place_filter_stats` read `listed_places`. Columns keep the name `cropland_percent`. `place_summaries` has `id`, `name`, `designation`, `iso3`, `area_km2`, `site_id`, `release_month`, `source_name`, and `citation`, the profile's columns.
- `place_stats_preferred` has `place_id`, `stat_id`, `period_start`, and `value`. The profile's two figures are `crops_area` and `crops_percent` for period 2024 (`20261118100000_stats.sql`).
- The production app `naturewatch-demo` is built without `VITE_SUPABASE_URL` (`.github/workflows/fly.yml`), so it reads no place store. Only the develop app `naturewatch` reads the hosted database.
- naturewatch-analysis `main` (`79277a2`) reads no `places.geom`, `facts`, or `protected_areas`. `stats/cropland.py` reads `listed_places`. The places script reads current boundaries and `place_stats_preferred`.
- In this repo, these still read what this task drops:
  - Wrappers (`20261116100000_generic_place_reads.sql`): the view `protected_areas` and the functions `protected_areas_in_extent`, `protected_area_matched`, `protected_area_window`, `protected_area_window_count`, `protected_area_rank`, `protected_area_kept_ids`, `protected_area_filter_stats`. `supabase/tests/reads_before_05b.sql` checks them and says to remove it with them.
  - One-off functions, each commented "dropped in task 08": `backfill_place_boundaries(uuid, integer)` (task 05), `merge_wdpa_site_parcels()` (task 05, reads `facts`), `unmerge_wdpa_site_parcels()` (task 05a, reads `places.geom` and `places.area_km2`), `backfill_place_stats_from_facts()` (task 07).
  - `supabase/backfill_boundaries.py`, the task 05 runner, reads `places.geom`.
  - `supabase/import_wdpa.py check` counts `facts`.
  - `supabase/tests/records_fixture.sql` inserts places with `geom` and tests the wrappers, `facts`, and the one-off functions.
- On `places`, `geom` carries the generated `area_km2`, the four `bbox_*` columns filled by the trigger `places_set_bbox` (function `places_set_bbox()`), and the GiST index `places_geom_idx`. Since task 05 every reader uses the current boundary's area and box instead.
- `places` was 3,482 MB on 10 November 2026, nearly all of it `geom`. The disk is 16 GB since task 05.
- `alter table … drop column` only hides the column. `vacuum full` rewrites the table without the dropped column's values, so nulling `geom` in batches first, as **G. Strategy** step 5 says, is not needed. `vacuum full` cannot run inside a transaction, so it is not part of a migration.

## Do this

1. **Frontend.** In `frontend/naturewatch/src/places/api.ts`:
   - The list, rank, count, and filter charts call `place_window`, `place_rank`, `place_window_count`, and `place_filter_stats` with `p_place_type: 'conservation_area'`, a constant beside the tile constants. Same arguments and results otherwise.
   - `loadPilotPlace` reads `place_summaries` for the place, and for the kept place after `place_merged_into`. Its cropland comes from `place_stats_preferred`: `crops_area` and `crops_percent` for `period_start` 2024-01-01, in one query. `croplandKm2` and `percent` stay null when a row is missing.
   - `loadPlaceRelease` reads `place_summaries` filtered on `conservation_area`.
   - Remove `CROPLAND_SPROUT_ID` and `CROPLAND_METHOD_ID` from `places/display.ts`. Fix the doc comments that name `protected_areas` or facts.
   - Update `places/__tests__/api.spec.ts` for the new names, including a profile with and without cropland rows.
2. **Migration `supabase/migrations/20261119100000_drop_old_reads.sql`.** One transaction. It fails and changes nothing unless the checks at its start hold: `place_stats` has a `crops_percent` row for every place with a `facts` row, with the same value.
   - Drop the wrapper view and the seven wrapper functions.
   - Drop the four one-off functions.
   - Drop `facts`.
   - Drop the trigger `places_set_bbox` and its function, the index `places_geom_idx`, the columns `area_km2`, `bbox_west`, `bbox_south`, `bbox_east`, `bbox_north`, and `geom` on `places`.
   - Leave `place_crops_percent`, the generic reads, `place_merged_into`, and `merge_wdpa_site`. A comment says `vacuum full public.places` runs by hand after the push.
3. **Scripts and tests.**
   - Delete `supabase/backfill_boundaries.py` and `supabase/tests/reads_before_05b.sql`, and remove the README steps that name them.
   - `import_wdpa.py check` prints the `place_stats` count instead of `facts`. Update `supabase/tests/test_import_wdpa.py`.
   - `records_fixture.sql` inserts each place and its boundary without `places.geom`, and drops the wrapper, `facts`, and one-off function checks. The checks of the generic reads, `place_bounds`, `place_merged_into`, and `place_stats_preferred` stay. Add one: `places` has no `geom` column.
   - Run the local database steps in `supabase/README.md`, the importer tests, the reconciliation test, the catalog suite, `npm run type-check`, `npm run lint`, and the frontend unit tests for `places/`.
4. **Local browser check.** With the local stack loaded with the fixture and the migration applied, run the `browser-check` skill on `/places`, the map's "In view" list with a size and a cropland filter, and a profile with cropland, wide and narrow.
5. **Docs.**
   - `docs/blueprint.md`: the frontend reads the generic functions, `place_summaries`, and `place_stats_preferred`. Remove `facts` and the wrappers from the table list.
   - `docs/database/design.md`: the read path and the stats in section 6 have no wrappers. `places` has no geometry. The contract step is *done*.
   - `supabase/README.md`: remove `facts` and the wrappers.
   - The parcel: in **G. Strategy** step 5, say the column was dropped and `vacuum full` reclaimed the space, without nulling it in batches first, and why. In **G. Compatibility**, the frontend moved in task 08. Mark the weaknesses this closes.
6. **Pull request and merge.** Open the pull request into `develop`, with the hosted plan below in its description. Archive the task on the branch, as the `task` skill says. Merge only when its checks pass and the user approves. Then wait for the `naturewatch` deploy.
7. **Hosted, after approval, after the deploy.**
   - Before: `select count(*) from facts`, `pg_total_relation_size('public.places')`, `pg_database_size(current_database())`, and the first 50 ids and percents of `place_window('conservation_area', …)` sorted by cropland. Confirm on the dashboard that a backup newer than task 07's push exists.
   - `supabase migration list`, then push the migration.
   - `vacuum full public.places` in one session, by hand. Then `vacuum analyze public.places`.
   - Check read-only: the wrappers and `facts` are gone, `places` has no `geom`, the same 50 ids and percents as before, `place_stats_preferred` still has 2,823 rows, and the sizes after.
   - Run the `browser-check` skill against the deployed `naturewatch` app on `/places` sorted by cropland, the map list with filters, and a South Africa profile with cropland, wide and narrow.
   - Report the sizes. Whether to shrink the disk is the user's decision, not part of this task.

## Do not

- Do not change the tiles, the catalog, the PMTiles, or naturewatch-analysis.
- Do not drop `place_crops_percent`, `place_merged_into`, `merge_wdpa_site`, `listed_places`, or a generic read.
- Do not rename the frontend functions (`loadPilotPlace…`) or change what a person sees, beyond a profile now opening for a published place outside the list.
- Do not add `stat_run_issues`, eligibility, recognitions, profiles, or images.
- Do not push the migration or run `vacuum full` before the pull request has merged, the deploy is live, and the user has approved. Do not change compute or disk.
- Do not commit a database URL, a token, or a password.
- Do not start task 09.

## Done when

- The frontend calls no `protected_area*` name and reads no `facts`. Its tests, the catalog suite, type-check, and lint pass. The local browser check shows `/places`, the map list with filters, and a profile working, wide and narrow.
- The migration drops the wrappers, `facts`, the one-off functions, and `places.geom` with its columns, trigger, and index. The fixture checks, the importer tests, and the reconciliation test pass.
- No file in this repo reads what was dropped, except migrations and archived docs.
- The blueprint, design, README, and parcel match the code.
- One pull request into `develop`, merged after its checks pass and the user approves.
- After the merge: the hosted database has the migration, `places` is rewritten and small, the list's cropland figures are unchanged, and the deployed app passes the browser check. The sizes before and after are reported.

## How to work

Branch from `develop`. Do this task only. Get approval before the merge and again before the hosted step. Do not commit secrets. Do not add an AI or tool attribution to a commit or the pull request.
