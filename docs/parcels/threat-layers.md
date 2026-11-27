# Parcel: Threat Layers

New pressure layers that follow the [Roads](../archive/parcels/roads.md) pattern: railways, power lines, mines, dams, and oil and gas pipelines. Each source becomes a seed, a sprout on the shared 0.00025° grid, a raster PMTiles archive, and a layer in the Pressures group.

*Defined 27 November 2026. Taken out of step 1 of [Pressure and Cores](pressure-and-cores.md), because none of this waits for the [Stats Ledger](stats-ledger.md) or [Shaping Boundaries](shaping-boundaries.md). The ledger columns stay in those parcels.*

## Goal

A person can turn on Railways, Power lines, Mines, Dams, and Pipelines in the Pressures group. Zoomed out, each layer shows how much of the land it reaches, the way Roads does. Zoomed in, it shows the kind of feature where the source records it. Each layer names its source, its release or date, and its attribution.

The sprouts are analysis-ready, so the ledger and the pressure sandbox read them the same way they read Roads.

## Sources

| Layer | Source | Geometry | Settled in |
| --- | --- | --- | --- |
| Railways | Overture transportation, segments with subtype `rail`, release `2026-10-21.0` (the roads release) | lines | task 01 |
| Power lines | Overture base, `infrastructure` with subtype `power`, the same release | lines | task 01 |
| Mines | Maus et al. 2022 and Tang & Werner 2023, compared first | polygons | task 05 |
| Dams | GOODD, GRanD, or Global Dam Watch, compared first | points, reservoir polygons | task 08 |
| Pipelines | Global Energy Monitor oil and gas infrastructure trackers | lines | task 11 |

## Design

- **One layer per source.** Each layer gets its own seed, sprout, tiles, and catalog entry, so pressure weights stay independent. Railways and power lines share one Overture read and one Batch job where that is cheaper.
- **Seed.** The source as published, pinned by release or download date, as GeoParquet split by 10° block. Each feature keeps the source's own class, so a layer can be reclassed by rebuilding the sprout without reading the source again.
- **Sprout.** COGs per 10° block on the roads grid, EPSG:4326 at 0.00025°, with a VRT and static STAC files beside them. Lines mark the cells they touch, like Roads. Polygons mark the cells inside them. Points and the band layout are set in each source's sample task.
- **Tiles.** The cropland version 3 and roads design: palette PNG, a share pyramid, and the class at the top zoom. Each sample task sets the top zoom and the share curve.
- **Map.** Added to the Pressures group in `layers.json` as a snapshot, with the Landscape/Measure panel style and an info card for the attribution. Paint next to Roads and Built.
- **Licences.** Each sample task records the source licence and what it requires of a derived sprout. Overture transportation is ODbL, as with Roads.
- **Cost.** Each sample task runs on the laptop on a cropped window, records bytes, wall time, and peak memory, writes the expected global cost, and stops for approval. Batch jobs stay within the 32-CPU project quota. The pilot shard is checked against the sprout VRT before a full run.

## Open questions

- The railway classes kept (subway, tram, and disused lines), and the power classes kept (minor lines, cables, substations, plants). To settle in task 01.
- Mines: one source, or their union with the source recorded per cell. To settle in task 05.
- Dams: the dam point alone, or the reservoir footprint as well. To settle in task 08.
- Pipelines: whether the trackers' route accuracy holds at 28 m, or a buffer is needed. Global Energy Monitor data is downloaded through a form, so the user downloads it. To settle in task 11.

## Deferred

- The ledger column for each layer. It is added with the [Stats Ledger](stats-ledger.md).
- Pressure weights and distance decay. They are set in the sandbox in [Pressure and Cores](pressure-and-cores.md).

## Tasks

Do one task at a time, in this order. Start a task only after the one above it has merged. Each task is one branch and one pull request into `develop` in naturewatch-app, or into `main` in naturewatch-analysis. Task files are written when a task starts.

- [ ] Task 01 — Railways and power lines: recipes and sample — naturewatch-analysis
  - *Goal:* Add the two recipes: release, classes kept, sprout bands, and tile encoding. On the laptop, build a sample seed, sprout, and tile archive for a window, check them against imagery, and choose the top zoom. Write the expected global cost and stop for approval.
- [ ] Task 02 — Railways and power lines: global seeds and sprouts — naturewatch-analysis
  - *Goal:* After approval, write both global seeds and sprouts with their VRT and STAC files. Check the sample window against task 01. Record the run cost.
- [ ] Task 03 — Railways and power lines: PMTiles — naturewatch-analysis
  - *Goal:* After approval, build both global archives, verify them, upload them with the immutable cache header, and record the run cost.
- [ ] Task 04 — Railways and power lines on the map — naturewatch-app
  - *Goal:* Add both layers to `layers.json`, `docs/user/data.md`, and `docs/blueprint.md`. Run the catalog tests and a browser check.
- [ ] Task 05 — Mines: source comparison, recipe and sample — naturewatch-analysis
  - *Goal:* Compare Maus et al. 2022 and Tang & Werner 2023 at a few mining regions against imagery, choose the source or union, and add the recipe. Build a sample, write the expected global cost, and stop for approval.
- [ ] Task 06 — Mines: global seed, sprout and PMTiles — naturewatch-analysis
  - *Goal:* After approval, write the seed, sprout, and archive, verify them, and record the run cost.
- [ ] Task 07 — Mines on the map — naturewatch-app
  - *Goal:* As task 04, for Mines.
- [ ] Task 08 — Dams: source comparison, recipe and sample — naturewatch-analysis
  - *Goal:* As task 05, for GOODD, GRanD, and Global Dam Watch, including whether reservoirs are drawn.
- [ ] Task 09 — Dams: global seed, sprout and PMTiles — naturewatch-analysis
  - *Goal:* As task 06, for Dams.
- [ ] Task 10 — Dams on the map — naturewatch-app
  - *Goal:* As task 04, for Dams.
- [ ] Task 11 — Pipelines: recipe and sample — naturewatch-analysis
  - *Goal:* From the user's Global Energy Monitor download, add the recipe for oil and gas pipelines, build a sample, check the routes against imagery, write the expected global cost, and stop for approval.
- [ ] Task 12 — Pipelines: global seed, sprout and PMTiles — naturewatch-analysis
  - *Goal:* As task 06, for Pipelines.
- [ ] Task 13 — Pipelines on the map — naturewatch-app
  - *Goal:* As task 04, for Pipelines.

## Done when

Railways, Power lines, Mines, Dams, and Pipelines are on the map in the Pressures group, each naming its source and attribution, and each sprout has its STAC files for the ledger. Every sample was approved before its global run. Costs are in the step READMEs in naturewatch-analysis. The catalog tests pass. No production deploy.
