# Task 07 — Stats

Parcel: [Database Honing](../../parcels/database-honing.md)

Repository: both. naturewatch-app holds the migrations and the docs. naturewatch-analysis points the stats script and the places script at the new tables. Start only after task 06 has merged into `develop` (pull request #404).

## Goal

Store Stats as the design says: `stats`, `stat_methods`, `sprouts`, `stat_runs`, `place_stats`, `stat_selections`, and the view `place_stats_preferred`. Backfill the 941 cropland facts as one run on their version 1 boundaries. Move the app's cropland percent and the analysis scripts onto the new tables. The Stats Pipeline stays paused. Nothing is recalculated.

Decided 11 November 2026 by the user:

- **The places PMTiles are not rebuilt in this task.** Task 09 splits recognitions into their own places and their own archive, so the conservation-area archive must be rebuilt then anyway. This task points the places script and recipe at the current boundaries of published places and `place_stats_preferred`, and proves it locally. The hosted rebuild moves to task 09. Until then the 64 merged parcels still draw as their own shapes, and a click on one opens its kept place (task 06).
- **`stat_run_issues` is deferred** to the parcel that resumes Stats. The script still stops on a place it cannot use, and that run is marked `failed`.
- **The analysis folder `facts/` becomes `stats/`.** Facts is kept for historical information (design 7). The secret `naturewatch-facts-database-url` keeps its name.
- **A `sources` row for GLAD annual cropland** gives the sprout its provenance.

## Facts already stored

Read-only, hosted, 11 November 2026:

- `facts` holds 941 rows, all with sprout `cropland-2024-v1` and method `area-weighted-spheroid-v1`, `created_at` 22 October 2026. Every one is on a published place whose current boundary is version 1. None is on one of the 74 multi-parcel sites.
- `fact_methods` holds one row, `area-weighted-spheroid-v1`. `facts.method_id` references it.
- `sources` holds one row, `wdpca`. `source_releases` holds one.
- The run was Batch job `facts-cropland-2024-v1-20261022180517`, submitted 22 October 2026 at 18:05:17 UTC. The task, with one preempted attempt, ran 872 seconds (`facts/README.md` in naturewatch-analysis). It read `protected_areas` for `iso3 = 'ZAF'`. The last commit to `facts/` before it was `dce311d`.
- The sprout's STAC collection is `gs://nature-watch-bucket/sprouts/cropland/2024/v1/collection.json`. The recipe is `cookbook/recipes/cropland-2024.yaml`: GLAD annual cropland, https://glad.umd.edu/dataset/annual-croplands, Khan et al. 2026, https://doi.org/10.1016/j.rse.2026.115438.

From the code:

- `place_crops_percent` (`20261116100000_generic_place_reads.sql`) is the only SQL that names the crops sprout and method. `place_matched`, `place_window`, `place_rank`, and `place_filter_stats` read it, and the old `protected_area_*` names wrap those.
- The frontend reads `facts` directly in `loadPilotPlace` (`frontend/naturewatch/src/places/api.ts`). That moves in task 08, which drops `facts`.
- `facts/cropland.py` reads `places.geom`, and upserts `fact_methods` and `facts`. `places/protected_areas.py` reads `places.geom` of every place, with no publication filter, and `facts.percent`. Task 08 drops `places.geom`, so both must move first.
- `places.previous.pmtiles` in `places/protected-areas/v1/` is still the 3.4 MiB South Africa build of 29 October. `submit --replace` refuses to overwrite it. Task 09 decides that.

## Do this

### naturewatch-app

1. **Migration `supabase/migrations/20261118100000_stats.sql`.** Schema, as design 4.4 and 6.
   - Rename `fact_methods` to `stat_methods`. `facts.method_id` follows the rename.
   - `stats`: `id`, `title`, `unit` (CHECK in `km2`, `percent`, `ratio`, `count`), `denominator_stat_id`, `description`, timestamps.
   - `sprouts`: `id`, `title`, `period_start`, `period_end`, `stac_href`, `source_id`, `source_release_id` (composite FK as on `place_boundaries`), timestamps.
   - `stat_runs`: as design, with `retracted_reason` required when `retracted`, and `finished_at` required unless `running`. Unique `(id, sprout_id, stat_method_id)`.
   - `place_stats`: as design, with the composite FK to `stat_runs`, the unique key, and the index. `service_role` gets `select` and `insert` only, so rows are never updated or deleted.
   - `stat_selections`: `stat_id`, `period_start` (PK), `sprout_id`, `stat_method_id`, `selected_at`. `selected_by` comes with `profiles` in task 10.
   - `place_stats_preferred`: the view in design 4.4, `security_invoker`.
   - RLS on every table, `revoke all` from `public`, `anon`, `authenticated`, then public `select` as in design 6. Writes are `service_role` only.
   - Replace `place_crops_percent` so it reads `place_stats_preferred` where `stat_id = 'crops_percent'`, same columns. No sprout or method id is left in SQL.
   - Insert the `sources` row `glad-annual-cropland`: `dataset`, title "GLAD annual cropland", publisher, URL, DOI, and citation from the recipe, licence null.
2. **Migration `supabase/migrations/20261118110000_stats_backfill.sql`.** Data, one transaction.
   - `stats`: `crops_area` (km2, "Cropland area"), `crops_percent` (percent, of the valid area), `valid_coverage` (ratio, valid area over the boundary's area). `denominator_stat_id` stays null: there is no `valid_area` stat, and design 4.4's example changes to say so.
   - `sprouts`: `cropland-2024-v1`, period 2024-01-01 to 2024-12-31, the STAC collection's https URL, source `glad-annual-cropland`, no release.
   - One `stat_runs` row: the Batch job id, `succeeded`, `boundary_count` 941, `code_version` `dce311d`, `selection` `{"place_type": "conservation_area", "iso3": "ZAF", "list": "protected_areas"}`, `started_at` 2026-10-22 18:05:17 UTC, `finished_at` 872 seconds later. A comment says where each value comes from.
   - 2,823 `place_stats` rows: three per fact, on the place's current boundary, `period` 2024, `calculated_at` = the run's `finished_at`.
   - Three `stat_selections` rows for 2024, on `cropland-2024-v1` and `area-weighted-spheroid-v1`.
   - It fails and changes nothing unless: there are 941 facts on one sprout and method, each fact's place has a current version 1 boundary, 2,823 rows were written, and every `place_stats_preferred` value equals its `facts` value exactly.
3. **Tests.** Extend `supabase/tests/records_fixture.sql`: the backfill's checks on fixture facts; `place_stats_preferred` drops a value after a new current boundary, ignores a `retracted` run and an unselected sprout, and picks the latest `calculated_at`; `place_crops_percent` returns the same percent as before; `service_role` cannot update a `place_stats` row; `anon` can read the stats tables and cannot write to them. Run the local database steps in `supabase/README.md`, the importer tests, the catalog suite, `npm run type-check`, and `npm run lint`.
4. **Docs.**
   - `docs/database/design.md` 4.4: mark the stats tables and view *in place*, with the migrations. `stat_run_issues` and `selected_by` deferred. The denominator example. 6: `place_crops_percent` reads `place_stats_preferred`.
   - `docs/blueprint.md`: the stats tables where it lists tables.
   - The parcel: rewrite task 07's goal. In **G. Backfill rules**, mark Stats done. In **I. Deferred**, add `stat_run_issues` with the parcel that resumes Stats. Add to task 09's goal: rebuild the places PMTiles from current boundaries of published places, so the merged parcels draw as their kept places, and decide the stale v1 rollback copy.
5. **Hosted, after approval.** Open both pull requests first, then wait.
   - Before: `select count(*) from facts`, and the first 50 ids and percents of `protected_area_window` sorted by cropland.
   - `supabase migration list`, then push both migrations.
   - Check read-only: 2,823 `place_stats`, one `succeeded` run, 2,823 rows in `place_stats_preferred`, the same 50 ids and percents as before.
6. Run the `browser-check` skill against the hosted database on `/places` sorted by cropland and the profile of one South Africa place with cropland, wide and narrow.

### naturewatch-analysis

Branch from `main`. One pull request into `main`, linked from and to the app pull request.

7. **`git mv facts/ stats/`.** `stats/cropland.py`:
   - Reads the current boundary of each published conservation area in `listed_places` with `iso3 = 'ZAF'`, from `place_boundaries`, with its `boundary_id`.
   - Refuses unless the `sprouts` row for the recipe's sprout id exists, and the `stat_methods` row exists with the script's summary. It no longer writes either.
   - Inserts a `running` `stat_runs` row with the selection, the Batch job id, and the git commit, and commits it. Writes three `place_stats` rows per place and sets the run `succeeded` in one transaction. On an error it sets the run `failed` with `finished_at`.
   - The scratch prefix becomes `scratch/stats/cropland-2024/`. The secret name stays.
   - The tests in `stats/test_cropland.py` cover the new writes against the SQL text, as today.
8. **`places/protected_areas.py` and `cookbook/recipes/places-protected-areas.yaml`.** The recipe's source becomes the current boundaries of published places of type `conservation_area`. The `facts:` block becomes `stats: { cropland_percent: crops_percent }`, read from `place_stats_preferred`. The `cropland_percent` property and the archive path stay. Update `cookbook/test_recipe.py` and `places/test_places.py`. Run `prove --bbox` against the local Supabase stack loaded with `records_fixture.sql`, not the hosted database.
9. **Docs.** `docs/pipelines.md`, `stats/README.md` (the stored rows are now `place_stats`, and the hosted 22 October run is kept as history), `places/README.md`, `sprout/README.md`, `README.md`, and `CLAUDE.md` where they name `facts/`.

10. Archive the task on the app branch, as the `task` skill says.

## Do not

- Do not rebuild or publish the places PMTiles, submit a Batch job, or run either script against the hosted database.
- Do not add `stat_run_issues`, `stats_eligible_boundaries`, eligibility columns, or `selected_by`.
- Do not drop or change `facts`, change the frontend, or drop the wrappers (task 08).
- Do not register sprouts other than `cropland-2024-v1`.
- Do not push the migrations before approval, and do not change compute or disk.
- Do not commit a database URL, a token, or a password.
- Do not start task 08.

## Done when

- The hosted database holds the stats tables, 2,823 `place_stats` rows from one succeeded run, and three selections. `place_crops_percent` reads `place_stats_preferred`, and the list's cropland figures are unchanged.
- The stats script and the places script read no `places.geom` and no `facts`, and their tests pass. The places prove ran locally.
- The fixture checks, the importer tests, the catalog suite, type-check, and lint pass. The browser check shows `/places` and a profile working, wide and narrow.
- The design, blueprint, parcel, and analysis docs match the code.
- One pull request in each repo, linked from each other. Report both addresses and their required checks. Do not merge.

## How to work

Branch from `develop` here and from `main` in naturewatch-analysis. Do this task only. Get approval before the hosted step. Do not commit secrets. Do not add an AI or tool attribution to a commit or pull request.
