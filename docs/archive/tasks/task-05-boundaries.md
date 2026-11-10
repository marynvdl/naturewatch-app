# Task 05 — Boundaries

Parcel: [Database Honing](../../parcels/database-honing.md)

Repository: naturewatch-app. Start only after task 04 has merged into `develop` (pull request #394), and after the disk is grown to 16 GB (step 6).

## Goal

Add `place_boundaries`, as in section 4.2 of [design.md](../../database/design.md) and records 5, 6, 17, and 19 of [decisions.md](../../database/decisions.md). Copy every site's geometry into it as a version 1 boundary, in committed batches. Merge the parcels of each multi-parcel site into one place, as in the backfill rule **Sites**. Switch the database functions and the view that read a place's area or box to the current boundary. Apply it to the hosted database after approval.

The generic `place_*` reads, the temporary wrappers, and the importer's move to `place_boundaries` with its reconciliation report are task 05b (decided 10 November 2026).

## Facts already stored

Checked read-only on the hosted database on 10 November 2026, unless marked:

- `places` holds 51,001 rows in 50,889 sites. All are `published`, of type `conservation_area`. `places` is 3,482 MB, 99% of the database, almost all of it `geom`. The disk is 8 GB with 4.62 GB used (task 01). Copying the geometry adds about 3.5 GB, plus the GiST index and the write-ahead log.
- Each place's site is `conservation_area_details.source_record_id` (SITE_ID). Each site's `wdpa_site_id` row in `place_source_ids` already points at the place with the largest parcel, ties broken on the lowest `id`. That is the place task 05 keeps.
- 74 sites have more than one stored parcel, 186 places in all. 112 places will be merged. Every one of the 74 sites totals at least 10 km². 7 mix designations across parcels. None has a fact (record 19).
- Collecting a site's parcels into one MultiPolygon gives a valid shape for only 22 of the 74 sites. Parcels touch or overlap: 14 sites overlap, by up to 4,042 km². `st_multi(st_collectionextract(st_union(geom), 3))` gives a valid, non-empty MultiPolygon for all 74. So a site boundary is the union of its parcels, not their collection, and its area counts an overlap once.
- The importer's `merge` check found no invalid geometry after the 31 October import. A full `st_isvalid` pass did not finish within the read-only 2-minute timeout, so the backfill checks it as it copies.
- Readers of the area and box in this repo: the view `protected_areas` (`places.area_km2`), `protected_areas_in_extent` (`places.area_km2` and the bbox columns), and `place_bounds` (`st_extent(places.geom)`). `protected_area_matched`, `protected_area_window`, `protected_area_window_count`, `protected_area_kept_ids`, `protected_area_filter_stats`, and `protected_area_rank` read through those two. The frontend reads only the view and the functions.
- Readers of `places.geom` in naturewatch-analysis: `facts/cropland.py` and `places/protected_areas.py`. They move in task 07. `places.geom`, `places.area_km2`, and the bbox columns stay until task 08.
- The published places PMTiles keeps the 112 merged parcels as separate features. RLS hides merged places, so clicking one of them opens "missing" until task 07 republishes the archive (accepted 10 November 2026).
- `supabase/import_wdpa.py` writes `places.geom` per parcel. Task 05b moves it to site boundaries.

## Do this

1. **Migration `supabase/migrations/20261113100000_place_boundaries.sql` (expand).** Nothing reads the table yet.
   - **`place_boundaries`**, as in section 4.2: `id` (new ids, `gen_random_uuid()`), `place_id` FK → `places`, `version_number`, `geom geometry(MultiPolygon, 4326) not null`, `area_km2` generated on the spheroid as on `places`, the four bbox columns, the four provenance columns with the composite release FK, `derived_from_boundary_id` FK → `place_boundaries`, `review_status`, `reviewed_at`, `review_note`, `is_current boolean not null default false`, `superseded_at`, and the timestamps with `set_updated_at()`. Leave out `submitted_by`, `reviewed_by`, and `stats_eligibility_set_by` (task 10), and `qc_status` and the `stats_eligibility*` columns (task 06).
   - Constraints: `place_boundaries_place_id_version_number_key`; the unique index `place_boundaries_current_key` on `(place_id) where is_current`; `place_boundaries_current_check` (`not is_current or review_status = 'approved'`); `place_boundaries_approved_valid_check` (`review_status <> 'approved' or (st_isvalid(geom) and not st_isempty(geom))`); `place_boundaries_review_status_check`.
   - A bbox trigger, `place_boundaries_set_bbox`, as `places_set_bbox`.
   - Access, as in section 6: RLS on, `revoke all … from public, anon, authenticated`. `anon` and `authenticated` select every column except `geom`, under the policy `is_current` and the place is published. Writes for `service_role` only.
   - No GiST index yet. It is built after the copy.
2. **Backfill script `supabase/backfill_boundaries.py`.** It reuses the importer's connection helpers and commits each batch. A second start continues where the first stopped.
   - One version 1 boundary per site, on the kept place (the `wdpa_site_id` row's place). A single-parcel site copies `places.geom`. A multi-parcel site gets the union of its parcels, as above.
   - Each row: `review_status = 'approved'`, `is_current = true`, `source_id = 'wdpca'`, the October 2026 release, `source_record_id` = SITE_ID, `source_url` = the Protected Planet page, `created_at` = 31 October 2026 (the global import).
   - Batches of about 500 places, in `places.id` order. Print progress and the time each batch took.
   - An invalid geometry stops the script and names the place. Do not repair it. Stop and report.
   - After the last batch, build `place_boundaries_geom_idx` (GiST) and `place_boundaries_place_id_idx`, with a statement timeout long enough for them.
   - A `verify` command, read-only: one current approved boundary per site (50,889) and none on a place that will be merged; for single-parcel sites, `area_km2` equals `places.area_km2` within 1e-9 relative, and `st_equals` holds on a random sample of 500; for the 74 sites, the boundary area is at least the largest parcel and at most the sum of the parcels.
3. **Migration `supabase/migrations/20261113110000_boundaries_readers.sql` (merge and switch).** It refuses to run unless every site has exactly one current boundary.
   - **Merge.** Set the 112 places that are not their site's kept place to `merged`, with `merged_into_place_id` = the kept place. Point their confirmed `wdpa_site_pid` rows at the kept place. On each kept place of the 74 sites, write `conservation_area_details.source_attributes` as `{"parcels": [...]}`, one entry per parcel with its SITE_PID, name, designation, IUCN category, and area. Add `"designations_differ": true` for the 7 mixed sites. Keep the merged places' rows and details. Delete nothing.
   - **Readers.** `protected_areas` reads `area_km2` from the current boundary. `protected_areas_in_extent` reads `area_km2` and the bbox columns from the current boundary. `place_bounds` reads the current boundary's bbox columns and no longer reads geometry. Keep every name, column, signature, grant, and filter.
   - Check that the other `protected_area_*` functions run unchanged.
4. **Local checks.** Update `supabase/tests/records_fixture.sql` with a multi-parcel site. Check: RLS on `place_boundaries`; `anon` cannot read `geom` or a non-current boundary, and cannot write; a second current boundary is refused; a current boundary that is not approved is refused; an approved invalid boundary is refused, and a proposed one is accepted; the backfill and merge give one current boundary per site and set the parcels to `merged`; `protected_areas` and `place_bounds` return the boundary's area and box. Run the local database steps in `supabase/README.md`, the backfill and `verify` against the fixture, `.venv/bin/python -m unittest supabase/tests/test_import_wdpa.py`, the catalog suite, `npm run type-check`, `npm run lint`, and the places tests. The frontend should need no change. If it does, stop and say why.
5. **Docs.** Mark section 4.2 of `design.md` *in place* for `place_boundaries`, and say which columns come in tasks 06 and 10. Update `docs/blueprint.md` and `supabase/README.md` where they say the area or box is read from `places`, and add the backfill command to the README. In the parcel: mark weakness 2 as fixed by task 05; say in the backfill rule **Sites** that a site boundary is the union of its parcels, and why; mark the merge done; add task 05b to the task list.
6. **Hosted, after approval.** Open the pull request first. Then report the hosted row counts and free disk, and wait for approval.
   - The user grows the disk to 16 GB on the dashboard, after checking its price and whether it can be shrunk again, and switches compute to Large for the backfill. Confirm point-in-time recovery or a backup before the first write.
   - Take a checksum of `protected_areas` (`id`, `designation`, `iso3`, `site_id`) and of `place_bounds` on a sample of 200 places.
   - `supabase migration list`, then push the expand migration. Run the backfill, then `verify`. Record its time and the disk used afterwards.
   - Push the readers migration. Check read-only: 51,001 places, 50,889 `published` and 112 `merged`; 50,889 current boundaries; `protected_areas` returns 50,889 rows, with the same `designation`, `iso3`, and `site_id` for the kept places as the checksum; `place_bounds` agrees with the sample for single-parcel sites; 941 facts, all on published places.
   - The user switches compute back. Record the dates, times, and sizes in the pull request.
7. After the hosted migration, run the `browser-check` skill against the hosted database on the map, the "In view" list, and a place profile for a merged site (for example Gorongosa, SITE_ID 801), wide and narrow. Report the list's size and the profile's area and map zoom.
8. Archive the task on this branch, as the `task` skill says.

## Do not

- Do not write, null, or drop `places.geom`, `places.area_km2`, or the bbox columns. Task 08 does that.
- Do not delete any place, details row, source id row, or fact. Do not change any `places.id`.
- Do not add `boundary_checks`, `qc_status`, or the eligibility columns (task 06), or `profiles` and the reviewer columns (task 10).
- Do not add the generic `place_*` reads or wrappers, or change the importer (task 05b).
- Do not repair a geometry. Stop and report.
- Do not change the frontend or the analysis repo, and do not republish PMTiles.
- Do not change the disk or compute size yourself, and do not push a hosted migration or run the hosted backfill before approval.
- Do not commit a database URL, token, password, or login role.
- Do not merge the pull request before the hosted migration is applied.
- Do not start task 05b.

## Done when

- `place_boundaries` holds one current, approved version 1 boundary per site, locally and on the hosted database, with its GiST index.
- The 112 parcels are `merged` into their site's kept place, and their SITE_PIDs point at it.
- `protected_areas`, `protected_areas_in_extent`, and `place_bounds` read the current boundary and return what they returned before, except that the 74 kept places now show their site's area and box.
- `verify` passes on the hosted database. The disk and compute changes are recorded, and compute is back to its usual size.
- The map, the list, and a merged site's profile work, checked on a wide and a narrow screen.
- The catalog suite, type-check, lint, the importer tests, and the fixture pass.
- The work is in one pull request into `develop`. Report its address and the required checks. Do not merge it.

## How to work

Branch from `develop`. Do this task only. Get approval before each hosted step. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
