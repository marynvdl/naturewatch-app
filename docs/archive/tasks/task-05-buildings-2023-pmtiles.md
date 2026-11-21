# Task 05 — Buildings 2023 PMTiles

Parcel: [Buildings 2023](../../parcels/buildings-2023.md).

Repository: naturewatch-analysis. Start from `main`. Task 04 is merged.

## Goal

Build the global Buildings 2023 archive from the sprout with the settings approved in task 04. Run it as hand-started Batch jobs, check it, and publish it at `gs://nature-watch-tiles/buildings/2023/v1/buildings.pmtiles` with the immutable cache header. Record what the run cost.

## Facts already stored

- `cookbook/recipes/buildings-2023-v1.yaml` `tiles` holds the approved settings: 512 px share-palette PNG, zooms 0–12, graded top zoom, 7 shades in √(share / 0.25), mean parent with absent children as 0, empty tiles dropped, and `google_speckle` (floor 0.012, seed 0.15 within 72 cells) applied to Google cells before the top zoom is warped.
- `buildings/tiles.py` builds window archives on the laptop. `speckle_rule`, `layer`, `reduce`, `shade_index` and `encode` hold the maths. `buildings/README.md` "Tile sample (task 04)" holds the window figures and the global estimate: at zoom 12, 2.4–4 million top-zoom tiles, 10–25 GB, 40–100 task-hours, about $1.5–3.5 of compute plus a merge under $0.30.
- The sprout is `gs://nature-watch-bucket/sprouts/buildings/2023/v1/`: 363 two-band COGs (`share`, `source`) under `blocks/`, named like `E000N20`, 8,298,520,056 bytes, and `buildings-2023.vrt`. A block without a COG reads share 255 and source 0.
- `roads/batch.py` (`submit tiles`, `--pilot`, `records tiles`, `submit merge`), `tiles/global_cropland.py` and `tiles/pyramid.py` are the shard pattern. There is one task per zoom 5 tile, and each shard writes its record last, so a rerun skips it. The unquantised root share is saved beside each shard. A merge job checks the shards, builds zooms 0–4, rebuilds sample subtrees from the sprout VRT byte for byte, uploads, sets `Cache-Control` and checks a 206. `roads/README.md` "Global tiles (task 03)" has the run: 694 shards, 10.8 task-hours, a 578 s merge, $0.7–1.4.
- The region allows 24 `E2_CPUS`. Batch jobs use `pd-standard` disks, because `pd-balanced` counts against a 500 GB SSD quota.

## Do this

1. **Shard job.** Add `buildings/batch.py` with `submit tiles`, `--pilot`, `records tiles` and `submit merge`. Reuse `buildings/tiles.py` for the maths, and the storage, Batch and merge helpers of `roads/batch.py`, `tiles/global_cropland.py` and `tiles/pyramid.py`. Move a helper to a shared place if that is cleaner, but do not copy it. Make one shard per zoom 5 tile that meets a sprout block with a COG. A task copies the blocks it needs, including neighbours within 72 cells of its edge, so the speckle rule sees 2 km past the shard and shard edges leave no seam. It renders zoom 12 and reduces to zoom 5. Spot machines in `europe-west1`, `pd-standard` disks, 12 tasks at a time.
2. **Local check.** Build the Kocho and edge windows from task 04 through the shard code on the laptop, from the published block COGs cut to the window plus the margin. Tiles wholly inside a window should match the task 04 window archive built with the approved settings. Explain any difference.
3. **Pilot.** Run one dense Google shard as a Batch pilot, the one holding Kongoussi. Record wall time, peak memory, tiles and bytes. Redo the global estimate from it.
4. **Stop for approval.** Show the pilot figures and the revised cost. Start the full jobs only after the user approves.
5. **Full runs.** Submit the shard job. Submit the merge job once every shard has a current record. The merge rebuilds at least 12 sample subtrees from the sprout VRT, including one across a shard edge, and compares them byte for byte. The metadata names `buildings-2023-v1`, both sources with their licences (Google Open Buildings 2.5D Temporal, CC BY 4.0; Microsoft TEMPO 2023 Q4, CDLA Permissive 2.0), the shades and `full`. The merge uploads with `Cache-Control: public, max-age=31536000, immutable`. After each submit, record the job id, the output path, and the status and cancel commands in `buildings/README.md`. Then return without waiting.
6. **Check the published archive.**
   - A Range request answers 206.
   - A GET with `Origin: http://localhost:5173` returns `Access-Control-Allow-Origin`.
   - Look at it with `buildings/preview.py` pointed at the public URL, in Chrome and Safari: the world at zoom 2, Kongoussi and Kocho at zoom 12, the Google–TEMPO edge near 9.8° E, 27.5° N for a seam, and the Libyan desert for a haze.
7. **Records.**
   - In `buildings/README.md`: how to run the jobs, and the run record with tiles, bytes, task-hours, peak memory and the cost against the estimate.
   - Update the Buildings part of the Tiles and Tiles store rows of `docs/pipelines.md`.
   - Delete the shard scratch after the archive is checked.
   - Tests in `buildings/` cover the shard plan from block names and the margin blocks, without network.

## Do not

- Do not change the settings in the recipe. If a check shows a need, stop and ask.
- Do not touch the app catalog. Task 06 does that.
- Do not register the sprout in `sprouts` or compute any place stat.
- Do not overwrite an existing object under `gs://nature-watch-tiles/`, and do not delete the current Built tiles at `built/2023/`.
- Do not add a GitHub workflow that starts on push.
- Do not submit the full jobs before the revised cost is approved.

## Done when

- `gs://nature-watch-tiles/buildings/2023/v1/buildings.pmtiles` exists with the immutable cache header. It answers 206 with CORS, and it passed the sample and window checks.
- It draws without seams or haze in Chrome and Safari.
- `buildings/README.md` holds the run record and cost, and `docs/pipelines.md` names the archive.
- No virtual machine is left running, and the shard scratch is deleted.
- `python -m pytest buildings roads tiles cookbook` passes.
- One pull request into `main` in naturewatch-analysis, and one into `develop` here with this file. Each links the other. Claude merges neither.

## How to work

Read `../naturewatch-analysis/CLAUDE.md` first. Branch `data/task-05-buildings-2023-pmtiles` from `main` there. Approving this file approves the one-shard pilot, expected under $0.05. Write the full-run cost and stop before the full jobs. Do this task only. Do not commit secrets. Do not add AI or tool attribution.
