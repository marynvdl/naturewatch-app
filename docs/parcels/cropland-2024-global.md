# Parcel: Cropland 2024 global

The first global run of the cropland pipelines. Version 1 stays the South Africa run and the cost baseline. This parcel publishes version 2: the global raster, one PMTiles archive, and cropland facts for the stored places. The run is the benchmark for what one global layer costs.

## Goal

Publish GLAD annual cropland 2024 for the world, and show it on the map. A person can turn on the cropland layer and see it worldwide. A person can open a stored place and see that place’s cropland fact.

Follow the South Africa practice: class-value pixels, colour in the client, zooms 0–12, and facts counted from the sprout raster with method `area-weighted-spheroid-v1`. The display copy is one PMTiles archive. Version 1 tiles are individual PNG files under `gs://nature-watch-tiles/cropland/2024/v1/`. This run writes `gs://nature-watch-tiles/cropland/2024/v2/cropland.pmtiles` and leaves that prefix alone.

## Map and places

The map stays Mapbox. Class 1 is orange (`#e59139`). Class 0 and nodata stay clear. Closer than zoom 12 enlarges zoom 12 with nearest resampling. The 2015 and 2019 crop tiles stay at `crop/`.

There is no country clip. A 10° tile the publisher does not provide is nodata. Inside a tile, source value 100 is cropland and source value 0 is other land, the same mapping as the South Africa recipe.

Opening a place reads the fact from Supabase. Square kilometres show to two decimal places and percent to one. A place with no fact still says that it is not stored. The profile, the popup, and the list keep sprout `cropland-2024-v1` until task 08 points them at sprout `cropland-2024-v2`.

Objects:

- Seed: `gs://nature-watch-bucket/seeds/cropland/glad/2024/v2/`
- Sprout: `gs://nature-watch-bucket/sprouts/cropland/2024/v2/cropland-2024.tif`, id `cropland-2024-v2`
- Tiles: `gs://nature-watch-tiles/cropland/2024/v2/cropland.pmtiles`

## Cost and a later orchestrator

Each billable step records bytes stored, wall time, and peak memory in that step’s README in naturewatch-analysis. Tile steps also record the zoom range and the archive bytes. The facts step records the place count and whether a few large polygons dominate the time. Note any virtual machine left running, and for how long.

Before a transfer or a Batch job, record the expected cost and wait for approval. After an authorized run, record the job id, the output, how to check it, and how to cancel, then return. The figures stay in the analysis repo.

The new recipe is the only catalog edited by hand for this run. The South Africa recipe stays the record of version 1. Each step is a command that reads the new recipe. The global fetch is a Storage Transfer Service job whose URL list comes from that recipe, then a GDAL check next to the bucket. This parcel adds no orchestrator and no GitHub workflow that starts on push. The task order below is the sequence a later orchestrator would call.

Tile resampling is chosen on a sample. Task 04 builds that sample. Task 05 starts only after the sample is approved. The South Africa tiles used `max`. `q3` is still an open choice.

## Left for later

- An orchestrator that submits these commands.
- Deleting the South Africa version 1 objects.
- Republishing the places PMTiles archive so the boundary filter copies sprout `cropland-2024-v2`. Places Tiles task 05 copies sprout `cropland-2024-v1`. Opening a place reads Supabase, so this parcel does not wait for that republish.
- A production release. Merge app work into `develop` only.

## Tasks

Do one task at a time, in this order. Start a task only after the one above it has merged. Each task is one branch and one pull request into `develop` in naturewatch-app, or into `main` in naturewatch-analysis. When a task has merged, move its file to `docs/archive/tasks/` in that repo, and point the tick at that copy.

- [ ] [task-01-cropland-global-2024-recipe.md](https://github.com/marynvdl/naturewatch-analysis/blob/docs/cropland-global-2024-tasks/docs/tasks/task-01-cropland-global-2024-recipe.md) — naturewatch-analysis
  - *Goal:* Add the global recipe beside the South Africa recipe, name every GLAD 10° tile, and write the expected cost. No transfer and no Batch job.
- [ ] [task-02-cropland-global-2024-seed.md](https://github.com/marynvdl/naturewatch-analysis/blob/docs/cropland-global-2024-tasks/docs/tasks/task-02-cropland-global-2024-seed.md) — naturewatch-analysis
  - *Goal:* After approval, transfer the tiles named in the recipe into the version 2 seed path and check them. Record the run cost.
- [ ] [task-03-cropland-global-2024-sprout.md](https://github.com/marynvdl/naturewatch-analysis/blob/docs/cropland-global-2024-tasks/docs/tasks/task-03-cropland-global-2024-sprout.md) — naturewatch-analysis
  - *Goal:* After approval, write the version 2 Cloud Optimized GeoTIFF and its static STAC files. Record the run cost.
- [ ] [task-04-cropland-global-2024-tile-sample.md](https://github.com/marynvdl/naturewatch-analysis/blob/docs/cropland-global-2024-tasks/docs/tasks/task-04-cropland-global-2024-tile-sample.md) — naturewatch-analysis
  - *Goal:* Build the tiles step as one PMTiles archive. Prove resampling on a small window and stop for approval. Do not build the global archive.
- [ ] [task-05-cropland-global-2024-pmtiles.md](https://github.com/marynvdl/naturewatch-analysis/blob/docs/cropland-global-2024-tasks/docs/tasks/task-05-cropland-global-2024-pmtiles.md) — naturewatch-analysis
  - *Goal:* After the sample is approved, write zooms 0–12 to the version 2 PMTiles object. Record the run cost.
- [ ] [task-06-cropland-global-2024-facts.md](https://github.com/marynvdl/naturewatch-analysis/blob/docs/cropland-global-2024-tasks/docs/tasks/task-06-cropland-global-2024-facts.md) — naturewatch-analysis
  - *Goal:* Write cropland facts for every stored place on sprout `cropland-2024-v2`. Record the run cost.
- [ ] [task-07-cropland-global-2024-on-the-map.md](../tasks/task-07-cropland-global-2024-on-the-map.md) — naturewatch-app
  - *Goal:* Draw the global cropland layer from the published PMTiles archive. Keep class colouring in the client.
- [ ] [task-08-cropland-global-2024-place-facts.md](../tasks/task-08-cropland-global-2024-place-facts.md) — naturewatch-app
  - *Goal:* Show sprout `cropland-2024-v2` on the place profile, the popup, and the list.

## Done when

A person can view the global cropland tiles on the web map. A person can open a place and see its cropland fact for sprout `cropland-2024-v2`. The tiles are one PMTiles object. The resampling sample was approved before the global tile job. Costs are in the step READMEs in naturewatch-analysis. The catalog tests still pass. Each app task is checked in the browser on a wide screen and a narrow screen. No production deploy.
