# Task 04 — Cropland tile sample

Archived. This task is not active.

Parcel: [Cropland 2024 global](../parcels/cropland-2024-global.md).

Repository: naturewatch-analysis. Start only after task 03 has written the sprout.

## Status

Completed 2 November 2026. Approved resampling: **`q3`** on `cookbook/recipes/cropland-2024-v2.yaml`. Pull request: https://github.com/marynvdl/naturewatch-analysis/pull/18 (merge when ready). Task 05 is next in a separate chat.

## Goal

Build the tiles step as one raster PMTiles archive. Prove it on a small window under three resamplings, `max`, `q3`, and nearest neighbour, and stop for approval. Do not build the global archive.

## Facts already stored

Task 03 writes one Sprout COG per seed tile under `gs://nature-watch-bucket/sprouts/cropland/2024/v2/tiles/`, full-resolution classes and no overviews, and the collection VRT `gs://nature-watch-bucket/sprouts/cropland/2024/v2/cropland-2024.vrt`. The recipe's `sprout.path` is that VRT. Read the VRT, not a single `cropland-2024.tif`, which will not exist. The global recipe's tile path is `gs://nature-watch-tiles/cropland/2024/v2/cropland.pmtiles`. Resampling on that recipe is unset. The South Africa tiles used `max`. `q3` is still open. Those version 1 tiles are individual XYZ PNG files, gray class values plus alpha, zooms 0–12. Colour is applied in the client.

Because the sprout has no overviews, the Tiles step owns resampling, and it is the only place the choice is made.

`tiles/cropland.py` reads the South Africa sprout and writes `{z}/{x}/{y}.png` with a hand-started Batch job. `render_tile` warps each tile from the source. That is fine at zoom 12. At low zooms one tile would read most of the planet. `build` can write a local directory and does not upload. The version 1 run wrote 23,467 tiles and 28,294,128 bytes for South Africa alone.

GDAL 3.11's PMTiles driver writes vector data only. It cannot write a raster archive. The raster archive is written with the `pmtiles` Python package's `Writer`, one PNG per tile, in tile id order. Add that package to the tiles requirements.

The places pipeline writes one local PMTiles file and a `preview.html` that is served with HTTP Range requests. A plain static server often returns the whole file and PMTiles then fails.

## Do this

- Change the global tiles command so it writes one raster PMTiles archive of class values, not a folder of PNG files. Encode tiles with the existing PNG code and write them with the `pmtiles` `Writer`. Keep the version 1 XYZ command working for the South Africa recipe.
- Build the pyramid bottom-up. Render the top zoom, 12, from the sprout. Build each lower zoom from its four child tiles. Do not warp every tile from the source at every zoom. The sample must use this method, because the global run will.
- Define the three resamplings on the pyramid, nodata staying empty:
  - `max`: the parent cell is the maximum of the valid children. This is exact, and one cropland pixel survives in a coarse cell.
  - `q3`: say how it is computed. A q3 of q3 values from children is an approximation of a q3 taken over the source pixels. Show the difference on the window, for example by computing q3 straight from source at one low zoom for comparison, and report it.
  - `nearest`: the parent cell takes one child pixel. Cropland that is not that pixel disappears at coarse zoom. Show how much cropland area each zoom keeps compared with zoom 12.
- Build three local samples from a small window of the version 2 sprout, one per resampling. Zooms 0–12 for that window only. Pick a window with fields and with a coast or edge, so nodata, cropland, and other land all appear. Nodata stays empty.
- Report per sample: bytes, tile count, wall time, peak memory, and the share of zoom 12 cropland pixels still visible at zooms 8, 6, and 4.
- Serve the samples the way the places preview does, so Range requests work. Show all three on the same window and stop for approval. Also check the archive in Mapbox GL JS, the library the app uses, since the app task must read this raster archive with it. Say what happens if it cannot read it.
- Estimate the global archive from the samples and from the version 1 README, as tiles, bytes, and hours. State the assumptions. The version 1 job did about 25 tiles a second on a spot `e2-standard-2` and about 28 MB for South Africa. Land with cropland is a larger share worldwide, so do not scale by area alone. Give a range.
- When one resampling is approved, write it on the global recipe. Until then the recipe field stays unset. The allowed values are `max`, `q3`, and `nearest`.
- Record the sample in `tiles/README.md`: window, bytes, wall time, peak memory, the three-way comparison, and the approval. Update the status table in `docs/pipelines.md`. A local sample has no cloud cost. Say so.

## Do not

- Do not build or upload the global archive. Task 05 does that.
- Do not upload the sample to `nature-watch-tiles`.
- Do not delete the version 1 PNG prefix.
- Do not add a GitHub workflow that starts on push.
- Do not use the GDAL PMTiles driver for the raster archive.
- Do not start task 05 until the resampling is approved and written on the recipe.

## Done when

- A local preview shows the same window under `max`, `q3`, and `nearest`.
- The comparison figures and the global estimate are in `tiles/README.md`.
- The approved resampling is on the global recipe, or this pull request is waiting on that approval and says so.
- The global PMTiles object does not exist yet.
- `python -m pytest tiles cookbook` passes.
- The work is on a branch from `main`, in one pull request into `main`. Report the pull request address. Do not merge it.

## How to work

Branch from `main`. Do this task only. Explain billable processing and get approval before starting it. This sample stays on the machine that builds it. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
