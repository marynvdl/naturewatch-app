# Task 02 — Roads seed and sprout

Parcel: [Roads](../../parcels/roads.md).

Repository: naturewatch-analysis. Start from `main`. Task 01 is merged.

## Goal

Write the global roads seed and the sprout COGs, with their VRT and static STAC files, as hand-started Batch jobs. Check the two task 01 windows against the global sprout, and record what each run cost.

## Facts already stored

- `cookbook/recipes/roads-2026-10-v1.yaml` holds the release, the classes, the level and surface rules, the grid, the seed and sprout paths, the burn rule, the compression and the bands. A block without a road is not written and reads 0. There is no nodata.
- `roads/seed.py` and `roads/sprout.py` build the seed and sprout for a box on the laptop. `roads/README.md` holds the method and the task 01 sample figures, including the road cells per level in each window.
- The expected global cost is in `cookbook/README.md` under `roads-2026-10-v1`: about $0.10–0.30 for the seed and $0.15–0.40 for the sprout, about 37 GB of seed and 2.5–3.5 GB of sprout. `data/roads/footers.json` counts segment rows per 10° block: 272 blocks.
- `sprout/cropland.py` is the pattern for a Batch job with one task per tile: `submit`, `run-tile`, `collect`, `--pilot`, a per-tile JSON record written last so a rerun skips finished tiles, parallelism 20 (the project allows 24 VMs in `europe-west1`), and the status and cancel commands printed on submit. It also writes the VRT and the static STAC files.
- Overture's bucket is AWS Open Data and not requester pays. Google Cloud does not charge for data coming in.

## Do this

1. **Blocks.** A segment belongs to the 10° block that holds the centre of its `bbox`, so every seed row is stored once. Blocks are named from their south-west corner, like `10S_020E`.
2. **Seed job.** `roads/seed.py` gets `run-block`, `submit` and `--pilot <block>`, following `sprout/cropland.py`. The blocks are split into at most 20 groups of similar size, and one Batch task handles one group, so a job starts at most 20 machines and lists the Overture footers once per task. For each block, the task reads the Overture row groups whose bbox meets the block, keeps the rows whose centre is in it, and writes `<block>.parquet` and a JSON record under the seed path. A block whose record exists is skipped on a rerun. The columns are the recipe's. Spot machines in `europe-west1`.
3. **Sprout job.** `roads/sprout.py` gets `run-block`, `submit`, `--pilot <block>` and `collect`. The blocks are grouped the same way, at most 20 tasks. For each block, a task burns 40,000 × 40,000 cells from the seed files of that block and its eight neighbours, filtered by bbox, so a road that crosses a block edge is burned on both sides. It runs in strips if one block does not fit the machine's memory. It writes `<block>.tif` only when a road cell is present, and a record for every block, so a rerun skips finished blocks. `collect` writes the VRT, with no nodata so a missing block reads 0, and the static STAC files from the recipe.
4. **Pilot.** Run the seed and the sprout for one dense block, the one holding Gauteng and the Waterberg, as pilot jobs. Record wall time, peak memory and bytes, and redo the global estimate from them.
5. **Stop for approval.** Show the pilot figures and the revised cost. Start the full jobs only after the user approves.
6. **Full runs.** Submit the seed job, then the sprout job once every seed block has a record. After each submit, record the job id, the output path, the status and cancel commands in `roads/README.md`, and return without waiting for the job.
7. **Check.** When both jobs have finished, cut the two task 01 windows from the sprout VRT and compare road cells by level with the task 01 table. Seed rows in each window should match task 01 too. Explain any difference.
8. **Records.** In `roads/README.md`: how to run the jobs, the run record with bytes stored, task-hours, peak memory and the cost against the estimate. Update the Roads row of the status table in `docs/pipelines.md`. Tests in `roads/` cover the block naming, the centre rule and the neighbour filter, without network.

## Do not

- Do not start the tiles. That is task 03.
- Do not register the sprout in `sprouts` or compute any place stat.
- Do not read Overture outside the jobs, apart from the pilot.
- Do not add a GitHub workflow that starts on push.
- Do not change the levels, the burn rule or the bands in the recipe. If the check shows a need, stop and ask.

## Done when

- The seed is at `gs://nature-watch-bucket/seeds/roads/overture/2026-10-21.0/`, one GeoParquet file and one record per block.
- The sprout is at `gs://nature-watch-bucket/sprouts/roads/2026-10/v1/`, with its COGs, VRT and STAC files.
- The two windows match task 01, or the difference is explained.
- `roads/README.md` holds the run record and cost, and `docs/pipelines.md` names the published objects.
- `python -m pytest cookbook roads` passes.
- One pull request into `main` in naturewatch-analysis, and one into `develop` here with this file. Each links the other. Claude merges neither.

## How to work

Read `../naturewatch-analysis/CLAUDE.md` first. Branch `data/task-02-roads-seed-and-sprout` from `main` there. Approving this file approves the two pilot jobs, expected under $0.05 together. Write the full-run cost and stop before the full jobs. Do this task only. Do not commit secrets. Do not add AI or tool attribution.
