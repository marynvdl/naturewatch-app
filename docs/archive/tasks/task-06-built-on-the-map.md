# Task 06 — Built on the map

Parcel: [Buildings 2023](../parcels/buildings-2023.md).

Repository: naturewatch-app. Start from `develop`. Task 05 is merged in both repos, and the archive is published.

## Goal

Draw the `built` layer from the Buildings 2023 archive, graded in grey at every zoom, and say in the About text, `docs/user/data.md` and `docs/blueprint.md` what it shows.

## Facts already stored

- `gs://nature-watch-tiles/buildings/2023/v1/buildings.pmtiles` is published with the immutable cache header and answers 206 with CORS (task 05). `cookbook/recipes/buildings-2023-v1.yaml` `tiles` in naturewatch-analysis holds its settings: 512 px palette PNGs, zooms 0–12, index 0 nodata, shade k of 7 stores red = 255 × (k / 7)², shade k is round(√(share / 0.25) × 7), so a quarter covered or more is the darkest shade. The top zoom is graded, not solid. Empty tiles are not stored.
- The `built` entry in `frontend/naturewatch/src/catalog/layers.json` reads the old XYZ tiles at `built/2023/` and names Open Buildings polygons with GHSL 2020 as fill.
- `shareRasterPaint` in `src/catalog/rasterColor.ts` builds a graded paint and a solid paint. `MapComponent.vue` adds the graded layer below `solidZoom` and the solid one from it. `solidZoom` is required in `layers.schema.json`, `catalog/types.ts` and `interfaces/MapLayerInterface.ts`.
- `shareRasterPaint` puts its stops at red = 255 × (k / steps)², with opacity rising evenly in k. With `steps` 7 those are the Buildings tiles' shades. Roads uses `minOpacity` 0.05.
- The parcel's Sources and Design sections hold the sources, licences, the Google–TEMPO edge and what the seed rule removed.

## Do this

1. **Graded at every zoom.** Make `solidZoom` optional in the schema, `catalog/types.ts`, `MapLayerInterface.ts` and `SharePaint`. Without it, `shareRasterPaint` returns only the graded paint and `MapComponent.vue` adds one layer with no zoom limits. Crops and roads keep their two layers.
2. **Catalog entry.** Keep id `built` and its place in the threats group. Point it at the archive with `maxzoom` 12, `tileSize` 512, `resampling` `nearest`, and `sharePaint` with `steps` 7, `minOpacity` 0.05 and no `solidZoom`. Start from `color` `#767676` on the basemap and `colorSatellite` `#e0e0e0` on satellite, and tune both in the browser check. Set `display.color` to the basemap colour. Source: Google Open Buildings 2.5D Temporal and Microsoft TEMPO 2023 Q4, `version` `v1`.
3. **About text.** One 2023 snapshot. Grey is how much of each cell is covered by buildings: faint where sparse, strongest where a quarter or more is covered. Google Open Buildings 2.5D Temporal where it has data, Microsoft TEMPO elsewhere, with links and licences (CC BY 4.0, CDLA Permissive 2.0). TEMPO marks faint buildings on empty land, so sparse TEMPO cells far from a denser one are removed, and some desert villages beyond Google's area are missing. It does not say how a building is used. Tiles run through zoom 12, and closer zoom enlarges them. A timeline year other than 2023 still shows this snapshot. A short legend list, as Crops and roads have.
4. **Tests.** Update the catalog tests for the new entry, and add a `rasterColor` test for a share paint without `solidZoom`.
5. **Docs.**
   - `docs/blueprint.md`: add the Buildings archive to the PMTiles paragraph beside roads, and say that a share paint without `solidZoom` is graded at every zoom.
   - `docs/user/data.md`: rewrite the Built section for the new sources, the 2023 snapshot, the Google–TEMPO edge, and what is removed or missing. Drop the "Not in the map" paragraph about the older layers if it no longer applies.
6. **Browser check.** Run the `browser-check` skill at a wide and a narrow size, on the light basemap and on satellite: the world at zoom 2, Kongoussi (Burkina Faso) and Bria at zoom 12, the Google–TEMPO edge near 9.8° E, 27.5° N for a seam, and the Libyan desert for a haze. Open the About card on the narrow screen. Report the colours chosen.

## Do not

- Do not change the Crops or roads paint, or any other layer.
- Do not delete the old tiles at `built/2023/`.
- Do not register the sprout or add a building stat.
- Do not open a pull request from `develop` into `main`.

## Done when

- `built` draws from `buildings/2023/v1/buildings.pmtiles`, graded through zoom 12 and enlarged beyond it, with no solid rule.
- Sparse cells are faint, dense towns strong, nodata and empty land clear, on both basemaps.
- The About text, `docs/user/data.md` and `docs/blueprint.md` describe the new layer, each fact once.
- The catalog suite, `npm run type-check` and `npm run lint` pass.
- One pull request into `develop`. Report its address and the required checks. Claude does not merge it.

## How to work

Branch `feat/task-06-built-on-the-map` from `develop`. Do this task only. Do not commit secrets. Do not add AI or tool attribution.
