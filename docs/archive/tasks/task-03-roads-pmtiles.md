# Task 03 — Roads PMTiles

Parcel: [Roads](../../parcels/roads.md).

Repository: naturewatch-analysis. Start from `main`. Task 02 is merged.

## Goal

Build the global roads raster archive from the sprout as hand-started Batch jobs, check it, and publish it at `gs://nature-watch-tiles/roads/2026-10/v1/roads.pmtiles` with the immutable cache header. Record what the run cost.

## Facts already stored

- `cookbook/recipes/roads-2026-10-v1.yaml` holds the tile encoding: 512 px palette PNG, zoom 0–11, index 0 transparent, 8 shades spaced in √(share / 0.25) below zoom 11, red = level × 4 + surface at zoom 11, and the archive path.
- `roads/tiles.py` builds a window archive on the laptop: `render`, `reduce`, `encode`, with a parent's share the mean of its four children and an absent child counting as 0. `roads/README.md` holds the task 01 window archives (tiles, bytes, largest tile) and the global sprout record.
- The sprout is `gs://nature-watch-bucket/sprouts/roads/2026-10/v1/`: 367 COGs under `blocks/`, named like `30S_020E`, and `roads-2026-10.vrt` with no nodata, so a missing block reads 0.
- `tiles/global_cropland.py` and `tiles/pyramid.py` are the shard pattern from cropland version 3: one Batch task per zoom 5 tile, a record per shard written last so a rerun skips it, the unquantised root share saved beside each shard for the upper zooms, a merge job that checks tile order and counts, rebuilds sample subtrees from the sprout byte for byte, uploads, sets `Cache-Control` and checks a 206 Range answer.
- The expected cost is in `cookbook/README.md` under `roads-2026-10-v1`: about $0.30–0.80 of compute and 1.5–4 GB stored. The sprout came out 30–120% above its estimate in road cells, so the tiles may too.
- From task 02: the region allows 24 `E2_CPUS`, and `pd-balanced` disks count against a 500 GB SSD quota, so Batch jobs use `pd-standard` disks.

## Do this

1. **Shard job.** Add the tiles to `roads/batch.py` (`submit tiles`, `--pilot`, `submit merge`), reusing `tiles/pyramid.py` and the storage and Batch helpers of `tiles/global_cropland.py` rather than copying them. One shard per zoom 5 tile that meets a block with roads. A task copies the block COGs it needs, renders zoom 11 with the `roads/tiles.py` maths and reduces to zoom 5. It writes the shard archive, its root share and its record. Spot machines in `europe-west1`, `pd-standard` disks.
2. **Local check.** Build the two task 01 windows (gauteng-waterberg, chinko) through the shard code on the laptop from the published block COGs, cropped to the window. Tiles wholly inside a window should match the task 01 window archive, apart from the corner-touch cells recorded in task 02. Explain any other difference.
3. **Pilot.** Run one dense shard as a Batch pilot (the one holding Gauteng). Record wall time, peak memory, tiles and bytes, and redo the global estimate from it.
4. **Stop for approval.** Show the pilot figures and the revised cost. Start the full jobs only after the user approves.
5. **Full runs.** Submit the shard job, then the merge job once every shard has a current record. The merge rebuilds at least 12 sample subtrees from the sprout VRT and compares them byte for byte, then uploads with `Cache-Control: public, max-age=31536000, immutable`. After each submit, record the job id, the output path, and the status and cancel commands in `roads/README.md`, and return without waiting.
6. **Check the published archive.** A Range request answers 206. A GET with `Origin: http://localhost:5173` returns `Access-Control-Allow-Origin`. The metadata names the release and the attribution. Look at it with `roads/preview.py` pointed at the public URL, in Chrome and Safari: a dense region (Gauteng), a sparse one (Chinko), and a city at zoom 11.
7. **Records.** In `roads/README.md`: how to run the jobs, and the run record with tiles, bytes, task-hours, peak memory and the cost against the estimate. Update the Roads rows of `docs/pipelines.md`. Delete the shard scratch after the archive is checked. Tests in `roads/` cover the shard plan from block names and the root share, without network.

## Do not

- Do not change the encoding, the top zoom or the shades in the recipe. If the check shows a need, stop and ask.
- Do not touch the app catalog. That is task 04.
- Do not register the sprout in `sprouts` or compute any place stat.
- Do not overwrite an existing object under `gs://nature-watch-tiles/`.
- Do not add a GitHub workflow that starts on push.

## Done when

- `gs://nature-watch-tiles/roads/2026-10/v1/roads.pmtiles` exists with the immutable cache header, answers 206 with CORS, and passed the sample and window checks.
- It draws without artefacts in Chrome and Safari.
- `roads/README.md` holds the run record and cost, and `docs/pipelines.md` names the archive. No virtual machine is left running, and the shard scratch is deleted.
- `python -m pytest cookbook roads tiles` passes.
- One pull request into `main` in naturewatch-analysis, and one into `develop` here with this file. Each links the other. Claude merges neither.

## How to work

Read `../naturewatch-analysis/CLAUDE.md` first. Branch `data/task-03-roads-pmtiles` from `main` there. Approving this file approves the one-shard pilot, expected under $0.05. Write the full-run cost and stop before the full jobs. Do this task only. Do not commit secrets. Do not add AI or tool attribution.
