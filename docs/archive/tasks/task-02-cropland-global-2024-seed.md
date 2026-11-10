# Task 02 — Cropland global seed

Archived. This task is not active.

Parcel: [Cropland 2024 global](../parcels/cropland-2024-global.md).

Repository: naturewatch-analysis. Start only after task 01 has merged.

## Goal

After approval, transfer the tiles named in the recipe into the version 2 seed path and check them. Record the run cost.

## Facts already stored

Task 01 adds `cookbook/recipes/cropland-2024-v2.yaml`. The seed path is `gs://nature-watch-bucket/seeds/cropland/glad/2024/v2/`. The South Africa seed stays at `seeds/cropland/glad/2024/v1/`.

`seed/cropland.py` downloads tiles on a laptop in small ranges, checks them, cuts a mainland clip, and uploads. That laptop path is the version 1 run. `docs/pipelines.md` says the global fetch is a Storage Transfer Service job in project `nature-watch-387210`, started by hand, from a URL list built from the recipe. The transfer does not check pixels. A GDAL job next to the bucket checks the grid and the class values.

Version 1 checks, from `seed/README.md`: geographic CRS `EPSG:4326`, pixel size `0.00025°`, uint8, cropland value `100` present, no pixel value other than the codes in the recipe, and the source nodata flag unset.

## Do this

- Ask me when you're not 90% sure.
- Extend `seed/cropland.py` so the global recipe is a command that reads the recipe. One command builds the URL list and submits the Storage Transfer into `seed.path`. One command submits the GDAL check next to the bucket. Keep the version 1 laptop command working for `cropland-2024.yaml`.
- The check matches the version 1 grid and class rules. There is no country clip and no clip file. A listed tile that fails the check stops the run.
- Before the transfer, restate the expected bytes from task 01 and wait for approval.
- After an authorized run, record the transfer job id, the check job id, the output, how to check status, and how to cancel. Then return. Do not wait in the chat for the job.
- Record the finished run in `seed/README.md`: bytes stored, wall time, peak memory, tile count, and that no virtual machine was left running. Update the status table in `docs/pipelines.md`.

## Do not

- Do not download the global tile set to a laptop.
- Do not write a sprout raster. Task 03 does that.
- Do not delete or overwrite the version 1 seed.
- Do not add a GitHub workflow that starts on push.
- Do not start the transfer or the check until the expected cost is approved.

## Done when

- The version 2 seed prefix holds the checked tiles named in the recipe, or this pull request stops before the transfer and records how to run it.
- `python -m pytest seed cookbook` passes.
- `seed/README.md` has the run cost, or the expected cost waiting for approval.
- The work is on a branch from `main`, in one pull request into `main`. Report the pull request address. Do not merge it.

## How to work

Branch from `main`. Do this task only. Explain billable processing and get approval before starting it. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
