# Nature Watch — technical reference and verification record

> Companion to [the technical blueprint](blueprint.md). This preserves Cursor’s original detailed inspection record from 16 October 2026, including file indexes, historical run notes, unresolved proposals and reported cloud checks. It is a dated reference, not a second current blueprint. Repository and cloud checks were not repeated during the editorial reorganization. References to “this document” below refer to the original inspection record.
>
> Later the same day, the About text in `layers.json` was edited. The fire legend no longer says the maximum is 26 or assigns causes to colours. Dams no longer use the subtitle “Coming soon”. The tree-loss About text no longer states a 30% density cutoff. Those gap notes below describe the catalog as inspected, not as it reads now. See [Data notes](data.md).

Initial blueprint, 16 October 2026. Documentation only.

Status labels used below:

- **Implemented** — present in the inspected code.
- **Agreed** — decided in conversation, not yet in code.
- **Proposed** — suggested, not confirmed.
- **Unresolved** — still an open question.

## What was inspected

| Repository | Branch and commit | How |
| --- | --- | --- |
| `marynvdl/naturewatch-app` | Local checkout `chore/sync-main-into-develop-v1.1.2` at `a0d5cfb` (2026-10-14, "Release v1.1.2: fire 2025"). This matches `origin/main`. `origin/develop` is `68fd9c1` ("Add fire layer for 2025"), which is `main` without the release merge commit. | Working tree and `git fetch` |
| `marynvdl/naturewatch-analysis` | Remote `origin/main` at `ec9746c` (2026-10-14, "Add a Python export for the fire counts and a workflow to run it (#2)"), after `git fetch`. | `git show origin/main:...` |

The local analysis checkout is **not** `main`. It is `feature/fire-export-python` at `db55852`. Its files were not used as the source for this document.

`naturewatch-gee` was not opened. Nothing here describes that repository's contents.

Cloud access was checked once, read-only, on 16 October 2026: bucket location and IAM for `gs://nature-watch-tiles` and `gs://nature-watch-bucket`. No export, tile build, or deploy was run for this document.

## 1. Purpose and repositories

Nature Watch is a map of environmental pressure in Africa over a timeline from 2016. The app displays layers. It does not calculate them.

| Repository | Role |
| --- | --- |
| `naturewatch-app` | Vue 3 / Vuetify / Mapbox GL frontend, FastAPI backend, catalog of layers, Fly.io deploy. |
| `naturewatch-analysis` | Earth Engine exports to Cloud Storage, then GDAL tile builds. |

They meet in two places: object paths in Cloud Storage, and the year list in `frontend/naturewatch/src/catalog/layers.json`. The app does not call the analysis repo.

## 2. Architecture and the source-to-map path

**Implemented.** Request path for a published raster: catalog entry → tile URL → Mapbox raster source. If the selected year is missing for a layer, `frontend/naturewatch/src/components/MapComponent.vue` uses the latest earlier year in `years_available`.

**Implemented for fire only.** The automated path is:

1. NASA FIRMS collection `FIRMS`, band `T21`, counted in 14-day windows (`gee/fire/export_fire.py`).
2. Summed on a 1 km grid (`EPSG:3857`, scale 1000 m), exported as 30 m COGs in `EPSG:4326`, one file per Africa block.
3. `tasks/fireTiles/build_tiles.sh` resamples to 1 km, applies `tasks/fireTiles/color.txt` (value 0 is transparent), and builds XYZ PNG tiles for zooms 0–9.
4. The catalog points Fire at `https://storage.googleapis.com/nature-watch-tiles/fire/{year}/{z}/{x}/{y}.png` with `maxzoom: 9` and `resampling: nearest`.

**Implemented, older path.** Built, bare, and crop tiles are produced by VM workflows (`createBuiltTiles.yml`, `createBareTiles.yml`, `createCropTiles.yml`). A push that touches those task paths starts a Compute Engine VM. The workflow does not stop the VM.

**Implemented, not produced by this analysis repo.** Treeloss tiles come from Global Forest Watch. Dams are Mapbox circle tiles (`mapbox://nature-watch.dam-test-tiles`). The recipe file is `mapbox_recipes/damsRecipe.json` in the analysis repo.

**Conflict.** `naturewatch-analysis` `README.md` step 1 still says to create fire GeoTIFFs with `fire_exportFirms.ipynb`. `gee/README.md` and `gee/fire/export_fire.py` are the Python export and the Fire export workflow. Both documents are on `origin/main`.

## 3. Important locations

### App (`naturewatch-app`)

| Path | What it is |
| --- | --- |
| `frontend/naturewatch/src/catalog/layers.json` | Layer list, years, tile URLs, legend HTML. |
| `frontend/naturewatch/src/catalog/layers.schema.json` | Catalog schema, including `maxzoom` and `resampling`. |
| `frontend/naturewatch/src/catalog/index.ts` | Turns catalog entries into map layers. |
| `frontend/naturewatch/src/components/MapComponent.vue` | Year fallback, `maxzoom`, `raster-resampling`. |
| `frontend/naturewatch/src/catalog/__tests__/catalog.spec.ts` | Catalog tests, including the fire zoom cap. |
| `app/main.py` | FastAPI app. |
| `Dockerfile`, `docker-compose.yml`, `fly.toml` | Image and the Fly app named `naturewatch`. |
| `.github/workflows/fly.yml` | Test suite, then deploy. |

### Analysis (`naturewatch-analysis` at `origin/main`)

| Path | What it is |
| --- | --- |
| `gee/fire/export_fire.py` | Fire export. Bucket `nature-watch-bucket`, prefix `COGS/fire`. |
| `gee/fire/test_export_fire.py` | Tests that do not need a login. |
| `gee/blocks/africa_blocks.geojson` | 25 blocks, 15° squares. Block id `n` → file `fire{year}_{n-1}.tif`. |
| `gee/README.md` | How to run the export, and the quirks kept on purpose. |
| `.github/workflows/fireExport.yml` | Manual actions: `check`, `export-dry-run`, `export`, `status`. |
| `.github/workflows/fireTiles.yml` | Manual tile build. Dry run on pull requests that touch `tasks/fireTiles/**`. |
| `tasks/fireTiles/build_tiles.sh`, `tasks/fireTiles/color.txt` | Tile build and baked colours. |
| `tasks/createBuiltTiles/`, `tasks/createBareTiles/`, `tasks/createCropTiles/` | VM tile builds. |

Fire tile workflow constants in `fireTiles.yml`: GDAL image `ghcr.io/osgeo/gdal:ubuntu-small-3.11.4`, `MAX_ZOOM` 9, source `gs://nature-watch-bucket/COGS/fire`, destination `gs://nature-watch-tiles/fire`.

## 4. Storage

Verified by `gcloud storage` IAM on 16 October 2026. Both buckets belong to GCP project **`nature-watch-387210`** (project name `nature-watch`). The `gcloud` configuration on this machine defaults to project `science-428407`, which is a different project.

| Bucket | Location | Purpose | Verified access | Intended access |
| --- | --- | --- | --- | --- |
| `gs://nature-watch-tiles` | `EUROPE-WEST4` | Public map PNGs. Fire: `fire/<year>/{z}/{x}/{y}.png`. Crops: `crop/` with a `{year}` query in the catalog. Built: `built/2023/` (single URL, not per year). | `roles/storage.objectViewer` for `allUsers`. | Public read. **Agreed** that map tiles stay public. |
| `gs://nature-watch-bucket` | `EU` (multi-region) | Source COGs. Fire: `COGS/fire/<year>/fire<year>_<n>.tif`. A test prefix `COGS/fire-test` was used to validate the 2024 export. | `roles/storage.objectViewer` for `allUsers`. Service account `gee-1-238@nature-watch-387210.iam.gserviceaccount.com` has `roles/storage.objectAdmin`. | **Proposed**, not confirmed: private. Tiles stay public; source COGs would be readable by Earth Engine and CI only. |

`public_access_prevention` is `inherited` on both buckets. GitHub Actions uses a secret named `GCP_SA_KEY` (analysis workflows). The app deploy uses `FLY_API_TOKEN` and `POSTHOG_TOKEN`. This document does not record secret values.

**Conflict.** The analysis README says the service account must read the COG bucket and write the tile bucket. IAM confirms the Earth Engine service account above is an object admin on the COG bucket. This document does not show which key is stored in `GCP_SA_KEY`, or that account's role on the tile bucket.

## 5. Development, tests, branches, deploy

**Implemented** in `naturewatch-app` `README.md` and `.github/workflows/fly.yml`:

- Feature and bugfix branches start from `develop` and merge back via pull request.
- A release is a pull request from `develop` into `main`.
- On every push, the Test suite runs: Docker compose, flake8, pytest unit and integration tests, `npx vitest run src/catalog`, and a Docker image build.
- Push to `develop` deploys Fly app `naturewatch` (`fly.toml`, workflow `--app naturewatch`).
- Push to `main` deploys Fly app `naturewatch-demo` (workflow only; `fly.toml` itself says `naturewatch`).

**Practised for v1.1.1 and v1.1.2, not written into the app README.** After the merge to `main`, a GitHub release is tagged from `main`, then a sync pull request brings that merge commit back into `develop`. Current release tag is v1.1.2 at `a0d5cfb`.

Analysis `main` has no app deploy. Fire workflows are started by hand (`workflow_dispatch`), except the fire-tile dry run on pull request. Built, bare, and crop workflows start on push.

## 6. Decisions

### Implemented

- Fire display tiles are a 1 km nearest-neighbour pyramid, zooms 0–9, about 25,000 tiles per year, built on a GitHub runner. The previous fire path built on the order of 1.6 million tiles on a VM. Reasoning: the counts already live on a 1 km grid, and the VM was costly.
- New fire years use `export_fire.py`, with the notebook's window length, scale, CRS, block file names, and Africa blocks, so years stay comparable.
- Two quirks stay until every year is regenerated together: 27 windows (the legend in `layers.json` still says 26), and the last window includes about 13 days of the next January. See `gee/README.md`.
- Block polygons use planar edges (`block_region` in `export_fire.py`). Geodesic edges changed the export extent. Checked for 2024 blocks 1 and 14 against the notebook files (documented in `gee/README.md`, not re-run for this blueprint).
- Fire colours are baked in `tasks/fireTiles/color.txt`. The app only caps zoom and sets nearest resampling.

### Agreed, not implemented

From the cropland discussion (GLAD annual croplands, https://glad.umd.edu/dataset/annual-croplands). Maryland cropland has not been added to either repo.

- Keep Google Cloud Storage as the store, because Earth Engine exports there.
- Keep a numerical source raster, separate from display tiles, so later statistics can be recomputed.
- The visual pyramid and the area numbers are different products. A max overview is for seeing sparse pixels when zoomed out. Area and percent come from counts of the original class pixels.
- Display tiles should carry the class value, with colour applied in the map client, so one tile set can have more than one ramp. Fire does not work this way today.
- Prebuild only bounded low zooms. Higher zooms wait until the view is worth the storage.
- Summary statistics for spaces (protected area, country, ecoregion, river catchment) are precomputed when a layer year is published and stored for lookup. A catalogue that compares many spaces does not calculate them in the browser.
- A 1 km or H3 grid may later speed up new or changing boundaries. It is not the official source for small spaces. Official space figures come from the source raster.
- On-demand tile serving (for example TiTiler) is a later option for close zoom, not the source of the catalogue.

### Proposed, not confirmed

- Make `nature-watch-bucket` private before large new rasters are stored there. Tiles would stay public.
- Postgres (hosted or otherwise) as the table for space statistics.
- Two colour ramps in the client (topographic and satellite) once tiles are unstyled values.
- Moving built, bare, and crop off VMs onto the fire-tile pattern. The analysis README states this direction; there is no schedule.
- Global fire, season-aware windows, and a coarser export than 30 m. Listed as next steps in `gee/README.md`.
- A pipeline status view, and moving the Mapbox public token out of the client source into a secret. Discussed earlier; not decided as work.

## 7. Gaps

**Implemented behaviour that is easy to misread**

- Fire legend text says the maximum count is 26. The export can reach 27.
- The Bare catalog entry is `coming-soon` and its tile URL is `.../built/2022/...`.
- Dams are `published` and the info subtitle in the catalog says "Coming soon".
- Crops in the catalog are 2015 and 2019 only. Selecting a later timeline year falls back to 2019.
- All, Mines, and Rivers are `coming-soon` and use placeholder tile URLs.
- Analysis README and `gee/README.md` disagree on whether the notebook or `export_fire.py` produces fire COGs.
- `fly.toml` names the test app. The production app name exists only in `fly.yml`.

**Operational notes from the fire 2025 run, not encoded**

- Earth Engine `status` reported some tasks `READY` after the COGs were already in the bucket. Files were checked directly before the tile build. The status command was not changed.
- Test COGs under `gs://nature-watch-bucket/COGS/fire-test` were left in place. Deletion was not confirmed.

**Unresolved**

- Whether source COGs should be private, and who besides the Earth Engine service account must read them.
- Where space statistics will live, and the exact list of spaces for the first catalogue.
- Which GLAD year and geographic extent to process first (Africa only, or global).
- Whether close zoom for cropland is prebuilt, on demand, or deferred.
- Which GCP project is billed for Earth Engine versus the buckets (`nature-watch-387210` holds the buckets; the CLI default is `science-428407`).
- Whether `naturewatch-gee` is still needed. It was not inspected.
