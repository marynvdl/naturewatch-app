# Task 02 — Hygiene

Parcel: [Database Honing](../parcels/database-honing.md)

Repositories: naturewatch-app and naturewatch-analysis. One branch and one pull request in each, linked to each other. Start only after task 01 has merged into `develop` (pull request #385).

## Goal

Drop `pilot_place_map` and its triggers. Add `created_at` and `updated_at` to every table, with a shared `set_updated_at()` trigger. Fix the stale `pilot_places` read in `facts/cropland.py`. Apply the migration to the hosted database after approval.

## Facts already stored

- `pilot_place_map`, `sync_pilot_place_map()`, and the triggers `places_sync_pilot_place_map` and `sources_sync_pilot_place_map` come from `supabase/migrations/20261028120000_pilot_place_map_table.sql`. The app, the FastAPI service, and the analysis scripts do not read the table. Its policy `pilot_place_map_select` goes with the table.
- `supabase/tests/records_fixture.sql` checks that `pilot_place_map` copies and follows South Africa places. `supabase/README.md` and `docs/blueprint.md` say the table stays in the database.
- The tables are `sources`, `places`, `facts`, and `fact_methods`. None has a timestamp. `docs/database/design.md` says every table has `created_at timestamptz not null default now()`, and tables whose rows change also have `updated_at`, set by `set_updated_at()`. All four tables can change, so all four get both.
- `places` grants `select` by column to `anon` and `authenticated` (`20261021120000_records.sql`), so `geom` stays hidden. New columns on `places` need their own column grant.
- `places` has about 51,000 rows. The global load ran on 31 October 2026. The facts and their method were written on 22 October 2026 (`20261022190000_fact_methods.sql`, Batch job `facts-cropland-2024-v1-20261022180517`).
- Adding a column whose default is a constant changes only the catalog. No row is rewritten and no trigger fires. Changing the default afterwards affects only new rows.
- `naturewatch-analysis/facts/cropland.py` reads `from public.pilot_places` in `PILOT_SQL`. That view was renamed to `protected_areas` on 30 October 2026 (`20261030100000_protected_areas.sql`) and now covers every country. `facts/test_facts.py` asserts the old name.
- No GitHub workflow applies migrations. The hosted database changes only when a migration is applied by hand.

## Do this

### naturewatch-app

1. Add one migration, `supabase/migrations/<timestamp>_hygiene.sql`:
   - Drop the triggers `places_sync_pilot_place_map` and `sources_sync_pilot_place_map`, the function `sync_pilot_place_map()`, and the table `pilot_place_map`.
   - Create `public.set_updated_at()`, a trigger function that sets `new.updated_at = now()`. Set its `search_path`. Revoke execute from `public`, `anon`, and `authenticated`.
   - Add `created_at` and `updated_at` (`timestamptz not null`) to `sources`, `places`, `facts`, and `fact_methods`. Add each with a constant default, then set the default to `now()`. The constants are 31 October 2026 for `places`, 22 October 2026 for `facts` and `fact_methods`, and the migration time for `sources`. Say in a comment which date each table uses and why. For `places`, say the date is when the row was loaded or last overwritten.
   - Add a `before update` trigger with `set_updated_at()` on each of the four tables.
   - Grant `select (created_at, updated_at)` on `places` to `anon` and `authenticated`.
2. Update `supabase/tests/records_fixture.sql`. Remove the `pilot_place_map` checks. Check that the table and the sync function are gone, that the four tables have both columns, that an update changes `updated_at` and leaves `created_at`, and that `anon` and `authenticated` cannot execute `set_updated_at()`.
3. Run the local database steps in `supabase/README.md`, including the fixture, and `pytest supabase/tests`.
4. Update `supabase/README.md` and the `pilot_place_map` sentence in `docs/blueprint.md`. Say once where each table's timestamps come from, in `docs/blueprint.md`.
5. In the parcel, mark weaknesses 8, 10, and 11 as fixed by task 02, and update the `facts/cropland.py` row under **Who depends on the schema**.

### naturewatch-analysis

6. In `facts/cropland.py`, read `public.protected_areas` filtered to `iso3 = 'ZAF'`, so a rerun covers the same 941 places as the 22 October run. Update the "returned no rows" message and the assertion in `facts/test_facts.py`. Run that test file.

### Hosted database

7. After both pull requests are open, report the row count of each table, that `pilot_place_map` holds 941 rows that will be dropped, and that no disk or compute change is needed. Confirm point-in-time recovery or a backup. Wait for approval.
8. Apply the migration by the approved method. Check that `pilot_place_map` is gone, that the four tables have the new columns with the expected dates, that the row counts are unchanged, and that `/places` still lists places. Record the date applied in the app pull request.
9. Tick task 02 in the parcel.

## Do not

- Do not update existing rows to set timestamps. Use the constant defaults.
- Do not change `places.geom`, the bbox columns, the views, the read functions, or the facts.
- Do not run the facts pipeline or submit a Batch job. The Stats Pipeline stays paused.
- Do not change the disk or compute size.
- Do not apply the migration to the hosted database before approval.
- Do not commit a database URL, token, password, or login role.
- Do not start task 03.

## Done when

- `pilot_place_map`, its function, and its triggers are gone, locally and on the hosted database.
- The four tables have `created_at` and `updated_at`, kept by `set_updated_at()`, locally and on the hosted database.
- `facts/cropland.py` reads `protected_areas` for South Africa, and its tests pass.
- The fixture and `pytest supabase/tests` pass.
- One pull request into `develop` here and one into `main` in naturewatch-analysis, linked to each other. Report both addresses and the required checks. Do not merge them.

## How to work

Branch from `develop` here and from `main` in naturewatch-analysis. Read `../naturewatch-analysis/CLAUDE.md` before working there. Do this task only. Get approval for the connection method before the first hosted query. Do not commit secrets. Do not add an AI or tool attribution to the commits or the pull requests.
