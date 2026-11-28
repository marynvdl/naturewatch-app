# Threat Layers

Notes for a family of parcels that add pressure layers in the [Roads](../archive/parcels/roads.md) pattern. Each parcel is one theme layer on the map. This page holds the design they share and their order. Their tasks are in the theme parcels.

*Defined 27 November 2026 as one parcel, taken out of step 1 of [Pressure and Cores](pressure-and-cores.md). Split into theme parcels the same day, after the user looked at Open Infrastructure Map. None of this waits for the [Stats Ledger](stats-ledger.md) or [Shaping Boundaries](../archive/parcels/shaping-boundaries.md).*

## Parcels

Do one parcel at a time, in this order. The ones after the first are notes until they start.

1. [Energy](energy.md): power lines, power plants, and solar and wind farms.
2. [Water](water.md): dams and reservoirs, water pipelines and canals, treatment plants, and pumping stations. Replaces the current Dams layer.
3. [Mines](mines.md): mine and quarry footprints. Replaces the Mines placeholder.
4. [Oil and Gas](oil-and-gas.md): pipelines, wells, and facilities.
5. [Transport](transport.md): railways added to the Roads layer. Small, so it can go in any gap.

## Shared design

- **Map layers are themes, sprouts are kinds.** One map toggle per theme, as on Open Infrastructure Map, where a click shows a feature's operator and other attributes. Underneath, each kind of pressure (power lines, solar farms, dams, wells) gets its own seed and sprout, so the pressure sandbox can weight them separately.
- **Seed.** The source as published, pinned by release or download date, as GeoParquet split by 10° block. Each feature keeps the source's own class and the attributes worth a click, so a layer can be reclassed or re-tiled without reading the source again. OpenStreetMap features come through Overture's `base/infrastructure` theme, from the roads release `2026-10-21.0` unless a parcel moves to a later one.
- **Sprout.** COGs per 10° block on the roads grid, EPSG:4326 at 0.00025°, with a VRT and static STAC files beside them. Lines mark the cells they touch, like Roads. Polygons mark the cells inside them. Each parcel's sample task sets how points are drawn and the band layout.
- **Tiles: raster, vector, or hybrid.** Each sample task chooses.
  - Raster, the cropland version 3 and roads design (palette PNG, a share pyramid, the class at the top zoom), for dense networks with few useful attributes, such as power lines and railways.
  - Vector PMTiles from the seed with Tippecanoe, for sparse features with attributes worth a click, such as plants, dams, pipelines, and wells.
  - Hybrid, a raster share zoomed out and vector features zoomed in, where a vector world view looks too sparse.

  The sprout stays raster for every layer, because the ledger and the sandbox read cells. A small seed can be tiled on the laptop without Batch.
- **Map.** A snapshot layer in the Pressures group in `layers.json`, with the Landscape/Measure panel style and an info card for the sources and attribution. Vector features open a feature card on click, following the clickable places tiles. Paint next to Roads and Built.
- **Licences.** Each sample task records each source's licence and what it requires of a derived sprout. OpenStreetMap data through Overture is ODbL, as with Roads.
- **Cost.** Each sample task runs on the laptop on a cropped window, records bytes, wall time, and peak memory, writes the expected global cost, and stops for approval. Batch jobs stay within the 32-CPU project quota. The pilot shard is checked against the sprout VRT before a full run.

## Deferred

- The ledger column for each sprout. It is added with the [Stats Ledger](stats-ledger.md).
- Pressure weights and distance decay. They are set in the sandbox in [Pressure and Cores](pressure-and-cores.md).
- Telecoms, which Open Infrastructure Map also shows, until the sandbox shows a need.
