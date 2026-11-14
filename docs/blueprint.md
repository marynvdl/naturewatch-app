# Nature Watch — technical blueprint

Nature Watch (soon to be rebranded as Sooty Earth) helps people explore environmental pressures and natural landscapes. The current app focuses on Africa, with a longer-term ambition of global coverage and ecological assessment.

This document describes the working system and agreed direction. Commands and branches: the [app README](../README.md).

| Subject | Source of truth |
| --- | --- |
| Database tables, bucket paths, and how the app reads layers | This file |
| How to read the published map | [docs/user/using-the-map.md](user/using-the-map.md) |
| What each map layer shows, and its limits | [docs/user/data.md](user/data.md) |
| The archived first-release plan | [docs/archive/sooty-earth-roadmap.md](archive/sooty-earth-roadmap.md) |
| How a dataset becomes published objects, including transformations, costs, and scripts | [docs/pipelines.md](https://github.com/marynvdl/naturewatch-analysis/blob/main/docs/pipelines.md) in marynvdl/naturewatch-analysis |
| The hand-edited layer catalog | [cookbook/recipes/](https://github.com/marynvdl/naturewatch-analysis/tree/main/cookbook/recipes) in marynvdl/naturewatch-analysis |
| How to run a step, and what that run cost | The step README in marynvdl/naturewatch-analysis |
| Work parcels | `docs/parcels/` in this repo |
| The proposed database design and its decisions | [docs/database/](database/design.md) — proposed, not yet in place |
| A single task | `docs/tasks/` in the repo that does the work |

*Updated 29 October 2026. Reader docs live in `docs/user/`. The first-release roadmap is archived. Pipeline procedure, cost, and scripts stay in naturewatch-analysis. `nature-watch-bucket` was made private on 22 October 2026.*

## 1. How the system fits together

| Repository | Responsibility |
| --- | --- |
| `marynvdl/naturewatch-app` | This repo keeps the web app, the map catalogue at `frontend/naturewatch/src/catalog/layers.json`, the database schema and access rules in `supabase/`, and the reads and writes the app itself makes. |
| `marynvdl/naturewatch-analysis` | Publishes rasters and map tiles. Its procedure is [`docs/pipelines.md`](https://github.com/marynvdl/naturewatch-analysis/blob/main/docs/pipelines.md). |

The app reads published objects and does not run the analysis. How a dataset becomes those objects is [`docs/pipelines.md`](https://github.com/marynvdl/naturewatch-analysis/blob/main/docs/pipelines.md) in marynvdl/naturewatch-analysis.

Fire is the pipeline that runs today: Earth Engine to `nature-watch-bucket`, then a GitHub runner to `nature-watch-tiles`. The crop, built, and bare virtual-machine tasks are in `archive/vm-tile-tasks/` in the analysis repo, and their workflows do not start a machine. Tree loss and 2020 tree height are served externally by Global Forest Watch; dams use a Mapbox tileset. Tree height tiles cover the globe. The other published layers keep their existing coverage.

The connection between data and app is defined by **published object paths** and the **layer catalogue** at `frontend/naturewatch/src/catalog/layers.json`.

The `sources`, `source_releases`, `licences`, and `places` tables are in Supabase, with the stats tables below. `sources` names where a record comes from, `source_releases` holds a source's versions with their citation, and `licences` holds the terms of use. `place_categories` and `place_types` say what kind of thing a place is: every stored place is type `conservation_area`. `places` holds a place's identity, name, type, and `publication_status`. A place is one WDPCA parcel. Parcels of one site become one place only when a person merges them. Until then the site's `wdpa_site_id` row is `proposed`. `place_boundaries` holds each place's boundary versions. One is current, and the reads below use its `area_km2` and box. `places` holds no geometry since task 08 of Database Honing. `conservation_area_details` holds the WDPCA attributes of each place: designation, IUCN category, countries (`iso3`, a list), realm, and its release and SITE_ID. `place_source_ids` holds a place's WDPCA ids: one `wdpa_site_pid` per parcel and one `wdpa_site_id` per site, on its largest parcel. The reads take a place type: the views `place_summaries` and `listed_places`, and the functions `place_window`, `place_rank`, `place_window_count`, `place_filter_stats`, and `places_in_extent`. `listed_places` holds the list rule: a conservation area is listed when it is terrestrial and at least 10 km². Both join `iso3` back into one text value, with `;` between countries. `place_summaries` shows a place's curated name, designation, and countries from `place_curations` when they are set, and adds the curated `tagline` and `description` and the source values `source_place_name`, `source_designation`, and `source_iso3`. Search in `place_matched` and in the cross-type search matches the curated and the source name. The frontend (`frontend/naturewatch/src/places/api.ts`) passes the place type `conservation_area`. The places page reads `place_window`, 50 rows at a time. The Places list on the map reads `place_window`, 50 rows at a time from an offset, `place_rank` to find the offset around a place chosen on the map, and `place_window_count` for the filter dialog. An extent is matched against the box columns `bbox_west`, `bbox_south`, `bbox_east`, and `bbox_north` of the current boundary in `place_boundaries` (a trigger fills them from `geom`; reading the boundary itself was too slow for the anon role's time limit). Filter charts read `place_filter_stats`. A place profile reads `place_summaries`, so any published place opens, and `place_merged_into` sends a merged place's address to its kept place. None of those reads return geometry. Calculated numbers are in the stats tables (Database Honing task 07): `stats` names what is measured, `stat_methods` the calculation, `sprouts` the layer read, and `stat_runs` one run. `place_stats` holds one value per run, boundary version, stat, and period, and is never updated. `stat_selections` names the sprout and method the app shows for each stat and period, and the view `place_stats_preferred` applies it to each place's current boundary. The list's cropland percent reads `place_crops_percent`, which reads `place_stats_preferred` for `crops_percent`. The place profile reads `crops_area` and `crops_percent` for 2024 from `place_stats_preferred`. The FastAPI service does not read these tables.

## 2. Storage and access

| Bucket | Contents | Access |
| --- | --- | --- |
| `gs://nature-watch-bucket` | Source rasters, including `COGS/fire/<year>/` and the cropland seed and sprout prefixes | Private since 22 October 2026. Public access prevention is enforced. `gee-1-238@nature-watch-387210.iam.gserviceaccount.com` has `roles/storage.objectAdmin`. |
| `gs://nature-watch-tiles` | Display tiles, including `fire/<year>/{z}/{x}/{y}.png`, `cropland/2024/v1/{z}/{x}/{y}.png` (South Africa, version 1, no longer read by the app), `cropland/2024/v2/cropland.pmtiles` (class tiles, no longer read by the app) and `cropland/2024/v3/cropland.pmtiles` | Public read; keeping map tiles public is agreed |

Both buckets belong to GCP project `nature-watch-387210`. The inspected machine’s default project was `science-428407`; confirm the intended project before cloud operations. The Earth Engine billing project remains unresolved.

The Supabase tables `sources`, `source_releases`, `licences`, `place_categories`, `place_types`, `places`, `conservation_area_details`, `place_source_ids`, `stat_methods`, `stats`, `sprouts`, `stat_runs`, and `stat_selections` each have `created_at` and `updated_at` (`timestamptz`, default `now()`). The trigger `set_updated_at()` sets `updated_at` on every update. Rows that existed before 10 November 2026 carry a known date instead (`20261110120000_hygiene.sql`): places 31 October 2026, the day of the global load, when the row was loaded or last overwritten; fact methods (now `stat_methods`) 22 October 2026, the day of the facts run; the WDPCA release (then the `sources` row) 10 November 2026, the migration time. Rows added by `20261112100000_types_and_details.sql` carry the time that migration ran.

## 3. Behavior that must remain explicit

- **Dates:** when a layer lacks the selected year, the app uses its latest available earlier year. If every listed year is later, the layer is not requested, except a layer marked static, which stays visible on its latest listed year. Tree height is a static 2020 layer. A timeline selection does not guarantee that every layer represents that year. The Crops button (catalog id `cropland`) lists 2024 only, so a year before 2024 does not request it, and a later year still shows 2024.
- **Fire:** the app reads `fire/<year>/{z}/{x}/{y}.png` and renders those tiles with nearest-neighbor. Zero is transparent. The count method and the tile build are in the analysis pipelines doc. Do not change that method for one year without addressing comparability with previous years.
- **Layer status:** placeholder URLs and “Coming soon” labels are not evidence of published data.

## 4. Development and release

For the app:

1. Create feature or bugfix branches from `develop` and merge back through a pull request.
2. Release through a pull request from `develop` to `main`.
3. The recent release practice adds a version tag on `main`, then syncs the release merge back into `develop` through a pull request. Latest recorded release: `v1.1.3`.

The app workflow runs tests and a Docker build on every push. Pushes to `develop` deploy Fly app `naturewatch`; pushes to `main` deploy `naturewatch-demo`.

Sooty Earth is built on `develop`. Do not open a pull request from `develop` into `main` until that public-site change is explicitly requested. naturewatch.space stays on the current release until then.

## 5. Agreed direction, not yet implemented

The cropland discussion established the following direction:

- Keep Google Cloud Storage and retain numerical source rasters separately from display products.
- Separate **visual aggregation** from **analytical statistics**: maximum overviews preserve sparse features visually; area and percentage come from original class-pixel counts.
- Aim for class-value or share display tiles with client-side coloring. Class tiles must not be gray PNGs: Safari alters gray pixels, so a class-0 tile can paint as cropland. RGB, RGBA and palette PNGs decode exactly. Current fire tiles are already colored and do not yet implement this design.
- Prebuild a bounded range of zooms 0 to 12 at most to keep computational costs low; a zoom of 13 can later be considered. Cropland version 3 uses 512 px tiles, so its archive stops at zoom 11, which holds the same pixel size as a 256 px zoom 12 tile.
- Most published raster tiles are individual XYZ files on `nature-watch-tiles`. Global cropland 2024 is one raster PMTiles archive, `gs://nature-watch-tiles/cropland/2024/v3/cropland.pmtiles`. Protected-area boundaries are one PMTiles archive, `gs://nature-watch-tiles/places/protected-areas/v1/places.pmtiles`, with vector layer `places`. It holds the current boundaries of published places of type `conservation_area`. Recognition boundaries (World Heritage, Ramsar, UNESCO-MAB, Natura 2000, Emerald, and other regional) are a second archive, `gs://nature-watch-tiles/places/recognitions/v1/recognitions.pmtiles`, with vector layer `recognitions` and the property `place_type_id`. The app draws one recognition type at a time from it, and a selected recognition's outline. A park's recognitions are its confirmed `recognises` rows in `place_relationships`, read with `place_summaries` for their names and types. Every profile's Related tab reads its confirmed links of every type the same way, in both directions, with the other place's card values from `place_summaries`. In edit mode an admin reads every link, and changes them only through `set_place_relationship`.
- Precompute statistics for known spaces when publishing a layer year, then serve those results for catalogue comparisons.

The version 1 (South Africa) cropland seed objects are at `gs://nature-watch-bucket/seeds/cropland/glad/2024/v1/`. Its sprout raster is `gs://nature-watch-bucket/sprouts/cropland/2024/v1/cropland-2024-zaf.tif`, with `collection.json` and `cropland-2024-zaf.json` in that folder. The version 2 (global) seed is under `seeds/cropland/glad/2024/v2/`. Its sprout, id `cropland-2024-v2`, is the collection VRT `gs://nature-watch-bucket/sprouts/cropland/2024/v2/cropland-2024.vrt` over per-tile COGs in `.../v2/tiles/`, with `collection.json` and `cropland-2024.json` beside it. There is no single `cropland-2024.tif`. The 2015 and 2019 crop tiles stay as they are.

`frontend/naturewatch/src/catalog/layers.json` is what the map reads. A static STAC catalogue is a generated view of a recipe, written beside the sprout raster. The app does not read STAC.

Cropland stats for the South Africa places already stored stay on sprout `cropland-2024-v1`, method `area-weighted-spheroid-v1`: 2,823 `place_stats` rows from the 22 October 2026 run, and the selection for 2024. Places added by the global import have no cropland stat.

The catalog layer `cropland` publishes that 2024 product worldwide. Its tiles are cropland share in one PMTiles archive at `gs://nature-watch-tiles/cropland/2024/v3/cropland.pmtiles`, 512 px palette PNGs, zooms 0–11. The red channel is the share on a 0–255 scale, in eight shades spaced on √share. The map adds it as a Mapbox GL JS raster source with `url` set to the archive, `tileSize` 512 and `maxzoom` 11 (a raster `.pmtiles` source needs Mapbox GL JS 3.23.0 or later; the app uses 3.34.1). Other raster layers keep a `{z}/{x}/{y}` template. Below zoom 11 the client paints orange whose opacity follows 0.2 + 0.75 × √share. From zoom 11 it paints a cell solid if the share is at least half. Other land and nodata stay clear. The tile bucket allows the develop app and local dev (`http://localhost:5173` and `http://127.0.0.1:5173`) to read those pixels. Closer than zoom 11 enlarges the zoom 11 tiles. `/places` lists terrestrial protected areas of at least 10 km², 50 at a time by name. `/places/:id` shows the name, the stored cropland square kilometres and percent, the WDPCA release month, the release citation from `protected_areas.citation`, and a Protected Planet link. **Places** on the map draws boundaries from the places PMTiles archive, as a Mapbox GL JS vector source (native PMTiles needs Mapbox GL JS 3.21 or later). Each tile feature carries `id` (`places.id`), `area_km2`, and `cropland_percent` when a fact exists, so the size and cropland filter applies to the tiles directly. A click opens the place profile from Supabase. To move the map to a chosen place, the app calls `place_bounds(id)`, which returns the current boundary's west, south, east, and north only. `places.geom` and `place_boundaries.geom` stay ungranted. The app does not offer a polygon download. The page and the overlay need `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time. The develop deploy reads those from GitHub secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY`. The same client holds the Supabase Auth session (`src/plugins/supabase.ts`, `src/store/AuthStore.ts`). Only admins sign in, by email magic link, and sign-up is closed. The app reads `has_role('admin')` to show admin controls. Admin writes go from the browser, with that session, to `security definer` RPCs that check `has_role()`, not to the FastAPI service. The first is `curate_place`, for the profile's edit mode. The production deploy (`naturewatch-demo`) is built without the Supabase values, so sign-in works only on `naturewatch` and local dev.

Accepted for the first Sooty Earth release, and not yet built:

- The interface is rebranded to Sooty Earth on `develop` before any production release. That work is a parcel. The old step list is archived.

The stored places are terrestrial protected areas worldwide with calculated `area_km2` of at least 10. The published boundary archive remains the South Africa tiles until it is rebuilt. Source rasters and tiles stay in Cloud Storage.

## 6. Decisions still needed

- Source rasters in `nature-watch-bucket` are private as of 22 October 2026. Map tiles stay public. Still to confirm on the next fire-tile run: the GitHub Actions identity can read the private bucket, and its write access to `nature-watch-tiles` was not rechecked.
- For cropland: choose between resampling of `q3` or `max`. 
- The Earth Engine billing project and the continuing role of `naturewatch-gee`, which was not inspected.
- The production domain, and when the GitHub repositories are renamed. Bucket names, Fly app names, and the GCP project stay as they are through that rename.

Update this blueprint when a table, an object path, or the way the app reads a layer changes. Keep experiments and longer discussions in Notion.
