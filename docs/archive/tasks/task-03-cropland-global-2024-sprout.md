# Task 03 — Cropland global sprout

Archived. This task is not active.

Parcel: [Cropland 2024 global](../parcels/cropland-2024-global.md).

Repository: naturewatch-analysis. Start only after task 02 has finished the seed.

## Goal

After approval, write the version 2 Cloud Optimized GeoTIFF and its static STAC files. Record the run cost.

## Facts already stored

Task 02 puts the checked GLAD tiles at `gs://nature-watch-bucket/seeds/cropland/glad/2024/v2/`. The global recipe names sprout `cropland-2024-v2` at `gs://nature-watch-bucket/sprouts/cropland/2024/v2/cropland-2024.tif`.

`sprout/cropland.py` reads the South Africa clip, remaps `0` to `0`, `100` to `1`, and `255` to `255`, and writes one COG plus a static STAC Collection and Item. Overviews use maximum. Nodata is ignored, so one cropland pixel survives in a coarse cell. Area counts use the full-resolution pixels. The published run is a hand-started Batch job in `europe-west1` on a spot `e2-standard-2` with a 30 GB disk. The version 1 COG is 39,337,060 bytes. Batch deletes the virtual machine when the task ends.

There is no country clip on the global seed. The sprout mosaics the checked tiles. Absent tiles stay nodata. Values other than the recipe’s `from_seed` map stop the run.

## Do this

- Extend `sprout/cropland.py` so `submit` reads the global recipe, mosaics the seed tiles, remaps them with `from_seed`, and writes the COG and the two STAC files to the sprout path. Keep the version 1 command working for the South Africa recipe.
- Overviews stay maximum, with nodata ignored, matching the version 1 sprout.
- Estimate disk and memory before submit. The version 1 job’s 30 GB disk was sized for a 39 MB COG. Say what the global job needs, then wait for approval.
- Use a spot machine in `europe-west1`. Delete the scratch copies. Batch must delete the virtual machine when the task ends.
- After an authorized run, record the job id, the output, how to check status, and how to cancel (`gcloud batch jobs delete`), then return.
- Record the finished run in `sprout/README.md`: bytes stored, wall time, peak memory, and that no virtual machine was left running. Update the status table in `docs/pipelines.md`.

## Do not

- Do not build map tiles. Task 04 builds a sample. Task 05 builds the global archive.
- Do not overwrite `cropland-2024-zaf.tif`.
- Do not add a GitHub workflow that starts on push.
- Do not submit the Batch job until the expected cost is approved.

## Done when

- The version 2 COG and the two STAC files are at the sprout path, or this pull request stops before the Batch job and records how to run it.
- The COG is `EPSG:4326`, `0.00025°`, with class values 1, 0, and nodata 255.
- `python -m pytest sprout cookbook` passes.
- `sprout/README.md` has the run cost, or the expected cost waiting for approval.
- The work is on a branch from `main`, in one pull request into `main`. Report the pull request address. Do not merge it.

## How to work

Branch from `main`. Do this task only. Explain billable processing and get approval before starting it. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
