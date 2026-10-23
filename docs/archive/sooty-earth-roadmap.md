# Sooty Earth roadmap

Archived 23 October 2026. This is the plan accepted on 20 October 2026, not a list of remaining work. Steps 1–6 were carried out. The interface rebrand (step 7) and the production release (step 8) were not. New work is a parcel in `.cursor/parcels/`.

Do not follow the “one step per branch” instructions below. The production freeze is unchanged: do not open or merge a pull request from `develop` into `main` until a production release is explicitly requested. That rule lives in `.cursor/rules/sooty-earth.mdc`. The running system is the [blueprint](../blueprint.md).

## Release rule

Do not open or merge a pull request from `develop` into `main` until a production release is explicitly requested.

`develop` deploys Fly app `naturewatch`. `main` deploys Fly app `naturewatch-demo` (naturewatch.space). Work in this roadmap merges into `develop` only. naturewatch.space stays on the current release until the production step below is explicitly requested.

## How to use this

One step per branch and per chat. Merge it into `develop` when its done-when is met, then start the next step. Pipelines stay in `marynvdl/naturewatch-analysis`. App, database migrations, catalog, and interface stay in this repository.

In the analysis repository, the crop, built, and bare virtual-machine tasks are retired. Their workflows do not start a machine, and the folders are in `archive/vm-tile-tasks/`. `tasks/fireTiles/` builds fire tiles on a GitHub-hosted runner, started by hand. New pipeline code lives outside `tasks/` until a workflow is added on purpose, started by hand. Do not push a commit that restores the old virtual-machine workflows: GitHub runs the workflow in the commit you push.

## Pilot

- Places: terrestrial protected areas in South Africa with calculated area of at least 10 km² (`REALM = Terrestrial`, `ISO3 = ZAF`, `area_km2 >= 10`). The October 2026 file is the World Database on Protected and Conserved Areas. An earlier note counted 941 places with `GIS_AREA >= 10`; re-count on import using calculated `area_km2`.
- Layer: [GLAD annual cropland](https://glad.umd.edu/dataset/annual-croplands) for 2024. Pixel value 100 means cropland. This is a different product from the 2015 and 2019 cropland snapshots already on the map.
- Facts: square kilometres, percent, and valid coverage, calculated from the source raster and stored for that layer version.
- The public map may draw the stored protected-area boundaries for non-commercial use. The app does not offer a download. Attribution, release month, and a Protected Planet link are required wherever protected-area information is shown.

## Repositories

Keep both repositories. Rename them to match Sooty Earth only when the production step is requested. Leave bucket names, Fly app names, and the GCP project as they are.

## Steps

| Step | Where | Done when | Estimate |
| --- | --- | --- | --- |
| 1. Records | This repo, applied to Supabase | Places and facts tables exist. The pilot places are imported. Geometries are not world-readable. A query returns the filtered set, with the WDPCA release month recorded. | 1–2 days |
| 2. Cookbook | Analysis repo | One YAML recipe names the seed and sprout paths for cropland 2024. The sprout path is the raster later steps read. Those prefixes exist. The recipe is the only catalog edited by hand. | 0.5–1 day |
| 3. Seed | Analysis repo | The 10° GLAD tiles that cover South Africa are downloaded and checked: value 100, 0.00025° grid, WGS84. A South Africa clip is stored under the recipe path. | 1–2 days, plus download time |
| 4. Sprout | Analysis repo | One versioned Cloud-Optimized GeoTIFF is written, with version, class values, nodata, and CRS. A static STAC Collection and Item are generated from the YAML recipe. Oil-palm fusion is not built. | 0.5–1 day |
| 5. Facts | Analysis repo, writing to Supabase | km², percent, and valid coverage are stored for the pilot places. A few parks match an independent check. Overlapping areas have a stated rule before any places are added together. | 2–3 days |
| 6. Tiles and a plain place view | Both repos | Class-value tiles for low zooms are on `nature-watch-tiles`. The catalog has a new annual-cropland layer. On the develop app, a protected area can be opened and shows the stored figure. Colour is applied in the client. | 3–5 days |
| 7. Interface and rebrand | This repo | The develop app presents Sooty Earth: name, navigation, landing, and map frame in the agreed visual direction. The place view uses real pilot figures only. Sign-in, ecoregions, countries, and global headline numbers are out of this step. | 4–8 days |
| 8. Production | Release, only when requested | A pull request from `develop` into `main` deploys `naturewatch-demo`. The new domain is attached as part of that request. | 0.5–1 day once the domain is ready |

Step 7 comes after the plain place view, and before any production release. The visual target is the Sooty Earth landing mock reviewed on 20 October 2026. That mock is a design reference, not a data source: its headline totals are not figures to publish.

A static STAC catalog is a generated view of the recipe, written when the sprout raster is published. It is not a second inventory to maintain, and this release does not add a STAC API. Global protected areas, global cropland, accounts, corrections, PMTiles, and a pipeline orchestrator come after this release, each with its own decision.

## Cost record

The numbers for a run stay in that step's README in marynvdl/naturewatch-analysis. Do not copy them into this repo. Each note should cover, for the area it ran: bytes stored, wall time, and peak memory. Tile steps also record zoom range, tile count, and tile bytes. The facts step records place count and wall time, and whether a few large polygons dominate that time. Note any virtual machine left running, and for how long.

Those figures are how a later global year is estimated. Storage scales from the sprout raster’s bytes per km². Facts scale from time per place, with large polygons called out separately. Low-zoom tiles scale with land area and zoom, not with the source pixel count. Map views are a separate, ongoing egress cost, and the pilot will not show it.

## Supabase

The Supabase project is created in the dashboard, in a European region. The CLI is signed in once on the machine that applies migrations. Agents write migrations in this repository and apply them with the CLI after review. The service-role key stays out of git and out of the frontend.
