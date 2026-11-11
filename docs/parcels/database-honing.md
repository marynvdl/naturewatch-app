# Parcel: Database Honing

A planning parcel. It reviews the Supabase schema and proposes how to improve it in small, safe stages. This parcel changes no database, migration, or production data.

The proposed design is [docs/database/design.md](../database/design.md). The decisions and their alternatives are [docs/database/decisions.md](../database/decisions.md). Both stay after this parcel is archived. This file holds what belongs to the parcel: the assessment, the migration, the impact on other parts, what is deferred, and the task list.

*Written 9 November 2026.*

## Goal

Improve the existing database rather than rebuild it. Keep what works. Give Places a stable identity independent of their boundary. Make every Stat traceable to a boundary version, a sprout, a method, and a run. Add shared provenance, boundary quality control, and room for recognitions, images, and contributors.

The Stats Pipeline is paused until the stages below have landed. A later parcel finds the most efficient way to calculate stats. The global cropland facts, analysis task-06 and app task-08 of [Cropland 2024 global](../archive/parcels/cropland-2024-global.md), were archived not done and wait for it.

## A. Current state

This is a snapshot from 9 November 2026. It reads the migrations in `supabase/migrations/`, the importer, the frontend, and the analysis repo. No database was queried. Statements marked **To verify** were assumptions. Task 01 checked them on 10 November 2026.

### Tables

| Table | What it holds | Rows |
| --- | --- | --- |
| `sources` | One dataset release: name, release month, download URL, checksum. One row, WDPCA October 2026. | 1 |
| `places` | Identity, boundary (`geom`, MultiPolygon 4326), WDPCA attributes, type enum, generated `area_km2`, bbox columns | 51,001 (README, 31 Oct) |
| `facts` | One row per place, sprout, method: `area_km2`, `percent`, `valid_coverage` | 941 (South Africa, sprout `cropland-2024-v1`) |
| `fact_methods` | Text id and a summary of the formula | 1 |
| `pilot_place_map` | Copy of the South Africa boundaries, kept in step by triggers | 941 |

Views and functions: the view `protected_areas` (terrestrial, at least 10 km²), and the functions `protected_areas_in_extent`, `protected_area_matched`, `protected_area_window`, `protected_area_window_count`, `protected_area_rank`, `protected_area_kept_ids`, `protected_area_filter_stats`, `place_bounds`, `places_set_bbox` (trigger), `sync_pilot_place_map` (trigger).

Task 02 dropped `pilot_place_map` and `sync_pilot_place_map`, and added `created_at`, `updated_at`, and `set_updated_at()` on 10 November 2026.

### What works and should be kept

- `area_km2` is a generated column on the WGS84 spheroid. It cannot drift from the geometry (`20261021120000_records.sql`).
- The bbox columns and their trigger make the "In view" list fast without reading geometry (`20261106110000_place_bbox_columns.sql`).
- `geom` is not granted to `anon` or `authenticated`. Public reads return attributes only.
- Row-level security is on for every table. Writes are `service_role` only.
- Migrations revoke default privileges and grant explicitly.
- The importer validates before upload, copies in committed batches, and keeps ids on a rerun (`supabase/import_wdpa.py`).
- `fact_methods` names the formula. Facts record which sprout they read.

### Weaknesses (verified)

1. **Identity is tied to one release.** `places` is unique on `(source_release_id, source_id)`. A November WDPCA release would get a new `sources` row, so every place would get a new id. PMTiles ids and facts would break. *Since task 04 a place's WDPCA ids are stored in `place_source_ids`, and the importer matches on them. Task 05b adds the reconciliation report.*
2. **Identity and boundary are one row.** A corrected boundary can only overwrite the old one. There is no history. *Fixed by task 05: boundaries are versions in `place_boundaries`.*
3. **Facts are not reproducible.** `facts` has no boundary reference, no run, no timestamp. The upsert in `naturewatch-analysis/facts/cropland.py` overwrites on `(place_id, sprout_id, method_id)`. `sprout_id` is free text with no foreign key.
4. **The crops ids are hard-coded** in the SQL functions (`20261030100000_protected_areas.sql`), in `frontend/naturewatch/src/places/display.ts:4`, and in `cookbook/recipes/places-protected-areas.yaml` in the analysis repo.
5. **`place_type` is an enum** (`wild_space`, `protected_area`, `ecoregion`, `country`, `river_catchment`). It does not match the planned hierarchy. Enum values cannot easily be removed. *Fixed by task 04.*
6. **`sources` is a release, not a source.** There is no dataset, licence, citation, or publication level. *Fixed by task 03.*
7. **WDPCA attributes are missing.** `DESIG_TYPE`, `STATUS`, `STATUS_YR`, `GOV_TYPE`, and `PA_DEF` are not imported. World Heritage Sites, Ramsar sites, and other international designations can only be found by their `designation` text.
8. **No timestamps** on any table. *Fixed by task 02.*
9. **No auth, profiles, roles, or audit.**
10. **`pilot_place_map` is dead weight.** The app stopped reading it. Its trigger still fires on every `places` insert or update. *Fixed by task 02.*
11. **A stale read in the analysis repo.** `facts/cropland.py` selects `from public.pilot_places`, which was renamed to `protected_areas` on 30 October. The next run would fail. *Fixed by task 02: it reads `protected_areas` for South Africa.*
12. **Default grants.** Postgres grants `execute` on every new function to `public`, and Supabase's default privileges grant new tables and functions in `public` to `anon` and `authenticated`. The existing migrations revoke correctly. Every new migration must do the same.
13. **The importer's upsert overwrites geometry.** `on conflict … do update set … geom = excluded.geom`.

### Who depends on the schema

| Reader or writer | Uses |
| --- | --- |
| Frontend `places/api.ts` | `protected_areas` view, `facts` table, RPCs `protected_area_window`, `protected_area_rank`, `protected_area_filter_stats`, `place_bounds` |
| `supabase/import_wdpa.py` | Writes `places` with `geom`. Reads `sources`. |
| Analysis `facts/cropland.py` | Reads `protected_areas` (South Africa) and `places.geom`. Writes `facts`, `fact_methods`. |
| Analysis `places/protected_areas.py` | Reads `places.geom` and `facts`. Writes PMTiles features with `id` = `places.id`. |
| FastAPI service | Does not read these tables. |

### To verify

Task 01 ran these on 10 November 2026 against the hosted database, through the Supabase MCP server in read-only mode (role `supabase_read_only_user`, `transaction_read_only = on`, statement timeout 2 minutes). Nothing was written. PostGIS is in the `extensions` schema, so its functions are qualified. At the time: 51,001 places in 50,889 sites, 941 facts.

- **SITE_ID and SITE_PID.** Verified 10 November 2026. From the current WDPCA manual: `SITE_ID` identifies the protected area or OECM as a whole and stays stable for that site. It was `WDPAID`. `SITE_PID` identifies one parcel, a separate part of a site. It was `WDPA_PID`. Each stored place is one parcel.

  74 sites have more than one stored parcel. They hold 186 places, 0.4% of the total. 62 sites have 2 parcels, 8 have 3, 2 have 4, 1 has 5, and 1 has 25 (`555758870`, Fish And Wildlife Development Fund, Canada). 59 of the 74 use one name on every parcel, 67 use one designation, and all 74 sit in one `iso3`. The 15 with several names are zones or numbered parts of one area: biosphere core and buffer zones (Laguna de los Pozuelos, San Guillermo), the parts of Great Volzhsko-Kamsky, the Iberá nuclei, and Mongolian parks split into /A/ and /B/. Parcels of one site can carry different designations. Gorongosa (`801`) has a National Park parcel and a Buffer Zone parcel.

  Only parcels of at least 10 km² are stored. A site's smaller parcels are not in the database, so these counts are a lower bound for the source.

  ```sql
  with s as (
    select site_id, count(*) n, count(distinct name) names,
      count(distinct designation) desigs, count(distinct iso3) isos
    from places group by site_id having count(*) > 1)
  select count(*), sum(n), max(n),
    count(*) filter (where names = 1),
    count(*) filter (where desigs = 1),
    count(*) filter (where isos = 1)
  from s;
  ```

- **South Africa geometry.** Verified 10 November 2026. The check passed. The facts run stored no place area, but `percent = 100 × area_km2 / valid` and `valid_coverage = valid / places.area_km2` at full precision give it back as `100 × area_km2 / (percent × valid_coverage)`. All 663 facts where both are above 0 agree with today's `places.area_km2`. The largest relative difference is 4.9e-15, and the largest absolute difference is 1.6e-11 km². 278 facts have `percent = 0` (2 of them also have `valid_coverage = 0`) and cannot be checked this way. Equal areas show the boundaries did not change, but do not prove it. 431 facts have `valid_coverage` slightly above 1, at most 1.00031. That comes from counting pixel fractions against the polygon's area, and is not an error.

  ```sql
  select count(*) filter (where abs(r - now_km2) / now_km2 <= 1e-9) as agree,
    count(*) filter (where abs(r - now_km2) / now_km2 > 1e-9) as differ,
    max(abs(r - now_km2) / now_km2) as max_rel_diff
  from (
    select p.area_km2 as now_km2,
      100 * f.area_km2 / (f.percent * f.valid_coverage) as r
    from facts f join places p on p.id = f.place_id
    where f.percent > 0 and f.valid_coverage > 0
  ) as t;
  ```

- **Shape statistics.** Verified 10 November 2026. One pass over all places took 29 seconds. Holes are `st_nrings - st_numgeometries`, the interior rings across every part.

  | Measure | Median | 90th percentile | 99th percentile | Maximum |
  | --- | --- | --- | --- | --- |
  | Components | 1 | 7 | 125 | 24,389 |
  | Holes | 0 | 5 | 89 | 14,448 |
  | Vertices | 844 | 7,659 | 53,141 | 1,952,317 |

  35,378 places (69%) have one part and 37,557 (74%) have no hole. 603 have more than 100 parts and 135 more than 1,000. 198 have more than 100,000 vertices and 6 more than a million. Most parts: California Coastal (USA, 24,389), Old Growth Management Areas (Mapped Legal) (CAN, 20,166), Metsälain erityisen tärkeät elinympäristöt Pohjois-Pohjanmaa (FIN, 17,914), Aleutian Islands World War II National Monument – Kiska Area 4 (USA, 17,151), Kawésqar (CHL, 15,437). Most vertices: Torne och Kalix älvsystem (SWE, two records, 1,952,317 and 1,945,166), Kawésqar (1,870,347), Vindelälven (SWE, 1,674,464), Catchment Reserve Protection Area (KOR, 1,323,071), Tornionjoen-Muonionjoen vesistöalue (FIN, 1,060,218). Many of the largest are collections, not single areas: Finnish forest-act habitats per region, Danish municipal private land, Dutch NNN provinces. River-system Natura 2000 sites in Sweden appear twice with near-identical shapes, once as a Special Area of Conservation and once as a Special Protection Area.

  ```sql
  with s as (
    select st_numgeometries(geom) c,
      st_nrings(geom) - st_numgeometries(geom) h,
      st_npoints(geom) v
    from places)
  select
    percentile_disc(array[0.5, 0.9, 0.99, 1]) within group (order by c),
    percentile_disc(array[0.5, 0.9, 0.99, 1]) within group (order by h),
    percentile_disc(array[0.5, 0.9, 0.99, 1]) within group (order by v)
  from s;
  ```

- **Recognitions.** Verified 10 November 2026. There are 980 distinct designations and none is null. Matched by name, the international and regional sets are:

  | Set | Designations | Places |
  | --- | --- | --- |
  | Natura 2000 (EU) | Special Areas of Conservation (Habitats Directive) 4,758; Special Protection Area (Birds Directive) 2,875; Site of Community Importance (Habitats Directive) 620 | 8,253 |
  | Ramsar | Wetland of International Importance (Ramsar Site) | 1,079 |
  | Emerald Network (Council of Europe) | Emerald Network | 1,012 |
  | UNESCO-MAB Biosphere Reserve | UNESCO-MAB Biosphere Reserve | 220 |
  | World Heritage | World Heritage Site (natural or mixed) | 207 |
  | ASEAN Heritage Park | ASEAN Heritage Park | 11 |
  | Cartagena Convention | Specially Protected Area (Cartagena Convention) | 4 |
  | OSPAR | Marine Protected Area (OSPAR) | 3 |

  Together 10,789 places, 21% of the total. Some national designations use the same words: Natura 2000 SCI 244, Natura 2000 SPA 125, Natura 2000 122, Biosphere Reserve 49, and smaller variants of biosphere zones, RAMSAR, ZSC and ZPS, and ASEAN Heritage Park combined with a national designation. Which of these are international is settled by `DESIG_TYPE` in task 09, not by name.

  ```sql
  select designation, count(*) from places
  where designation ~* '(world heritage|ramsar|biosphere|unesco|natura 2000|community importance|special protection area|special areas? of conservation|emerald|asean|ospar|cartagena|geopark)'
  group by designation order by 2 desc;
  ```

- **Disk.** Verified 10 November 2026. The dashboard shows 4.62 GB used of an 8 GB disk. `pg_database_size` is 3,684,800,179 bytes (3,514 MB). `pg_total_relation_size('public.places')` is 3,650,945,024 bytes (3,482 MB), 99% of the database. The geometry copy in task 05 adds about 3.5 GB, plus its GiST index and the write-ahead log while the backfill runs. 4.62 + 3.5 GB already passes 8 GB. Grow the disk to 16 GB before task 05: room for the copy, the index, the log, and a margin, without leaning on automatic disk growth during the backfill. Check the price and whether the disk can be shrunk again on the dashboard before growing it.

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

- **Sites.** A Place is the whole WDPCA site ([record 19](../database/decisions.md#19-a-conservation-area-place-is-the-whole-wdpca-site)). For each of the 74 sites with several stored parcels, keep the place with the largest parcel. Set the other 112 to `merged`, with `merged_into_place_id` pointing at it. Flag the 7 sites whose parcels differ in designation. *Task 05 does this with `merge_wdpa_site_parcels()`, after the site boundaries are copied. The merged places' SITE_PIDs point at the kept place. The kept place's `conservation_area_details.source_attributes` lists every parcel under `parcels`, and the 7 mixed sites carry `designations_differ: true`.*
- **Mixed designations.** Merging the 7 sites whose parcels differ in designation lost places worth monitoring on their own: Gorongosa National Park (two parcels, 4,042 km²) became part of the Gorongosa Buffer Zone (9,446 km²), named "Gorongoza". Task 05a gives each designation in those 7 sites its own place.
- **Zoned sites.** 10 sites with one designation are zoned like Gorongosa, with a core and a buffer or outer zone stored as separate parcels. Task 05 merged them, and task 05a leaves them merged. Decide them with the buffer question: cut the core out of the buffer, or record buffers and zones as designations.
  - Mexico, an IUCN Ia core inside the category VI site: Balam Kin (555783753), Balam Ku (555783754), Canoas (555783756), Ríos y Montañas de la Comarca Lagunera (555783781), Sierra de Vallejo-Río Ameca (555783785), Sierra Tecuani (555783786), Wanha' (555783790).
  - Argentina, UNESCO-MAB biosphere reserves with a "Zona núcleo" and a "Zona de amortiguamiento": Laguna de los Pozuelos (16894), San Guillermo (23).
  - Russia, UNESCO-MAB biosphere reserve with four named parts inside its 873 km² outline: Great Volzhsko-Kamsky (209777).
- **Boundaries.** One version 1 boundary per site: the union of its parcels, made one MultiPolygon. Collecting the parcels without a union gave a valid shape for only 22 of the 74 sites on 10 November 2026, because parcels touch or overlap (14 sites overlap, by up to 4,042 km²). The union is valid for all 74 and counts an overlap once. `review_status = 'approved'`, `is_current = true`, source WDPCA October 2026, `source_record_id` = SITE_ID.
- **Source ids.** One confirmed `wdpa_site_id` row per place, and one confirmed `wdpa_site_pid` row per parcel, pointing at the kept place. First and last seen in October 2026.
- **Details.** `designation`, `iucn_category`, `iso3`, and `realm` move to `conservation_area_details`. The missing WDPCA fields stay null until the next import.
- **Types.** Every current place becomes type `conservation_area`, `publication_status = 'published'`.
- **Stats.** Each `facts` row becomes three `place_stats` rows (`crops_area`, `crops_percent`, `valid_coverage`). They belong to one run for Batch job `facts-cropland-2024-v1-20261022180517` on 22 October 2026, against the version 1 boundary. The South Africa geometry check passed on 10 November 2026, so the run is not retracted. Then add a `stat_selections` row for crops 2024.
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

- [x] [Task 01 — Verify](../archive/tasks/task-01-verify-database-assumptions.md) — naturewatch-app
  - *Goal:* Run the read-only queries in **To verify**. Record the results here. Write the ADR on whether a Place is a WDPCA site or a parcel.
- [x] [Task 02 — Hygiene](../archive/tasks/task-02-database-hygiene.md) — both repos
  - *Goal:* Drop `pilot_place_map` and its triggers. Add timestamps and `set_updated_at()`. Fix the stale `pilot_places` read in `facts/cropland.py`.
- [x] [Task 03 — Sources](../archive/tasks/task-03-sources.md) — naturewatch-app
  - *Goal:* Rename `sources` to `source_releases`, keeping ids. Add the new `sources` table and `licences`. Add citations. Update the importer.
- [x] [Task 04 — Types and details](../archive/tasks/task-04-types-and-details.md) — naturewatch-app
  - *Goal:* Add `place_categories`, `place_types`, `conservation_area_details`, `place_source_ids`, `publication_status`, `merged_into_place_id`. Backfill. Replace the enum.
- [x] [Task 05 — Boundaries](../archive/tasks/task-05-boundaries.md) — naturewatch-app
  - *Goal:* Add `place_boundaries`, copy the geometry in batches, and verify. Merge the parcels of each multi-parcel site into one place, as in the backfill rule **Sites**. Switch the existing functions to it.
- [ ] [Task 05a — Places cleanup](../tasks/task-05a-places-cleanup.md) — naturewatch-app
  - *Goal:* Make every stored WDPCA parcel its own place again, undoing task 05's merge of the 74 sites. Mark each multi-parcel site's `wdpa_site_id` as `proposed` until a person decides. Supersede record 19 of decisions.md. The review queue is designed in task 06.
- [ ] Task 05b — Generic reads and reconciliation — naturewatch-app
  - *Goal:* Add the generic `place_*` reads and temporary wrappers. Move the importer's writes to site boundaries in `place_boundaries`. Add the reconciliation report: it classifies every record as in record 4 of decisions.md, and refuses to write unless every record matches cleanly.
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
