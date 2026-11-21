# Task 03 — Buildings 2023 sprout

Parcel: [Buildings 2023](../parcels/buildings-2023.md).

Repository: naturewatch-analysis. Start from `main`, after task 02 has merged.

## Goal

After approval, merge the Google and TEMPO seeds into the sprout `buildings-2023-v1`: one two-band COG per 10° block, a VRT over them, and static STAC files. Check the comparison boxes against task 01's figures. Record the run cost.

## Facts already stored

- `cookbook/recipes/buildings-2023-v1.yaml` names the grid (EPSG:4326, 0.00025°, origin −180, 90), both seeds, and the sprout: band `share` (uint8, value ÷ 250, nodata 255) and band `source` (0 none, 1 Google, 2 TEMPO). Google is used where its seed is not 255. Elsewhere TEMPO is used, after the seed rule: a TEMPO cell is kept only if a TEMPO cell within 72 cells either side, in a square window, reaches 0.15. Otherwise it is 0.
- The Google seed is 145 block COGs at `seeds/buildings/google-temporal/2023/v1/<block>.tif`, 40,000 × 40,000 uint8 on the sprout grid, named by the south-west corner (`W010N00`). Its value is already the sprout share.
- The TEMPO seed is 131 zoom-4 Web Mercator mosaics at `seeds/buildings/tempo/2023q4/v1/z4-<x>-<y>.tif`, float32, nodata −1, band 1 unchanged from the source.
- `buildings/compare.py` `tempo_box` puts TEMPO on the sprout grid with `gdal.Warp`, `average`, `srcNodata` −1. `tempo_kept` applies the seed rule. `buildings/README.md` holds the box figures: Google mean presence km² for the six Google boxes, TEMPO km² for Saint-Flour, and the seed rule's losses in the sparse boxes. The cached box arrays are in `data/buildings/` on the laptop.
- `roads/batch.py` and `roads/README.md` are the pattern for a block job: blocks cut into runs of similar weight, one record per block written after its object, a rerun skips a block with a record, a pilot, then `collect` for the VRT and STAC files. Its notes on quotas apply: 24 `E2_CPUS` in `europe-west1`, and `pd-standard` disks so `SSD_TOTAL_GB` does not limit the run.
- `sprout/README.md` "Direction for later years": a sprout has no overviews, and resampling is the Tiles step's job. The cropland per-tile run chose DEFLATE level 6, no predictor, 512 blocks.

## Do this

1. **Script.** `sprout/buildings.py`, with `plan`, `submit`, `records` and `collect`, following `roads/batch.py`.
   - `plan` lists the blocks: every 10° block on the sprout grid that meets a Google block or a TEMPO mosaic with data. It needs no network beyond the seed `summary.json` files.
   - For each block, the job reads the Google block if there is one, and TEMPO band 1 warped onto the block grid with a 72-cell margin, as in `tempo_box`. It applies the seed rule to TEMPO cells only, merges by the recipe, and writes `blocks/<block>.tif` and `blocks/<block>.json`. It works in strips, so memory stays well below the machine's.
   - The COG has two bands, `share` and `source`, DEFLATE level 6, no predictor, 512 blocks, no overviews. A cell with neither source is share 255, source 0. A block with no cell from either source writes only its record.
   - The record holds bytes, cell counts per source, cells above 0 per source, the TEMPO cells the seed rule set to 0, seconds and peak memory.
   - `collect` writes `buildings-2023.vrt` over the block COGs, where a missing block reads share 255 and source 0, plus `collection.json` and `buildings-2023-v1.json`, with totals.
2. **Recipe.** Record the sprout layout in `buildings-2023-v1.yaml`: `blocks/<block>.tif`, the VRT path, compression, and the VRT's value where no block exists.
3. **Tests.** Unit tests for the merge and the seed rule on small arrays, including a seed across a block edge, and against `tempo_kept` on one cached box.
4. **Pilot.** One Batch job on two blocks: `E000N20` (Google's edge near 22.7° N, and the TEMPO noise at in-salah-south) and `E000N40` (TEMPO only, with Saint-Flour). It writes to the scratch prefix. The pilot is approved with this file, for under $0.05.
5. **Expected cost, then stop.** From the pilot, give the block count, task hours, machine, wall time, bytes, and the storage cost per month. Wait for approval.
6. **Run.** After approval, submit the full job. Record the job id, the output, how to check status, and how to cancel. Then return. Do not wait in the chat. When it has finished, run `collect`.
7. **Check.** Read these boxes from the published VRT and compare each with `buildings/README.md`:
   - The six Google settlement boxes. Their source is 1, and their km² equals the Google mean presence column, within rounding.
   - Saint-Flour and the four sparse boxes. Their source is 2, and their km² equals TEMPO after seed 0.15 within 2 km.
   - in-salah-south. Its source is 1, and no TEMPO cell is shown.
   Report each box's km² beside task 01's figure.
8. **Record.** In `sprout/README.md`, a "buildings 2023" section with how to run it, the pilot, the run, bytes stored, block count, task hours, wall time, peak memory, and that no virtual machine was left running. Update the Sprout and Cookbook rows in `docs/pipelines.md`.

## Do not

- Do not build map tiles or overviews. Task 04 builds the sample.
- Do not change a seed object.
- Do not use Google cells as seeds for the TEMPO rule, and do not threshold Google.
- Do not download a seed or a global sprout to the laptop. Box-sized reads are fine.
- Do not add a GitHub workflow that starts on push.
- Do not submit the full job until its expected cost is approved.

## Done when

- The sprout prefix holds the block COGs and their records, the VRT, and both STAC files. Or this pull request stops before the full run and records how to start it.
- The box check matches task 01's figures, or each difference is explained.
- `python -m pytest sprout buildings cookbook` passes.
- `sprout/README.md` has the run cost, or the expected cost waiting for approval.
- One pull request into `main` in naturewatch-analysis, and one into `develop` here with this file and the parcel link. Each links the other. Neither is merged by Claude.

## How to work

Read `../naturewatch-analysis/CLAUDE.md` first. Branch `data/task-03-buildings-2023-sprout` from `main` there. Do this task only. Test the block code on a cached box on the laptop before the pilot. Do not commit secrets. Do not add AI or tool attribution.
