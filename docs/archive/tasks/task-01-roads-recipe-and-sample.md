# Task 01 — Roads recipe and sample

Parcel: [Roads](../parcels/roads.md).

Repository: naturewatch-analysis. Start from `main`. This is the first task in the parcel.

## Goal

Add `cookbook/recipes/roads-2026-10-v1.yaml`. Build a sample seed, sprout and tile archive on the laptop, check the levels and the look, choose the tile encoding and the top zoom, and write the expected cost of each global run. No Batch job, no transfer, no write to either bucket.

## Facts already stored

- The parcel holds the source choice, the levels, the sprout grid and bands, the raster-tile decision, the reasons Earth Engine is not used, and the object paths.
- The 11 November comparison scripts were in a session scratchpad and are gone. The ten comparison sites are named in the parcel.
- Overture release `2026-10-21.0` is GeoParquet in Overture's public bucket, theme `transportation`, type `segment`. Each row has a `bbox` struct, and DuckDB can filter on it so only the row groups of a box are read.
- `cookbook/recipes/cropland-2024-v3.yaml` is the pattern for the recipe: grid, seed, sprout, and tiles blocks with comments. `python -m pytest cookbook` checks recipes.
- `tiles/pyramid.py` and the "Version 3" section of `tiles/README.md` hold the share pyramid, the palette PNG, the 512 px tiles and the sharded archive build. The global v3 run was estimated at about $0.6–2 of spot compute.
- `sprout/README.md` holds the per-tile COG, VRT and STAC pattern of cropland version 2, and the compression benchmark.
- `buildings/` is the pattern for a dataset folder with its own README, scripts, boxes file and tests.

## Do this

1. **Folder.** A new `roads/` folder with `README.md`, `requirements.txt`, the scripts below and tests. Reuse `tiles/pyramid.py` and the sprout STAC code where they fit, instead of copying them.
2. **Seed for a window.** `roads/seed.py` reads Overture segments in a box with DuckDB, keeps the classes the parcel names, and writes GeoParquet with geometry, `class`, `level`, `surface`, OSM way id and name. The surface is the one that covers most of the road's length. Run it for:
   - the ten comparison boxes from the parcel, for the level check;
   - two sample windows of 2° × 2° for sizes and the look: one dense, around Gauteng and the Waterberg, and one sparse, around Chinko in the Central African Republic.
3. **Levels.** For each comparison box, count segments and length by `class`, `level` and `surface`. Check the `level` rules against imagery at a few points per box, especially `unclassified` and `unknown`. Propose changes to the rules if the check shows a need.
4. **Sprout for the windows.** `roads/sprout.py` burns the seed onto the grid, EPSG:4326 at 0.00025°, with the two `uint8` bands of the parcel. A cell is a road cell when a road line touches it. Compare all-touched with line-centre burning on one window and keep all-touched unless it thickens roads visibly. Decide how blocks without roads and the open sea appear in the VRT: missing tiles read as 0, or as nodata. Record the COG bytes per window with the compression from `sprout/README.md`.
5. **Tile sample.** Build a raster PMTiles archive for each window. Below the top zoom, a pixel holds the share of its cells that are road cells, in √share shades like cropland version 3. At the top zoom it holds the highest level and that road's surface. Choose:
   - the PNG encoding that carries both the share and, at the top zoom, the level and surface;
   - the top zoom, 11 or 12;
   - the share shades, so a sparse track network still shows at zoom 4–6.

   Render each window at zoom 4, 8 and the top zoom with `roads/render.py`. Record tiles, bytes per zoom, the largest tile, wall time and peak memory.
6. **Global cost.** Count Overture road segments per 10° block from the Parquet file footers and row-group statistics only, without reading the geometry. Scale the sample figures by those counts to estimate, for each of the seed, the sprout and the tiles:
   - the bytes stored;
   - the machine type and hours;
   - the price at spot rates.

   Write the estimates in `cookbook/README.md`, and include monthly storage.
7. **Recipe.** `cookbook/recipes/roads-2026-10-v1.yaml` with the release, the classes kept, the level and surface rules, the grid, the seed, the sprout bands, and the tile path, encoding and top zoom. Its comments point at `roads/README.md` for the measurements.
8. **Records.** Put how to run the scripts, and the level and sample tables, in `roads/README.md`. Add the recipe to the status table in `docs/pipelines.md`. Tests in `roads/` cover the level rules, the surface rule and the burn on fixtures, without network.

## Stop for approval

After step 5, stop with the level table, the renders and the tile sizes. Get the user's approval for the level rules, the encoding and the top zoom before writing them into the recipe.

## Do not

- Do not start a Batch job or a transfer, and do not write to either bucket.
- Do not read more of Overture than the boxes, the two windows and the footers.
- Do not build vector tiles.
- Do not register the sprout in `sprouts` or compute any place stat.
- Do not add a GitHub workflow that starts on push.

## Done when

- `roads-2026-10-v1.yaml` names the release, the classes, the levels, the grid, the seed, the sprout bands and the tiles.
- `roads/README.md` holds the level table and the sample sizes, timings and renders.
- Each global run has a written cost in `cookbook/README.md`.
- The user approved the levels, the encoding and the top zoom.
- `python -m pytest cookbook roads` passes.
- One pull request into `main` in naturewatch-analysis, and one into `develop` here with the parcel revision and this file. Each links the other. Claude merges neither.

## How to work

Read `../naturewatch-analysis/CLAUDE.md` first. Branch `feat/task-01-roads-recipe-and-sample` from `main` there. Do this task only. Keep laptop reads to the boxes and windows above. Do not commit secrets. Do not add AI or tool attribution.
