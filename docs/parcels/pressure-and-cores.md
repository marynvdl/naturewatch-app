# Parcel: Pressure and Low-Footprint Cores

A combined human-pressure layer built from the threat layers, and from it the large, connected areas with the lowest footprint. Those areas become places of type `old_growth`.

*Started 26 November 2026 as notes, from the user's brainstorm. Not defined yet. It follows the [Stats Ledger](stats-ledger.md).*

## Order

1. **More threat layers.** Railways, power lines, mines, dams, and pipelines, as seeds, sprouts, tiles, and map layers, in the [Threat Layers](threat-layers.md) parcel. Each sprout then becomes a ledger column, which gives per-place stats and a pressure input in one go.
2. **A weight sandbox on the laptop.** Windows such as the Karoo with Karoo National Park, Kruger, Congo, Borneo, the Cerrado, rural France, and the Sahel, with one band per layer and pressure recomputed in the browser as the weights change. It can start on built, crops, and roads before step 1 ends.
3. **The pressure sprout**, at about 300 m to 1 km, built from the tally COGs, then its tiles.
4. **Delineation**, then the `old_growth` places and a stats sweep over them.

## Design so far

- **Weights with distance decay** per source, in the manner of the Human Footprint (Venter et al. 2016; Mu et al. 2022) and Human Modification (Kennedy et al.). Calibrate against known intact and modified places, and compare with those indices.
- **Sparing over sharing.**
  1. Smooth the pressure over a window of 2–5 km, so scattered farmsteads and tracks read as a continuous haze.
  2. Keep core cells a set distance from pressure (MSPA: core, edge, bridge, islet). Drop islets.
  3. Label connected components, let a light crossing such as a dirt track act as a bridge, and require a minimum core area and width per biome.
- **Places.** Each core becomes an `old_growth` place, with `old_growth_details.delineation_method` and `methodology_version`. A new methodology version writes new boundary versions.

## Open questions

- **The user-facing name: "old-growth" or "core habitats".** Decide before the places are published in step 4. Ids stay `old_growth`. The scripts use the working term "low-footprint cores".
- The minimum core area and width per biome.

## Deferred

- Grazing (Gridded Livestock of the World), boreholes, night lights, population, and travel time to cities, until the sandbox shows a gap, the Karoo first.

## Tasks

None yet.
