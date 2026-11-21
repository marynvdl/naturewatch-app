# Task 02 — Buildings 2023 seeds

Parcel: [Buildings 2023](../parcels/buildings-2023.md).

Repository: naturewatch-analysis. Start from `main`, after task 01 has merged.

## Goal

After approval, write the Google seed with Earth Engine exports and the TEMPO seed with one Batch job, and check both against `cookbook/recipes/buildings-2023-v1.yaml`. Record the run cost.

Decided 17 November 2026 by the user:

- **TEMPO is stored as mosaics.** Nearly all of the cost of a Storage Transfer of 822,199 small tiles is the write charge per object, about $8. Instead one Batch job downloads the tiles from Microsoft's server, checks each one, and writes one COG per zoom-4 Web Mercator tile. The mosaics keep TEMPO's grid and values unchanged. There are at most 256 objects. All tiles in the index are kept, including those under Google's area.
- **One Batch job checks both seeds,** as for the cropland seed: a spot `e2-standard-2` in `europe-west1`. It reads every object in the bucket. No seed is downloaded to the laptop.

## Facts already stored

- The recipe names the grid (EPSG:4326, 0.00025°, origin −180, 90), both seed paths and ids, the Earth Engine collection, the TEMPO index, its `url_list_sha256`, the URL pattern, and both nodata values. The Google seed is uint8, value ÷ 250, 255 where Google has no data. It is exported per 10° block that meets a Google 2023 tile, 145 blocks.
- `buildings/ee_box.py --value mean` builds the seed value for one box. The export uses the same image.
- `cookbook/README.md` holds the expected cost: 60–90 EECU-hours on the noncommercial project `nature-watch-387210`, which is not billed, and 5–20 GB of Google COGs. TEMPO is about 11 GB of source tiles. Its Storage Transfer figures are replaced by this task's route.
- `gee/fire/export_fire.py` is the pattern for an export script with `plan`, `check`, `export` and `status`. `seed/cropland.py` and `seed/README.md` are the pattern for submitting a Batch check, and for its run record.
- On 16 November 2026, `earthengine authenticate` worked on the laptop for task 01.

## Do this

1. **Google export script.** `gee/buildings/export_google.py`, with `plan`, `check`, `export` and `status` as in the fire script. It reads the grid, the blocks and the seed path from the recipe. Each block is a uint8 COG on the sprout grid, aligned to the origin, and 255 where Google has no 2023 data. `plan` lists the 145 blocks and the object names, without a network connection. `check` runs one block's image on a small box and compares it with `ee_box.py` for that box. A block whose object already exists is skipped.
2. **Batch script.** `seed/buildings.py` with `submit` and `status`. The job:
   - TEMPO: rebuilds the URL list from the index and stops if its SHA-256 differs from the recipe. It downloads the tiles with a limit on concurrent requests, checks each one (EPSG:3857, 256 × 256, zoom 11 alignment, float32, nodata −1, values −1 or 0–1), and writes one COG per zoom-4 tile to the TEMPO seed path. A tile that is missing or fails stops the run. It records the tile count per mosaic.
   - Google: checks every block COG for the grid, uint8, nodata 255, and values 0–250 or 255.
   - It writes a summary JSON to the seed paths.
3. **Recipe.** Record the TEMPO mosaic layout under `seeds.tempo` in `buildings-2023-v1.yaml`: zoom 4 objects, the object name pattern, and the source tile count. Correct the TEMPO lines of the expected cost in `cookbook/README.md`.
4. **Expected cost, then stop.** Restate the EECU-hours, the bytes for both seeds, the Batch hours and the object counts. Wait for approval.
5. **Run.** After approval, start the exports. When they are `COMPLETED`, submit the Batch job. After each submission, record the task or job ids, the output, how to check status, and how to cancel. Then return. Do not wait in the chat.
6. **Record.** In `seed/README.md`: bytes stored, object counts, EECU-hours used, wall time, peak memory of the Batch job, and that no virtual machine was left running. Update the status table in `docs/pipelines.md`.

## Do not

- Do not use Storage Transfer for TEMPO, and do not write the 822,199 source tiles as separate objects.
- Do not resample TEMPO onto the sprout grid, and do not apply the seed rule. Task 03 does that.
- Do not download a seed or the global TEMPO set to the laptop.
- Do not write a sprout raster.
- Do not add a GitHub workflow that starts on push.
- Do not start an export or a Batch job until the expected cost is approved.

## Done when

- The Google seed prefix holds 145 checked block COGs, and the TEMPO seed prefix holds the checked zoom-4 mosaics, or this pull request stops before the run and records how to start it.
- `python -m pytest seed cookbook gee buildings` passes.
- `seed/README.md` has the run cost, or the expected cost waiting for approval.
- One pull request into `main` in naturewatch-analysis, and one into `develop` here with this file and the parcel link. Each links the other. Neither is merged by Claude.

## How to work

Read `../naturewatch-analysis/CLAUDE.md` first. Branch `data/task-02-buildings-2023-seeds` from `main` there. Do this task only. Test both scripts on one block and a few TEMPO tiles before the global run. Do not commit secrets or the Earth Engine credentials. Do not add AI or tool attribution.
