# Parcel: Database Honing

A planning parcel. It reviews the Supabase schema and proposes how to improve it in small, safe stages. This parcel changes no database, migration, or production data.

The proposed design is [docs/database/design.md](../database/design.md). The decisions and their alternatives are [docs/database/decisions.md](../database/decisions.md). Both stay after this parcel is archived. This file holds what belongs to the parcel: the assessment, the migration, the impact on other parts, what is deferred, and the task list.

*Written 9 November 2026.*

## Goal

Improve the existing database rather than rebuild it. Keep what works. Give Places a stable identity independent of their boundary. Make every Stat traceable to a boundary version, a sprout, a method, and a run. Add shared provenance, boundary quality control, and room for recognitions, images, and contributors.

The Stats Pipeline is paused until the stages below have landed. A later parcel finds the most efficient way to calculate stats. Analysis task-06 and app task-08 of [Cropland 2024 global](cropland-2024-global.md) wait for it.

## A. Current state

This is a snapshot from 9 November 2026. It reads the migrations in `supabase/migrations/`, the importer, the frontend, and the analysis repo. No database was queried. Statements marked **To verify** are assumptions.

### Tables

| Table | What it holds | Rows |
| --- | --- | --- |
| `sources` | One dataset release: name, release month, download URL, checksum. One row, WDPCA October 2026. | 1 |
| `places` | Identity, boundary (`geom`, MultiPolygon 4326), WDPCA attributes, type enum, generated `area_km2`, bbox columns | 51,001 (README, 31 Oct) |
| `facts` | One row per place, sprout, method: `area_km2`, `percent`, `valid_coverage` | 941 (South Africa, sprout `cropland-2024-v1`) |
| `fact_methods` | Text id and a summary of the formula | 1 |
| `pilot_place_map` | Copy of the South Africa boundaries, kept in step by triggers | 941 |

Views and functions: the view `protected_areas` (terrestrial, at least 10 km²), and the functions `protected_areas_in_extent`, `protected_area_matched`, `protected_area_window`, `protected_area_window_count`, `protected_area_rank`, `protected_area_kept_ids`, `protected_area_filter_stats`, `place_bounds`, `places_set_bbox` (trigger), `sync_pilot_place_map` (trigger).

### What works and should be kept

- `area_km2` is a generated column on the WGS84 spheroid. It cannot drift from the geometry (`20261021120000_records.sql`).
- The bbox columns and their trigger make the "In view" list fast without reading geometry (`20261106110000_place_bbox_columns.sql`).
- `geom` is not granted to `anon` or `authenticated`. Public reads return attributes only.
- Row-level security is on for every table. Writes are `service_role` only.
- Migrations revoke default privileges and grant explicitly.
- The importer validates before upload, copies in committed batches, and keeps ids on a rerun (`supabase/import_wdpa.py`).
- `fact_methods` names the formula. Facts record which sprout they read.

### Weaknesses (verified)

1. **Identity is tied to one release.** `places` is unique on `(source_release_id, source_id)`. A November WDPCA release would get a new `sources` row, so every place would get a new id. PMTiles ids and facts would break.
2. **Identity and boundary are one row.** A corrected boundary can only overwrite the old one. There is no history.
3. **Facts are not reproducible.** `facts` has no boundary reference, no run, no timestamp. The upsert in `naturewatch-analysis/facts/cropland.py` overwrites on `(place_id, sprout_id, method_id)`. `sprout_id` is free text with no foreign key.
4. **The crops ids are hard-coded** in the SQL functions (`20261030100000_protected_areas.sql`), in `frontend/naturewatch/src/places/display.ts:4`, and in `cookbook/recipes/places-protected-areas.yaml` in the analysis repo.
5. **`place_type` is an enum** (`wild_space`, `protected_area`, `ecoregion`, `country`, `river_catchment`). It does not match the planned hierarchy. Enum values cannot easily be removed.
6. **`sources` is a release, not a source.** There is no dataset, licence, citation, or publication level.
7. **WDPCA attributes are missing.** `DESIG_TYPE`, `STATUS`, `STATUS_YR`, `GOV_TYPE`, and `PA_DEF` are not imported. World Heritage Sites, Ramsar sites, and other international designations can only be found by their `designation` text.
8. **No timestamps** on any table.
9. **No auth, profiles, roles, or audit.**
10. **`pilot_place_map` is dead weight.** The app stopped reading it. Its trigger still fires on every `places` insert or update.
11. **A stale read in the analysis repo.** `facts/cropland.py` selects `from public.pilot_places`, which was renamed to `protected_areas` on 30 October. The next run would fail.
12. **Default grants.** Postgres grants `execute` on every new function to `public`, and Supabase's default privileges grant new tables and functions in `public` to `anon` and `authenticated`. The existing migrations revoke correctly. Every new migration must do the same.
13. **The importer's upsert overwrites geometry.** `on conflict … do update set … geom = excluded.geom`.

### Who depends on the schema

| Reader or writer | Uses |
| --- | --- |
| Frontend `places/api.ts` | `protected_areas` view, `facts` table, RPCs `protected_area_window`, `protected_area_rank`, `protected_area_filter_stats`, `place_bounds` |
| `supabase/import_wdpa.py` | Writes `places` with `geom`. Reads `sources`. |
| Analysis `facts/cropland.py` | Reads `pilot_places` (stale) and `places.geom`. Writes `facts`, `fact_methods`. |
| Analysis `places/protected_areas.py` | Reads `places.geom` and `facts`. Writes PMTiles features with `id` = `places.id`. |
| FastAPI service | Does not read these tables. |

### To verify

Run these as read-only queries, with approval, before stage 4. They settle the assumptions the design rests on.

- **SITE_ID and SITE_PID.** Confirmed from the current WDPCA manual on 10 November 2026. `SITE_ID` identifies the protected area or OECM as a whole and stays stable for that site. It was `WDPAID`. `SITE_PID` identifies one parcel, a separate part of a site. It was `WDPA_PID`. Today each stored place is one parcel. Still to count: how many sites have several stored parcels.

  ```sql
  select count(*) from (
    select site_id from places group by site_id having count(*) > 1
  ) as multi;
  ```

- **South Africa geometry.** The 941 cropland facts were calculated on 22 October. The global load ran on 31 October. Check that the South Africa geometries did not change in between, by comparing `area_km2` with the place areas recorded in the facts run. If they differ, the v1 facts belong to a boundary we no longer have.
- **Shape statistics.** Component count, hole count, and vertex count per place, to set the first QC thresholds. Run in batches by id range:

  ```sql
  select id, name, iso3,
    st_numgeometries(geom) as components,
    (select sum(st_numinteriorrings(d.geom)) from st_dump(geom) as d) as holes,
    st_npoints(geom) as vertices
  from places
  where id between $1 and $2;
  ```

- **Recognitions.** Which designations are international or regional:

  ```sql
  select designation, count(*) from places group by designation order by 2 desc;
  ```

  Expect World Heritage, Ramsar, UNESCO Biosphere Reserve, and regional sets such as Natura 2000 and the Emerald Network.
- **Disk.** Maryn confirmed on 10 November 2026 that the Supabase disk can be grown for the geometry copy. Before task 05, record the disk size, the free space, and the size to grow to.

## G. Migration

### Dependency analysis

Two ways were considered to split boundaries from places. One renames `places` to `place_boundaries` and builds a new light `places`. The other keeps `places` and copies geometry into a new table. This table shows what depends on `public.places` and how a rename would affect it.

| Dependency | Bound by | If `places` were renamed to `place_boundaries` |
| --- | --- | --- |
| `facts.place_id` foreign key | Table OID | Silently points at boundaries. Must be re-pointed. |
| `pilot_place_map.id` foreign key and sync triggers | OID | Follow to boundaries. Dropped anyway. |
| `protected_areas` view | OID, fixed when the view was created | Silently becomes a view over boundaries |
| SQL and PL/pgSQL functions | Name, resolved when called | Resolve to the new `places`. Half the read path follows the old table, half the new, with no error. |
| `places_set_bbox` trigger, generated `area_km2`, GiST index | OID | Stay on boundaries, which is wanted, but keep `places_*` names |
| Policy `places_select`, column grants | OID | Boundaries inherit public select. Must be revoked by hand. |
| `import_wdpa.py`, `facts/cropland.py`, `places/protected_areas.py` | Name | Hit the new `places`, which has no geometry, and fail |
| PMTiles feature `id` | The value of `places.id` | Kept only if the new `places` reuses the same UUIDs. Then boundary ids and place ids are equal, and bugs that mix them up stay hidden. |
| Frontend | Views and RPCs | Indirect, through the rows above |

### Strategy

**Keep `places` as the Place table.** Same table, same ids, same foreign keys, same policies, same PMTiles ids. Copy geometry into a new `place_boundaries` table with new ids. Only readers of `places.geom` change: the importer, the two analysis scripts, and the functions that read geometry.

The cost is disk. The copy needs about 3.5 GB more while it runs. Grow the disk before the copy. Growing it for this copy is agreed.

Work in expand and contract steps:

1. **Expand.** Add new tables and columns. Nothing reads them yet.
2. **Backfill.** Fill them in batches, in committed transactions, on Large compute. Never one long transaction.
3. **Verify.** Row counts match. `st_equals` on a sample. Every place has exactly one current boundary.
4. **Switch readers.** Functions and pipelines read the new tables. Temporary wrappers keep the old function names.
5. **Contract.** Only after the frontend has moved: set `places.geom` to null in batches, drop the column, then `vacuum full places` in a short window. The table is small by then.

Each stage is its own migration and pull request. Take a backup or check point-in-time recovery first. Before the contract step, a stage can be reversed by a script that drops the new objects. After it, by restoring the backup.

### Backfill rules

- **Boundaries.** One version 1 boundary per place, `review_status = 'approved'`, `is_current = true`, source WDPCA October 2026, `source_record_id` = SITE_PID.
- **Source ids.** One confirmed `wdpa_site_pid` and one `wdpa_site_id` row per place, first and last seen in October 2026.
- **Details.** `designation`, `iucn_category`, `iso3`, and `realm` move to `conservation_area_details`. The missing WDPCA fields stay null until the next import.
- **Types.** Every current place becomes type `conservation_area`, `publication_status = 'published'`.
- **Stats.** Each `facts` row becomes three `place_stats` rows (`crops_area`, `crops_percent`, `valid_coverage`). They belong to one run for Batch job `facts-cropland-2024-v1-20261022180517` on 22 October 2026, against the version 1 boundary. This holds only if the South Africa geometry check passes. If it fails, the rows are kept and the run is marked `retracted` with the reason. Then add a `stat_selections` row for crops 2024.
- **QC.** Run the four starting checks in batches. Boundaries that pass become `eligible`. Flagged ones, such as the Canadian record with over a hundred small parts, stay published, with `qc_status = 'flagged'` and `stats_eligibility = 'pending'`, until reviewed.
- **Timestamps.** Use the known dates: 31 October 2026 for the global import, 22 October 2026 for the facts run. Otherwise use the migration time, and say so in the migration.

### Compatibility

- **Frontend.** It keeps working through the existing function names, wrapped over the new tables, until stage 8 moves it to the generic reads. The wrappers are then dropped. The database is not shaped around the current frontend.
- **PMTiles.** Feature ids are `places.id` and do not change. The places recipe reads the current boundary instead of `places.geom`. A merged place resolves through `merged_into_place_id`.
- **Stats Pipeline.** Paused throughout. It resumes against `stats_eligible_boundaries` and the new stats tables.

## H. Integration impact

| Part | Impact |
| --- | --- |
| Places importer | Matches on `place_source_ids`, not on the release. Writes a reconciliation report before writing anything. Adds boundary versions, never overwrites. Imports `DESIG_TYPE`, `STATUS`, `STATUS_YR`, `GOV_TYPE`, `PA_DEF`. Moves its writes from `places.geom` to `place_boundaries`. |
| Places Database | Places become one type among several. Recognitions get their own Places. |
| Budding Places frontend | Reads generic `place_*` functions with a type parameter, and `place_stats_preferred`. Crops ids are no longer hard-coded. Profiles show recognitions through `recognises`. |
| Molding Places admin | The review screens map to RPCs: approve a boundary, set Stats eligibility, confirm a source match, review an overlap, review an image. Needs profiles and roles first. |
| Boundary correction workflow | A contributor submits a `proposed` boundary through `submit_boundary`. QC runs. An editor approves. The approved boundary becomes current. Stats eligibility stays `pending` until someone sets it. |
| Boundary Quality Pipeline (future) | Writes `boundary_checks` rows with its version and thresholds. Sets `qc_status`. The tables already support it. |
| Stats Pipeline | Reads `stats_eligible_boundaries`. Writes `stat_runs`, `place_stats`, and `stat_run_issues`. Registers its sprout in `sprouts`. Never overwrites. |
| Tiles Pipeline | Reads the current boundary. One recipe per archive selects place types, for example protected areas and recognitions as separate archives. |
| Image suggestion pipeline (future) | Writes `images` and `suggested` rows in `place_images`, with its name and version in `suggested_by`. |
| Indicator Species (future) | Adds `species` and `species_images` in the same shape as `place_images`. No change to images. |

## I. Deferred

Supported by the design, not built in this work:

- Indicator Species: `species`, `species_images`.
- iNaturalist sign-in. iNaturalist is an OAuth2 provider with PKCE. Supabase supports custom OAuth2 and OIDC providers. A spike must confirm that iNaturalist has a user-info endpoint that accepts the OAuth token.
- Facts: historical events and timelines.
- Automated image suggestion.
- Community moderation beyond a single editor's review.
- The automated Boundary Quality Pipeline.
- The admin overlap screen.
- Country and ecoregion imports.
- Stats optimisation: its own parcel.
- Metadata edit requests: `place_edit_requests`.

## J. Tasks

Do one task at a time, in this order. Each task is one branch and one pull request. Task files are written when a task starts. A task that changes the hosted database waits for approval of its row counts, disk, and compute.

- [ ] Task 01 — Verify — naturewatch-app
  - *Goal:* Run the read-only queries in **To verify**. Record the results here. Write the ADR on whether a Place is a WDPCA site or a parcel.
- [ ] Task 02 — Hygiene — both repos
  - *Goal:* Drop `pilot_place_map` and its triggers. Add timestamps and `set_updated_at()`. Fix the stale `pilot_places` read in `facts/cropland.py`.
- [ ] Task 03 — Sources — naturewatch-app
  - *Goal:* Rename `sources` to `source_releases`, keeping ids. Add the new `sources` table and `licences`. Add citations. Update the importer.
- [ ] Task 04 — Types and details — naturewatch-app
  - *Goal:* Add `place_categories`, `place_types`, `conservation_area_details`, `place_source_ids`, `publication_status`, `merged_into_place_id`. Backfill. Replace the enum.
- [ ] Task 05 — Boundaries — naturewatch-app
  - *Goal:* Add `place_boundaries`, copy the geometry in batches, and verify. Switch functions to it. Add the generic `place_*` reads and temporary wrappers. Add the reconciliation report to the importer.
- [ ] Task 06 — Boundary QC and eligibility — both repos
  - *Goal:* Add `boundary_checks` and the eligibility columns, RPC, and view. Run the four starting checks. Review the flagged records.
- [ ] Task 07 — Stats — both repos
  - *Goal:* Add `stats`, `sprouts`, `stat_runs`, `place_stats`, `stat_run_issues`, `stat_selections`. Rename `fact_methods` to `stat_methods`. Backfill from `facts`. Point the analysis scripts and the places recipe at them. The pipeline stays paused.
- [ ] Task 08 — Frontend and cleanup — naturewatch-app
  - *Goal:* Move the frontend to the generic reads. Drop the wrappers, `facts`, and `places.geom`.
- [ ] Task 09 — Recognitions — both repos
  - *Goal:* Investigate the designations. Import `DESIG_TYPE`. Add recognition types, `place_relationships`, and the admin overlap function. Add a recognitions PMTiles recipe.
- [ ] Task 10 — Profiles, roles, audit — naturewatch-app
  - *Goal:* Add `profiles`, `user_roles`, `has_role()`, contributor policies, and `audit_log`. Together with Molding Places.
- [ ] Task 11 — Images — naturewatch-app
  - *Goal:* Add `images` and `place_images`, a Storage bucket, and upload policies. When Molding Places approves photographs.

## Done when

- The three documents are reviewed and merged into `develop`.
- No migration, database, or production change was made.
- Every verified statement cites a file. Every assumption is marked, with the query that settles it.
