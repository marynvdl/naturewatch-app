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

The `sources`, `places`, and `facts` tables are in Supabase. The places page reads `pilot_places` and `facts` in the browser with the anon key. The Places list on the map reads `pilot_place_window`, at most 50 rows, and optional extent through `pilot_places_in_extent`. Filter charts read `pilot_place_filter_stats`. None of those reads return `places.geom`. The FastAPI service does not read these tables.

## 2. Storage and access

| Bucket | Contents | Access |
| --- | --- | --- |
| `gs://nature-watch-bucket` | Source rasters, including `COGS/fire/<year>/` and the cropland seed and sprout prefixes | Private since 22 October 2026. Public access prevention is enforced. `gee-1-238@nature-watch-387210.iam.gserviceaccount.com` has `roles/storage.objectAdmin`. |
| `gs://nature-watch-tiles` | Display tiles, including `fire/<year>/{z}/{x}/{y}.png` and `cropland/2024/v1/{z}/{x}/{y}.png` | Public read; keeping map tiles public is agreed |

Both buckets belong to GCP project `nature-watch-387210`. The inspected machine’s default project was `science-428407`; confirm the intended project before cloud operations. The Earth Engine billing project remains unresolved.

## 3. Behavior that must remain explicit

- **Dates:** when a layer lacks the selected year, the app uses its latest available earlier year. If every listed year is later, the layer is not requested, except a layer marked static, which stays visible on its latest listed year. Tree height is a static 2020 layer. A timeline selection does not guarantee that every layer represents that year. Crops currently list 2015 and 2019. Cropland lists 2024 only, so a year before 2024 does not request it, and a later year still shows 2024.
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
- Aim for class-value display tiles with client-side coloring. Current fire tiles are already colored and do not yet implement this design.
- Prebuild a bounded range of zooms 0 to 12 at most to keep computational costs low; a zoom of 13 can later be considered.
- Published tiles are individual XYZ files on `nature-watch-tiles`. PMTiles for a later pipeline is not built.
- Precompute statistics for known spaces when publishing a layer year, then serve those results for catalogue comparisons.

The cropland seed objects are at `gs://nature-watch-bucket/seeds/cropland/glad/2024/v1/`. The sprout raster is `gs://nature-watch-bucket/sprouts/cropland/2024/v1/cropland-2024-zaf.tif`, with `collection.json` and `cropland-2024-zaf.json` in that folder. The 2015 and 2019 crop tiles stay as they are.

`frontend/naturewatch/src/catalog/layers.json` is what the map reads. A static STAC catalogue is a generated view of a recipe, written beside the sprout raster. The app does not read STAC.

Cropland facts for the 941 pilot places are stored for sprout `cropland-2024-v1`, method `area-weighted-spheroid-v1`.

The catalog layer `cropland` publishes that 2024 product for South Africa. Its tiles are class values at `gs://nature-watch-tiles/cropland/2024/v1/{z}/{x}/{y}.png`, zooms 0–12. The client colours class 1 and leaves class 0 clear. The tile bucket allows the develop app and local dev (`http://localhost:5173` and `http://127.0.0.1:5173`) to read those pixels. Closer than zoom 12 enlarges the zoom 12 tiles. `/places` lists the pilot protected areas. `/places/:id` shows the name, the stored cropland square kilometres and percent, the WDPCA release month, attribution, and a Protected Planet link. **Places** on the map draws the stored boundary from the `pilot_place_map` table. The `places.geom` column itself stays ungranted. A click shows the name, cropland figure, release month, attribution, and Protected Planet link. The app does not offer a polygon download. The page and the overlay need `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time. The develop deploy reads those from GitHub secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

Accepted for the first Sooty Earth release, and not yet built:

- The interface is rebranded to Sooty Earth on `develop` before any production release. That work is a parcel. The old step list is archived.

The first places are terrestrial protected areas in South Africa with calculated `area_km2` of at least 10. Source rasters and tiles stay in Cloud Storage.

## 6. Decisions still needed

- Source rasters in `nature-watch-bucket` are private as of 22 October 2026. Map tiles stay public. Still to confirm on the next fire-tile run: the GitHub Actions identity can read the private bucket, and its write access to `nature-watch-tiles` was not rechecked.
- For cropland: choose between resampling of `q3` or `max`. 
- The Earth Engine billing project and the continuing role of `naturewatch-gee`, which was not inspected.
- The production domain, and when the GitHub repositories are renamed. Bucket names, Fly app names, and the GCP project stay as they are through that rename.

Update this blueprint when a table, an object path, or the way the app reads a layer changes. Keep experiments and longer discussions in Notion.
