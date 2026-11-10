# Task 02 — Places PMTiles

Parcel: [Places Tiles](../../parcels/places-tiles.md).

Repository: naturewatch-analysis. Start only after Places Tiles task 01 has merged.

## Goal

Initiate a new pipeline, the Places Pipeline. Update docs (especially [pipelines.md](https://github.com/marynvdl/naturewatch-analysis/blob/main/docs/pipelines.md) and the diagram within it) accordingly. Build one PMTiles archive from the authoritative places, prove it on the current South Africa rows, and publish it to `nature-watch-tiles`. This should be set up and reproducible as to one day be automatically ran with an orchestrator.

## Facts already stored

The app database holds terrestrial protected areas in South Africa of at least 10 km². `places.geom` is not granted to `anon` or `authenticated`. Cropland facts exist for sprout `cropland-2024-v1`, method `area-weighted-spheroid-v1`. The map still draws `pilot_place_map` until task 03 in naturewatch-app. Raster tiles stay individual XYZ files. This archive is the places display copy only.

## Do this

- Check and preview style decisions with me.
- Design a reproducible way of having this Places tiles generated, called the Places pipeline. In the future, we may create more PMTiles for other Place types.
- Read place geometries and attributes from the app database. Do not read `places.geom` through the anon key.
- Write one PMTiles archive at `gs://nature-watch-tiles/places/protected-areas/v1/places.pmtiles`.
- Each feature carries `places.id`, `area_km2`, and cropland percent when that fact exists. Rebuild the archive when those copied fields change.
- Generalize so the largest places are visible at a world view and smaller places appear as you zoom in.
- Prove the archive on the current South Africa rows before any hosted publish.
- Record the run in a step README in this repo: bytes stored, wall time, peak memory, zoom range, and how to cancel the job. Do not copy that procedure into naturewatch-app.
- Before any hosted publish, record the expected cost and wait for approval. After an authorized run, record the task id, output, status check, and how to cancel it, then return. Do not wait in the chat for the job.
- Ask me when you're not 90% sure.

## Do not

- Do not import the global WDPCA file. That is task 04 in naturewatch-app.
- Do not grant `places.geom` to the app’s anon role.
- Do not convert raster tiles to PMTiles.
- Do not start a virtual machine or a Batch job until it is approved.
- Do not start task 05.

## Done when

- The archive exists at that object path, or this pull request stops before the hosted publish and records how to run it.
- A local or small proof shows place ids, areas, and cropland percent on the current South Africa rows.
- The step README has the run cost, or the expected cost waiting for approval.
- The work is on a branch from `main`, in one pull request into `main`. Report the pull request address. Do not merge it.

## How to work

Branch from `main`. Do this task only. Explain billable processing and get approval before starting it. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
