# Task 01 — Cropland global recipe

Parcel: [Cropland 2024 global](../../parcels/cropland-2024-global.md).

Repository: naturewatch-analysis. Start from `main`. This is the first task in that parcel.

## Goal

Add the global recipe beside the South Africa recipe, name every GLAD 10° tile, and write the expected cost. No transfer and no Batch job.

## Facts already stored

`cookbook/recipes/cropland-2024.yaml` is the South Africa run. Its seed is six 10° tiles and a mainland clip at `gs://nature-watch-bucket/seeds/cropland/glad/2024/v1/`. The sprout is `gs://nature-watch-bucket/sprouts/cropland/2024/v1/cropland-2024-zaf.tif`, id `cropland-2024-v1`. Tiles are XYZ PNG files at `gs://nature-watch-tiles/cropland/2024/v1/`. The seed README records those six tiles and the clip as 150,779,952 bytes in the prefix.

`docs/pipelines.md` already says a later global year fetches with a Storage Transfer Service job started by hand, from a URL list built from the recipe, into that recipe’s seed path. A GDAL job next to the bucket then checks the grid and the class values. There is no orchestrator.

## Do this

- Add `cookbook/recipes/cropland-2024-v2.yaml`. Leave `cropland-2024.yaml` as the version 1 record.
- Set the seed id to `seed-cropland-glad-2024-v2` and the seed path to `gs://nature-watch-bucket/seeds/cropland/glad/2024/v2/`.
- Set the sprout id to `cropland-2024-v2` and the sprout path to `gs://nature-watch-bucket/sprouts/cropland/2024/v2/cropland-2024.tif`. Classes stay 1 cropland, 0 other land, 255 nodata. Source 100 maps to 1, source 0 maps to 0.
- Set the tiles path to `gs://nature-watch-tiles/cropland/2024/v2/cropland.pmtiles`, zooms 0–12, scheme `pmtiles`, encoding class-value. Leave resampling unset until task 04. The South Africa recipe used `max`. `q3` is still open.
- Name every 10° tile the publisher offers for 2024. Confirm one tile’s codes before treating the list as complete. Where the publisher’s page and the sample disagree, the recipe keeps the sample.
- There is no country clip. A tile the publisher does not provide is absent. Inside a tile, 0 stays other land.
- Write the expected storage from the version 1 tile bytes in `seed/README.md`: bytes per 10° tile, times the tile count, plus a note that the sprout and the PMTiles archive are later steps. Record it in `cookbook/README.md`. Update the status table in `docs/pipelines.md`.
- Keep the recipe the only hand-edited catalog. Later steps read this file. They do not grow a second inventory.

## Do not

- Do not download the tile set, start a Storage Transfer, or submit a Batch job.
- Do not change the version 1 object paths.
- Do not choose the tile resampling. Task 04 does that.
- Do not add a GitHub workflow that starts on push.
- Do not start task 02 until the expected cost is written down.

## Done when

- The global recipe names the version 2 paths and every source tile.
- `python -m pytest cookbook` passes.
- The expected seed storage is in `cookbook/README.md`, scaled from the version 1 tile bytes.
- The work is on a branch from `main`, in one pull request into `main`. Report the pull request address. Do not merge it.

## How to work

Branch from `main`. Do this task only. Explain billable processing and get approval before starting it. This task should not start any. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
