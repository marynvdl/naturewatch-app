# Task 02 — Energy: global seed and sprouts

Parcel: [Energy](../../parcels/energy.md). Shared design: [Threat Layers](../../parcels/threat-layers.md#shared-design).

Repository: naturewatch-analysis. Start from `main`. Task 01 is merged.

## Goal

Write the global infrastructure seed and the `power-lines` and `power-sites` sprouts, with a VRT and static STAC files for each sprout, as hand-started Batch jobs. Check the two task 01 windows against the global outputs, and record what each run cost.

## Facts already stored

- `cookbook/recipes/power-lines-2026-10-v1.yaml` and `power-sites-2026-10-v1.yaml` hold the release, the rules, the grid, the seed and sprout paths, the bands and the compression. `energy/rules.py` reads them. A block without a line or site is not written and reads 0. There is no nodata.
- `energy/seed.py` and `energy/sprout.py` build the seed and both sprouts for a window on the laptop. `energy/README.md` holds the task 01 figures per window: seed rows, line and site cells, and COG bytes.
- `roads/batch.py` and `roads/blocks.py` are the pattern, and already run the roads seed and sprout on Batch:
  - 10° blocks named from the south-west corner, and a row stored in the block that holds the centre of its `bbox`;
  - at most 20 tasks of similar weight, by the footer counts;
  - a JSON record per block written last, so a rerun skips finished blocks;
  - `--pilot <block>`, and `--approved` before anything is submitted;
  - a sprout block burned from its own seed and its eight neighbours', filtered by bbox, in strips;
  - `collect`, which writes the VRT and the STAC files.
- The expected cost is in `cookbook/README.md` under the energy recipes: about $0.05–0.20 for the seed and $0.20–0.60 for both sprouts, about 13 GB of seed and 0.3–1.3 GB of sprouts. `data/energy/footers.json` counts 158,979,260 infrastructure rows in 245 blocks.
- On 28 November 2026 Overture still served `2026-10-21.0`, beside `2026-11-18.0`.

## Do this

1. **Reuse.** `energy/batch.py` with `submit seed|sprout`, `collect` and `records`, built on the helpers in `roads/batch.py` and `roads/blocks.py`, not copies of them. Where a roads function is too roads-specific, give it a parameter, keeping the roads output the same.
2. **Seed job.** For each block, read the Overture row groups whose bbox meets it, keep the rows whose centre is in it, and write `<block>.parquet` with the recipe's columns and a JSON record under the seed path. The record counts rows by `subtype` and holds the power classes the sprouts keep. Spot `e2-standard-4` in `europe-west1`, as roads.
3. **Sprout job.** One task per block group writes both sprouts, so each seed block is read once. For each block, burn `power-lines` and `power-sites` from the seed of that block and its eight neighbours, with the task 01 rules: lines all-touched, sites at the cell centre with a point as its own cell, the highest value winning. A site's area is that of its whole shape, so a site that crosses a block edge keeps its group on both sides. Write `<block>.tif` for each sprout only when a cell is marked, and a record for every block.
4. **Collect.** A VRT for each sprout, with no nodata so a missing block reads 0, and the static STAC files from each recipe.
5. **Pilot.** Run the seed and the sprout for `40N_000E`, which holds most of the Gironde window and the dense French network, as pilot jobs. Record wall time, peak memory and bytes, and redo the global estimate from them and from the row counts by subtype.
6. **Stop for approval.** Show the pilot figures and the revised cost. Start the full jobs only after the user approves.
7. **Full runs.** Submit the seed job, then the sprout job once every seed block has a record. After each submit, record the job id, the output path, and the status and cancel commands in `energy/README.md`, and return without waiting for the job.
8. **Check.** When both jobs have finished, cut the Karoo and Gironde windows from the two VRTs and compare the cells by value with the task 01 tables. Seed rows in each window should match task 01 too. Explain any difference. Sites that cross a window edge may add cells along it, because task 01 read only the window.
9. **Records.** In `energy/README.md`: how to run the jobs, and the run record with bytes stored, task-hours, peak memory, and the cost against the estimate. Update the energy row in `docs/pipelines.md`. Tests in `energy/` cover the block plan and the neighbour filter for both sprouts, without network.

## Do not

- Do not start the tiles. That is task 03.
- Do not register the sprouts in `sprouts` or compute any place stat.
- Do not read Overture outside the jobs, apart from the pilot.
- Do not add a GitHub workflow that starts on push.
- Do not change the rules, bands or burn values in the recipes. If the check shows a need, stop and ask.

## Done when

- The seed is at `gs://nature-watch-bucket/seeds/infrastructure/overture/2026-10-21.0/`, one GeoParquet file and one record per block.
- The sprouts are at `gs://nature-watch-bucket/sprouts/power-lines/2026-10/v1/` and `gs://nature-watch-bucket/sprouts/power-sites/2026-10/v1/`, each with its COGs, VRT and STAC files.
- The two windows match task 01, or the difference is explained.
- `energy/README.md` holds the run record and cost, and `docs/pipelines.md` names the published objects.
- `python -m pytest cookbook energy roads` passes.
- One pull request into `main` in naturewatch-analysis, and one into `develop` here with this file. Each links the other. Claude merges neither.

## How to work

Read `../naturewatch-analysis/CLAUDE.md` first. Branch `data/task-02-energy-seed-and-sprouts` from `main` there. Approving this file approves the two pilot jobs, expected under $0.05 together. Write the full-run cost and stop before the full jobs. Do this task only. Do not commit secrets. Do not add AI or tool attribution.
