# Task 04 — Types and details

Parcel: [Database Honing](../parcels/database-honing.md)

Repository: naturewatch-app. Start only after task 03 has merged into `develop` (pull request #391).

## Goal

Add `place_categories`, `place_types`, `conservation_area_details`, and `place_source_ids`, as in section 4.1 of [design.md](../database/design.md) and records 2, 3, 4, 13, 18, and 19 of [decisions.md](../database/decisions.md). Add `publication_status` and `merged_into_place_id` to `places`. Backfill them. Replace the `place_type` enum with `place_type_id`. Switch every reader to the new tables. Then drop the enum and the old WDPCA columns from `places`. Apply the migration to the hosted database after approval.

The merge of multi-parcel sites waits for task 05. There it happens together with the site boundary (decided 10 November 2026). In this task every place stays `published`, and no place is merged.

## Facts already stored

Checked read-only on the hosted database on 10 November 2026:

- `places` holds 51,001 rows in 50,889 sites. Every row has `place_type = 'protected_area'` and `realm = 'Terrestrial'`. None has a null `designation`, `iso3`, or `site_id`, and none is under 10 km². `facts` holds 941 rows.
- `iso3` is text. 22 places list several countries separated by `;`, for example `ALB;MKD` and `ZMB;ZWE`.
- `places` columns: `id`, `source_release_id` (FK → `source_releases`), `source_id` (SITE_PID), `site_id` (SITE_ID), `name`, `place_type` (enum), `designation`, `iucn_category` (with `places_iucn_category_check`), `iso3`, `realm`, `geom`, `area_km2` (generated), the bbox columns and their trigger, `created_at`, `updated_at`. The unique key `places_source_feature_key` is `(source_release_id, source_id)`, and the importer upserts on it (`supabase/import_wdpa.py`).
- Four functions read the old columns: `protected_areas_in_extent` (`place_type`, `realm`, `designation`, `iso3`), `place_bounds` (`place_type`), and `protected_area_matched` and `protected_area_window`, which return `designation` and `iso3 text` from `protected_areas_in_extent` and the `protected_areas` view. The view reads `site_id`, `place_type`, `designation`, `iucn_category`, `iso3`, `realm`, and joins the release through `places.source_release_id`.
- The frontend reads `id, name, designation, iso3, area_km2, site_id, release_month, source_name, citation` from `protected_areas` (`places/api.ts`), and `designation` and `iso3` from the window function. It does not read `place_type`. `countryName()` in `places/display.ts` shows a value that is not a single ISO3 code as it is.
- In naturewatch-analysis, `facts/cropland.py` filters `protected_areas.iso3 = 'ZAF'` and reads `places.geom`. `places/protected_areas.py` and the cookbook do not read the old columns.
- Adding a column with a constant default, and dropping a column, change only the catalog. Neither rewrites the 3.5 GB `places` table.
- 74 sites have more than one stored parcel, 186 places in all (parcel, **To verify**).

## Do this

1. Add one migration, `supabase/migrations/20261112100000_types_and_details.sql`. Its writes are small: about 51,000 details rows and 102,000 source id rows. It does not write geometry.
   - **`place_categories`** and **`place_types`**, as in design.md, with the timestamps and the `set_updated_at()` trigger. `place_types.place_category_id` references `place_categories` `on update cascade`. Insert only what current records use: category `conservation_area` ("Conservation area"), and type `conservation_area` ("Conservation area", `details_kind = 'conservation_area'`). Other categories and types come with their records.
   - **`places`.** Add `place_type_id text not null default 'conservation_area'` (FK → `place_types`, `on update cascade`), then drop the default. Add `publication_status text not null default 'published'`, then set the default to `'draft'`, with `places_publication_status_check` for `draft`, `published`, `withdrawn`, `merged`. Add `merged_into_place_id uuid` (FK → `places`), with `places_merged_into_check`: set only when `merged`, and not equal to `id`. Add the index `places_place_type_id_publication_status_idx`. Do not add `submitted_by`. Task 10 adds it with `profiles`.
   - **`conservation_area_details`**, as in design.md: `place_id` PK and FK → `places`, `protection_kind`, `designation`, `designation_type`, `legal_status`, `status_year`, `iucn_category` (the CHECK moves here unchanged), `governance_type`, `iso3 text[] not null`, `realm`, the four provenance columns from section 4.3 (`source_id` FK → `sources`, `source_release_id` with the composite FK to `source_releases (id, source_id)`, `source_record_id`, `source_url`), `source_attributes jsonb`, and the timestamps and trigger. `protection_kind`, `designation_type`, `legal_status`, `status_year`, `governance_type`, and `source_attributes` stay null until the next import. Their CHECKs allow null.
   - **The details trigger.** A trigger on `conservation_area_details` refuses a row whose place's type does not have `details_kind = 'conservation_area'`.
   - **`place_source_ids`**, as in design.md, without `matched_by` (task 10). `first_seen_release_id` and `last_seen_release_id` reference `source_releases`. Add the partial unique index on `(source_id, id_kind, source_record_id) where match_status = 'confirmed'`, and the index on `(place_id)`.
   - **Backfill.**
     - One details row per place: `designation`, `iucn_category`, `realm`, `iso3` split on `;`, `source_id = 'wdpca'`, `source_release_id` from the place, `source_record_id` = SITE_ID, and `source_url` = the Protected Planet site page the profile links to today.
     - One confirmed `wdpa_site_pid` row per place (51,001), pointing at its own place.
     - One confirmed `wdpa_site_id` row per site (50,889). For a site with several parcels, it points at the place with the largest `area_km2`, which task 05 keeps. Break ties on the lowest `id`.
     - First and last seen is the October 2026 release for every row.
   - **Readers.** Drop and recreate `protected_areas`, keeping every column name in its order. `site_id` reads `conservation_area_details.source_record_id`. `place_type` reads `places.place_type_id` and becomes text. `iso3` reads `array_to_string(iso3, ';')`, so the text stays as it is. The release joins through `conservation_area_details.source_release_id`. The view keeps places that are `published`, of type `conservation_area`, `Terrestrial`, and at least 10 km². Grant it again as before. Replace `protected_areas_in_extent` and `place_bounds` in the same way, with the same signatures. Check that `protected_area_matched`, `protected_area_window`, and the other functions still run unchanged.
   - **Contract.** Drop `places_source_feature_key`, `places_iucn_category_check`, and the columns `place_type`, `source_release_id`, `source_id`, `site_id`, `designation`, `iucn_category`, `iso3`, and `realm`. Then drop the type `place_type`.
   - **Access**, as in section 6 of design.md. Row-level security on each new table, `revoke all … from public, anon, authenticated`, and writes for `service_role` only. `anon` and `authenticated` read `place_categories` and `place_types` with `using (true)`, and `conservation_area_details` and `place_source_ids` when the place is published. The `places_select` policy becomes `publication_status = 'published'`. Grant the three new `places` columns to `anon` and `authenticated`. `geom` stays ungranted.
2. Update `supabase/import_wdpa.py`. It writes the same pinned release into the new shape. Each batch matches staged rows on confirmed `wdpa_site_pid` rows. A matched place has its name, geometry, and details updated. An unmatched row gets a new `published` place of type `conservation_area`, its details row, and its `wdpa_site_pid` row. After the last batch, one statement adds the missing `wdpa_site_id` rows with the backfill's rule. A rerun keeps the ids. The reconciliation report is task 05. Update `supabase/tests/test_import_wdpa.py`.
3. Update `supabase/tests/records_fixture.sql`. Check that the new tables have row-level security, that `anon` can read them and cannot write them, that `places` no longer has the old columns, that the details trigger refuses a place of another type, that a second confirmed row for one SITE_PID is refused, that `merged_into_place_id` is refused unless the place is `merged`, and that `protected_areas` returns the same columns, with `iso3` as text.
4. Run the local database steps in `supabase/README.md` with the fixture, `.venv/bin/python -m unittest supabase/tests/test_import_wdpa.py`, the catalog suite, `npm run type-check`, `npm run lint`, and the places tests. The frontend should need no change. If it does, stop and say why.
5. Docs. Mark section 4.1 of `design.md` *in place* for these tables and columns. Say that `submitted_by`, `matched_by`, and the other details tables come later. Update `docs/blueprint.md` and `supabase/README.md` where they name the `places` columns or the enum. In the parcel, mark weakness 5 as fixed by task 04, say that weakness 1's ids are now stored in `place_source_ids`, move the site merge from the backfill rules into task 05's goal line, and say that every place stays `published` until then.
6. Open the pull request. Then report the hosted row counts, and confirm that no disk or compute change is needed. Wait for approval. Apply with `supabase migration list` and `supabase db push`. Check read-only: 51,001 places, all `published` and of type `conservation_area`; 51,001 details rows; 51,001 `wdpa_site_pid` and 50,889 `wdpa_site_id` confirmed rows; `protected_areas` returns 51,001 rows with the same `designation`, `iso3`, and `site_id` as before (compare counts and a checksum taken before the push); 941 facts. Record the date applied in the pull request.
7. After the hosted migration, run the `browser-check` skill against the hosted database on the map and a place profile, wide and narrow. Report the list cards, the profile's country and designation, and the Protected Planet link.
8. Tick task 04 in the parcel.

## Do not

- Do not merge places, set any place to `merged`, or touch `geom` or the bbox columns. Task 05 does that.
- Do not change any `places.id`, the release id, or any `facts` row.
- Do not add categories, types, or details tables that no current record uses. Do not add `recognition_details` or `old_growth_details`.
- Do not add `profiles`, `submitted_by`, or `matched_by`.
- Do not download the WDPCA source file or rerun the import against the hosted database.
- Do not change the frontend or the analysis repo, unless step 4 shows they need it. Then stop and ask first.
- Do not merge the pull request before the hosted migration is applied.
- Do not change the disk or compute size.
- Do not commit a database URL, token, password, or login role.
- Do not start task 05.

## Done when

- `place_categories`, `place_types`, `conservation_area_details`, and `place_source_ids` hold the backfilled rows. `places` has `place_type_id`, `publication_status`, and `merged_into_place_id`, and no longer has the enum or the old WDPCA columns. This is true locally and on the hosted database.
- `protected_areas`, `protected_areas_in_extent`, and `place_bounds` read the new tables and return what they returned before.
- The importer and its tests write the new tables, and the fixture passes.
- The map list and a place profile show the same country, designation, and Protected Planet link as before, checked on a wide and a narrow screen.
- The catalog suite, type-check, and lint pass.
- The work is in one pull request into `develop`. Report its address and the required checks. Do not merge it.

## How to work

Branch from `develop`. Do this task only. Get approval before the hosted migration. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
