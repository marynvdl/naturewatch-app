# Parcel: Energy

The first [Threat Layers](threat-layers.md) parcel. One Energy layer in the Pressures group shows power lines, power plants, and solar and wind farms. Solar and wind farms are large fenced footprints, often far from roads and crops, which matters most in dry places such as the Karoo.

*Defined 27 November 2026.*

## Goal

A person can turn on Energy and see power lines as a share zoomed out and by voltage class zoomed in, and power plants and solar and wind farms as features. Clicking a plant or farm shows its name, operator, source, and capacity where the data records them. The layer names its sources, release, and attribution.

Each kind has a sprout, so the ledger and the pressure sandbox read power lines and generation footprints separately.

## Sources

- **Overture `base/infrastructure`** (OpenStreetMap), release `2026-10-21.0`: power lines, minor lines, plants, and generators, with their `name`, `operator`, source, and output tags.
- **Global Renewables Watch** (solar and wind installations detected from imagery), compared with OpenStreetMap in task 01. It is used only if it adds farms that OpenStreetMap misses and its licence fits.

## Design

The shared design is in [Threat Layers](threat-layers.md#shared-design). For Energy:

- **Sprouts.** `power-lines`, with the cells a line touches and its voltage class, and `power-sites`, with the cells inside a plant or farm and its source (solar, wind, fossil, hydro, nuclear, other). A plant mapped only as a point marks its own cell.
- **Tiles.** Power lines raster, like Roads. Plants and farms vector, with the attributes kept for the feature card.
- **Map.** One Energy toggle that draws both archives.

## Open questions

- The classes kept: cables, substations, towers, and single generators such as rooftop solar. To settle in task 01.
- Whether the seed keeps every `base/infrastructure` subtype, so Water and Mines reuse one read. To settle in task 01, by its cost.
- How one catalog entry draws a raster and a vector archive together. To settle in task 04.

## Tasks

Do one task at a time, in this order. Start a task only after the one above it has merged. Each task is one branch and one pull request into `develop` in naturewatch-app, or into `main` in naturewatch-analysis. Task files are written when a task starts.

- [ ] Task 01 — Energy: recipes and sample — naturewatch-analysis
  - *Goal:* Add the `power-lines` and `power-sites` recipes: release, classes kept, sprout bands, tile encodings, and the attributes kept. On the laptop, build a sample for windows such as the Karoo and one European region. Check them against imagery, compare solar and wind farms with Global Renewables Watch, and choose the top zooms. Write the expected global cost and stop for approval.
- [ ] Task 02 — Energy: global seed and sprouts — naturewatch-analysis
  - *Goal:* After approval, write the global seed and both sprouts with their VRT and STAC files. Check the sample windows against task 01. Record the run cost.
- [ ] Task 03 — Energy: PMTiles — naturewatch-analysis
  - *Goal:* After approval, build the raster and vector archives, verify them, upload them with the immutable cache header, and record the run cost.
- [ ] Task 04 — Energy on the map — naturewatch-app
  - *Goal:* Add the Energy layer to `layers.json` with the feature card, and add its entries to `docs/user/data.md` and `docs/blueprint.md`. Run the catalog tests and a browser check.

## Done when

A person can turn on Energy and see power lines, plants, and solar and wind farms, and can click a plant or farm for its details. The layer names its sources and attribution. Both sprouts have their STAC files for the ledger. The sample was approved before the global runs. Costs are in the step READMEs in naturewatch-analysis. The catalog tests pass. No production deploy.
