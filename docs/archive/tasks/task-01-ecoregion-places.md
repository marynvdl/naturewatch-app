# Task 01 — Ecoregion places

Parcel: [Ecoregions](../parcels/ecoregions.md).

Repository: naturewatch-app. Start from `develop`. This is the parcel's first task. The parcel merged in #446.

## Goal

Store the 846 terrestrial ecoregions of RESOLVE Ecoregions 2017 as published places, each with a version 1 boundary, an `eco_id` source id, and `ecoregion_details`. Load them locally, then on the hosted database after approval. Links, tiles, and anything a person sees are later tasks.

Decided 21 November 2026 by the user:

- **The hosted load runs from the laptop**, over the direct host with a short-lived login role, in small committed batches that continue after a stop. It stays on the current compute size. 846 rows are small next to the 2 GB WDPA load that the README's Fly rule was written for.
- **Ecoregions are published when they load**, as the recognitions were in Database Honing task 09. Until task 04, the search with no place type selected lists them on `develop`, and one opens a generic profile.

## Facts already stored

From the code and from `Ecoregions2017.zip`, downloaded on 21 November 2026:

- `https://storage.googleapis.com/teow2016/Ecoregions2017.zip` is 149,248,653 bytes, Last-Modified 7 May 2019, SHA-256 `be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60`. It holds one shapefile, `Ecoregions2017.shp`, EPSG:4326.
- It has 847 features, with `ECO_ID` 0 to 846, each unique, and 847 distinct `ECO_NAME`s. `ECO_ID` 0 is Rock and Ice, with biome and realm `N/A`. The fields are `OBJECTID`, `ECO_NAME`, `BIOME_NUM`, `BIOME_NAME`, `REALM`, `ECO_BIOME_`, `NNH`, `ECO_ID`, `SHAPE_LENG`, `SHAPE_AREA`, `NNH_NAME`, `COLOR`, `COLOR_BIO`, `COLOR_NNH`, and `LICENSE`. `LICENSE` is `CC-BY 4.0` on every row. Without Rock and Ice there are 14 biomes and 8 realms (Afrotropic 116, Antarctica 18, Australasia 83, Indomalayan 106, Nearctic 115, Neotropic 179, Oceania 24, Palearctic 205).
- Without Rock and Ice: 13,972,976 vertices, at most 496,541 (Ethiopian montane grasslands and woodlands), 39 ecoregions above 100,000. 224 are single polygons.
- 69 of the 847 shapes are invalid, all ring self-intersections. Shapely's `make_valid` changes none of their planar areas by more than 1e-13.
- `SHAPE_AREA` is in square degrees, not km², so it is not used as an area. The area is measured as for every place: `place_boundaries.area_km2`, on the spheroid. `SHAPE_AREA` is also stale for 4 ecoregions: RESOLVE moved 0.304 square degrees from Kinabalu montane alpine meadows (`ECO_ID` 313) to Borneo montane rain forests (220) after computing it.
- `geodesic_area_km2` in `import_wdpa.py` matches the PostGIS spheroid area to about 1e-10.
- `place_categories` has `conservation_area` and `recognition`. `place_types.details_kind` names the details table, and a trigger on each details table checks it (`20261112100000_types_and_details.sql`, `20261120100000_recognitions.sql`). `places.place_type_id` defaults to `conservation_area` and `publication_status` to `published`, so the importer sets both.
- `place_boundaries` requires an approved boundary to be valid and not empty, fills the bbox columns by trigger, and computes `area_km2` on the spheroid. `place_source_ids` is unique on `(source_id, id_kind, source_record_id)` where confirmed.
- `licences` already has `cc-by-4.0` (`20261124100000_place_images.sql`), so no new licence row is needed. `source_releases` requires `download_url`, `checksum`, `version_label`, `released_on`, and `citation`.
- `place_summaries` (`20261126100000_place_cleanup.sql`) reads `designation`, `iso3`, `realm`, and `site_id` from `conservation_area_details` or `recognition_details`. `listed_places` lists every published place that is not a conservation area. `loadPlaceSearchWindow` in `frontend/naturewatch/src/places/api.ts` reads `listed_places` with no type filter.
- `import_wdpa.py` holds `download`, `file_sha256`, `open_connection`, and the login role. `derive_recognises.py` and `suggest_photos.py` load it with `importlib`.
- Only a change of publication is audited on `places` (`audit_places_publication`), so importer inserts are not logged.

## Do this

1. **Migration `20261127100000_ecoregions.sql`.**
   - Category `ecology` (title `Ecology`). Type `ecoregion` (title `Ecoregion`) with `details_kind = 'ecoregion'`.
   - `ecoregion_details`: `place_id` PK, `biome` (`BIOME_NAME`), `realm` (`REALM`), the provenance columns as on `recognition_details` (`source_id`, `source_release_id`, `source_record_id` = `ECO_ID`, `source_url`, `source_attributes` = the raw source row without the geometry), timestamps, the `updated_at` trigger, and the details-kind trigger.
   - Source `resolve-ecoregions` (`dataset`, "RESOLVE Ecoregions 2017", publisher RESOLVE, `https://ecoregions.appspot.com/`, licence `cc-by-4.0`). One release with `version_label` `2017`, `released_on` 2019-05-07 (the zip's date), `accessed_on` 2026-11-21, the URL and checksum above, and the citation of Dinerstein et al. 2017, *BioScience* 67(6): 534–545, doi:10.1093/biosci/bix014.
   - `place_summaries` takes `realm` from `ecoregion_details` too. No other column changes, and `listed_places` is unchanged.
   - RLS, revokes, and grants as on `recognition_details`: `anon` and `authenticated` read the details of published places, and `service_role` keeps its writes.
2. **Importer `supabase/import_ecoregions.py`.**
   - `build`: download the pinned URL into the work directory, stop on a checksum mismatch, and read the shapefile. Leave out `ECO_ID` 0. Repair an invalid shape with `make_valid`, keep only its polygons, and make it a MultiPolygon. Stop if a repaired shape is empty, invalid, or changes geodesic area by more than 0.01%. Write one filtered file, with each shape's geodesic km² from `geodesic_area_km2`, and a manifest with the counts.
   - `upload`: one transaction per small batch, each ecoregion whole: the place (`ECO_NAME`, `ecoregion`, `published`), its version 1 boundary (`approved`, current, the release, `source_record_id` = `ECO_ID`), its confirmed `eco_id` source id (first and last seen on the release), and its details. A batch is at most 25 rows or 4 MB of geometry. A rerun skips the `ECO_ID`s already stored. It never updates or deletes a stored row.
   - `check`: read-only. 846 published ecoregions, each with one current valid boundary, one confirmed `eco_id`, and details. Each boundary's `area_km2` is within 0.01% of the filtered file's geodesic km². It prints the total km² and the 5 largest.
   - Reuse the helpers of `import_wdpa.py` as the other scripts do. The work directory is `ECOREGIONS_WORK_DIR`, defaulting to the system temp directory.
3. **Tests.**
   - `supabase/tests/test_import_ecoregions.py` (no database): Rock and Ice is left out, an invalid ring is repaired, a polygon becomes a MultiPolygon, and a checksum mismatch stops `build`.
   - Extend `records_fixture.sql` with one ecoregion. Check the details-kind trigger both ways, `place_summaries` for its realm, and that `anon` sees its details only while it is published.
   - Run the local database steps in `supabase/README.md`, then `build`, `upload`, and `check` against the local stack, then `upload` a second time to show it adds nothing. Run pytest for `supabase/tests` and the catalog suite.
4. **Docs.**
   - `docs/database/design.md` 4.1 and 4.3: `ecology`, `ecoregion`, `ecoregion_details`, and the RESOLVE source *in place*.
   - `docs/blueprint.md`: replace "every stored place is type `conservation_area`" with the stored categories, and name `ecoregion_details` beside the other details tables.
   - `supabase/README.md`: an Ecoregions section with the commands, why this load runs from a laptop, and the hosted result.
   - The parcel: tick nothing beyond this task.

### Hosted, after approval

5. **Database.** Before: `supabase migration list`, the database size, and the count of published places per type. Push the migration. Run `upload` from the laptop with `SUPABASE_ACCESS_TOKEN` set, then `check`. Record the run time, the database size after, and the `check` output in `supabase/README.md`.

## Do not

- Do not import Rock and Ice or the marine ecoregions.
- Do not derive or store relationships. That is task 02.
- Do not build tiles, change the catalog, or change the frontend.
- Do not add descriptions, curations, photos, or a One Earth link.
- Do not add biome or realm reads, filters, or places for biomes, bioregions, or realms.
- Do not simplify the RESOLVE shapes.
- Do not push the migration or run the importer against the hosted database without approval.
- Do not commit the zip, the filtered file, a token, a database URL, or a password.
- Do not start task 02.

## Done when

- The hosted database has the `ecology` category, the `ecoregion` type, `ecoregion_details`, the RESOLVE source and release, and 846 published ecoregions, each with one current valid version 1 boundary, one confirmed `eco_id`, and details. `check` passes there.
- The fixture checks, the importer tests, the other `supabase/tests`, and the catalog suite pass.
- design.md, blueprint.md, `supabase/README.md`, and the parcel match the result.
- One pull request into `develop`, merged after its checks pass and the user approves.

## How to work

Branch from `develop`. Do this task only. Get approval before the hosted step. Do not commit secrets. Do not add AI or tool attribution to a commit or a pull request.
