# Parcel: Energy

The first [Threat Layers](threat-layers.md) parcel. One Energy layer in the Pressures group shows power lines, power plants, and solar and wind farms. Solar and wind farms are large fenced footprints, often far from roads and crops, which matters most in dry places such as the Karoo.

*Defined 27 November 2026.*

## Goal

A person can turn on Energy and see power lines as a share zoomed out and by voltage class zoomed in. Power plants, solar and wind farms, and substations show as a heatmap zoomed out and as shapes zoomed in. Clicking a site shows its name, operator, source, and output where the data records them. The layer names its sources, release, and attribution.

Each kind has a sprout, so the ledger and the pressure sandbox read power lines and generation footprints separately.

## Sources

- **Overture `base/infrastructure`** (OpenStreetMap), release `2026-10-21.0`: power lines, plants, generators, and substations, with their `name`, `operator`, source, and output tags. The seed keeps every infrastructure subtype, so Water can reuse the read.

Task 01 compared Global Renewables Watch with OpenStreetMap and left it out: it missed real solar plants and turbines in both windows, and its data has no licence of its own.

## Design

The shared design is in [Threat Layers](threat-layers.md#shared-design). For Energy:

- **Sprouts.** `power-lines`, with the cells a line touches and its voltage class, and `power-sites`, with the cells inside a site and its source group. The group of a site with several sources is the dirtiest, so the sandbox can weight cleaner and dirtier power apart.
- **Tiles.** Power lines raster, like Roads. Power sites vector: a point per site to zoom 9 for a heatmap, then the shape with the feature card. Crowded points merge but keep their summed area and count, in total and per group.
- **Map.** One Energy toggle that draws both archives. The heatmap's colours and weights are set in the client.

The rules, encodings, and sample figures are in the two recipes and `energy/README.md` in naturewatch-analysis.

## Open questions

- How one catalog entry draws a raster and a vector archive together, and the heatmap's palette and weight. To settle in task 04.

## Deferred

- **Global Renewables Watch** as a gap-fill for solar and wind where OpenStreetMap is thin, once its data licence is stated and it is checked in such a region.

## Tasks

Do one task at a time, in this order. Start a task only after the one above it has merged. Each task is one branch and one pull request into `develop` in naturewatch-app, or into `main` in naturewatch-analysis. Task files are written when a task starts.

- [x] [Task 01 — Energy: recipes and sample](../archive/tasks/task-01-energy-recipes-and-sample.md) — naturewatch-analysis
  - *Goal:* Add the `power-lines` and `power-sites` recipes: release, classes kept, sprout bands, tile encodings, and the attributes kept. On the laptop, build a sample for windows such as the Karoo and one European region. Check them against imagery, compare solar and wind farms with Global Renewables Watch, and choose the top zooms. Write the expected global cost and stop for approval.
- [ ] Task 02 — Energy: global seed and sprouts — naturewatch-analysis
  - *Goal:* After approval, write the global seed and both sprouts with their VRT and STAC files. Check the sample windows against task 01. Record the run cost.
- [ ] Task 03 — Energy: PMTiles — naturewatch-analysis
  - *Goal:* After approval, build the raster and vector archives, verify them, upload them with the immutable cache header, and record the run cost.
- [ ] Task 04 — Energy on the map — naturewatch-app
  - *Goal:* Add the Energy layer to `layers.json` with the feature card, and add its entries to `docs/user/data.md` and `docs/blueprint.md`. Run the catalog tests and a browser check.

## Done when

A person can turn on Energy and see power lines, plants, and solar and wind farms, and can click a plant or farm for its details. The layer names its sources and attribution. Both sprouts have their STAC files for the ledger. The sample was approved before the global runs. Costs are in the step READMEs in naturewatch-analysis. The catalog tests pass. No production deploy.
