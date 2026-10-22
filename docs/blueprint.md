# Nature Watch — technical blueprint

Nature Watch helps people explore environmental pressures and natural landscapes. The current app focuses on Africa, with a longer-term ambition of global coverage and ecological assessment.

This document describes the working system and agreed direction. Commands and branches: the [app README](../README.md).

| Subject | Source of truth |
| --- | --- |
| How to read the published map | [docs/using-the-map.md](using-the-map.md) in this repo |
| What each map layer shows, and its limits | [docs/data.md](data.md) in this repo |
| The running system and the published contract: buckets, object paths, catalogue | [docs/blueprint.md](blueprint.md) in this repo |
| Dated inspection notes | [docs/blueprint-notes.md](blueprint-notes.md) in this repo |
| The first Sooty Earth release plan | [docs/sooty-earth-roadmap.md](sooty-earth-roadmap.md) in this repo |
| How a dataset becomes published objects | [docs/pipelines.md](https://github.com/marynvdl/naturewatch-analysis/blob/main/docs/pipelines.md) in marynvdl/naturewatch-analysis |
| The hand-edited layer catalog | [cookbook/recipes/](https://github.com/marynvdl/naturewatch-analysis/tree/main/cookbook/recipes) in marynvdl/naturewatch-analysis |
| How to run a step, and what that run cost | The step README in marynvdl/naturewatch-analysis |

*Updated 22 October 2026. The pipeline description moved to `docs/pipelines.md` in marynvdl/naturewatch-analysis that day. `nature-watch-bucket` access was checked again that day and made private. The Sooty Earth release rule and roadmap were accepted on 20 October.*

## 1. How the system fits together

| Repository | Responsibility |
| --- | --- |
| `marynvdl/naturewatch-app` | This repo keeps the web app, the map catalogue at `frontend/naturewatch/src/catalog/layers.json`, the database schema and access rules in `supabase/`, and the reads and writes the app itself makes. |
| `marynvdl/naturewatch-analysis` | Publishes rasters and map tiles. Its procedure is [`docs/pipelines.md`](https://github.com/marynvdl/naturewatch-analysis/blob/main/docs/pipelines.md). |

The app reads published objects and does not run the analysis. How a dataset becomes those objects is [`docs/pipelines.md`](https://github.com/marynvdl/naturewatch-analysis/blob/main/docs/pipelines.md) in marynvdl/naturewatch-analysis.

Fire is the pipeline that runs today: Earth Engine to `nature-watch-bucket`, then a GitHub runner to `nature-watch-tiles`. The crop, built, and bare virtual-machine tasks are in `archive/vm-tile-tasks/` in the analysis repo, and their workflows do not start a machine. Tree loss and 2020 tree height are served externally by Global Forest Watch; dams use a Mapbox tileset. Tree height tiles cover the globe. The other published layers keep their existing coverage.

The connection between data and app is defined by **published object paths** and the **layer catalogue** at `frontend/naturewatch/src/catalog/layers.json`.

The `sources`, `places`, and `facts` tables are in Supabase, and the FastAPI service is unchanged.

## 2. Storage and access

| Bucket | Contents | Access |
| --- | --- | --- |
| `gs://nature-watch-bucket` | Source rasters, including `COGS/fire/<year>/` and the cropland seed and sprout prefixes | Private since 22 October 2026. Public access prevention is enforced. `gee-1-238@nature-watch-387210.iam.gserviceaccount.com` has `roles/storage.objectAdmin`. |
| `gs://nature-watch-tiles` | Display tiles, including `fire/<year>/{z}/{x}/{y}.png` | Public read; keeping map tiles public is agreed |

Both buckets belong to GCP project `nature-watch-387210`. The inspected machine’s default project was `science-428407`; confirm the intended project before cloud operations. The Earth Engine billing project remains unresolved.

## 3. Behavior that must remain explicit

- **Dates:** when a layer lacks the selected year, the app uses its latest available earlier year. If every listed year is later, the layer is not requested, except a layer marked static, which stays visible on its latest listed year. Tree height is a static 2020 layer. A timeline selection does not guarantee that every layer represents that year. Crops currently list 2015 and 2019.
- **Fire processing:** FIRMS `T21` detections are counted in 14-day windows on a grid using scale 1,000 m in `EPSG:3857`, then exported as 30 m COGs in `EPSG:4326` across 25 Africa blocks.
- **Fire display:** GDAL resamples to the 1 km display grid, applies baked colors and creates XYZ PNG tiles for zooms 0–9. Zero is transparent; the app uses nearest-neighbor rendering.
- **Fire compatibility:** the current export uses 27 windows and includes about 13 days of the following January. These quirks were intentionally retained for comparability with previous years. Do not change the method for one year without addressing comparability.
- **Layer status:** placeholder URLs and “Coming soon” labels are not evidence of published data. The detailed reference lists current inconsistencies.

## 4. Development and release

For the app:

1. Create feature or bugfix branches from `develop` and merge back through a pull request.
2. Release through a pull request from `develop` to `main`.
3. The recent release practice adds a version tag on `main`, then syncs the release merge back into `develop` through a pull request. Latest recorded release: `v1.1.3`.

The app workflow runs tests and a Docker build on every push. Pushes to `develop` deploy Fly app `naturewatch`; pushes to `main` deploy `naturewatch-demo`.

Sooty Earth is built on `develop`. Do not open a pull request from `develop` into `main` until that public-site change is explicitly requested. naturewatch.space stays on the current release until then. The step-by-step plan is the [Sooty Earth roadmap](sooty-earth-roadmap.md).

In the analysis repository, fire export and fire tiles are started by hand, apart from the tile dry run on relevant pull requests.

Inspect workflow triggers before pushing. Obtain authorization before billable processing or production deployment. After an authorized long Earth Engine submission, record its identifiers, outputs and monitoring instructions rather than keeping the chat waiting.

## 5. Agreed direction, not yet implemented

The cropland discussion established the following direction:

- Keep Google Cloud Storage and retain numerical source rasters separately from display products.
- Separate **visual aggregation** from **analytical statistics**: maximum overviews preserve sparse features visually; area and percentage come from original class-pixel counts.
- Aim for class-value display tiles with client-side coloring. Current fire tiles are already colored and do not implement this design.
- Prebuild a bounded range of low zooms; choose the higher-zoom approach later.
- Precompute statistics for known spaces when publishing a layer year, then serve those results for catalogue comparisons.
- Consider a 1 km or H3 grid for flexible queries later. Official figures for small spaces should come from the source raster. On-demand tiling is a possible later delivery option.

The cropland seed objects are at `gs://nature-watch-bucket/seeds/cropland/glad/2024/v1/`. The sprout raster is `gs://nature-watch-bucket/sprouts/cropland/2024/v1/cropland-2024-zaf.tif`, with `collection.json` and `cropland-2024-zaf.json` in that folder. The 2015 and 2019 crop tiles stay as they are.

`frontend/naturewatch/src/catalog/layers.json` is what the map reads. A static STAC catalogue is a generated view of a recipe, written beside the sprout raster. The app does not read STAC.

Cropland facts for the 941 pilot places are stored for sprout `cropland-2024-v1`, method `area-weighted-spheroid-v1`.

Accepted for the first Sooty Earth release, and not yet built:

- The map layer for GLAD annual cropland 2024, clipped to South Africa. There is no annual-cropland entry in `layers.json`. It is separate from the 2015 and 2019 cropland snapshots.
- The interface is rebranded to Sooty Earth on `develop` before any production release. The sequence and done-when for each step are in the [roadmap](sooty-earth-roadmap.md).

The first places are terrestrial protected areas in South Africa with calculated `area_km2` of at least 10. Source rasters and tiles stay in Cloud Storage.

## 6. Decisions still needed

- Source rasters in `nature-watch-bucket` are private as of 22 October 2026. Map tiles stay public. Still to confirm on the next fire-tile run: the GitHub Actions identity can read the private bucket, and its write access to `nature-watch-tiles` was not rechecked.
- How close-zoom cropland will be served.
- Whether public map geometries are permitted under the WDPCA licence, or only stored statistics.
- The Earth Engine billing project and the continuing role of `naturewatch-gee`, which was not inspected.
- The production domain, and when the GitHub repositories are renamed. Bucket names, Fly app names, and the GCP project stay as they are through that rename.

Other proposals, known inconsistencies and the exact inspected commits remain in [Technical reference](blueprint-notes.md). Update this blueprint when the architecture or an accepted decision changes; keep experiments and longer discussions in Notion.
