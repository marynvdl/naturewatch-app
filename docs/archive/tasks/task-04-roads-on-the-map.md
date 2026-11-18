# Task 04 — Roads on the map

Parcel: [Roads](../parcels/roads.md).

Repository: naturewatch-app. Start from `develop`. Task 03 is merged in both repos, and the archive is published.

## Goal

Add a Roads layer to the threats group. Below zoom 11 it is painted by the share of road cells. At zoom 11 it is painted by road level, with unpaved roads drawn fainter. It names the Overture release and the attribution.

## Facts already stored

- The archive is `https://storage.googleapis.com/nature-watch-tiles/roads/2026-10/v1/roads.pmtiles`: 512 px palette PNGs, zooms 0–11, red carries the value, and index 0 is transparent. Below zoom 11 there are 8 shades: shade k stores red = round((k / 8)² × 255), with k = max(1, round(√(share / 0.25) × 8)). At zoom 11, red = level × 4 + surface. Level runs 1 track, 2 minor, 3 main, 4 major. Surface runs 0 unknown, 1 paved, 2 unpaved. So the values are 4–6, 8–10, 12–14 and 16–18. The recipe is `cookbook/recipes/roads-2026-10-v1.yaml` in naturewatch-analysis.
- Release `2026-10-21.0`. Attribution: © OpenStreetMap contributors, Overture Maps Foundation. Licence ODbL-1.0. The bucket answers 206 with CORS for `http://localhost:5173`. The run record is in `roads/README.md` in naturewatch-analysis.
- In task 03 the world view looked heavy: 46% of road pixels at zoom 2 are shade 1, a share under 0.9%.
- The Crops layer (`cropland`) is the pattern to follow. `sharePaint` in `layers.json`, `shareRasterPaint` in `src/catalog/rasterColor.ts` and `MapComponent.vue` draw a graded layer below `solidZoom` and a solid layer from it. Opacity is 0.2 + 0.75 × √share. `classRasterPaint` colours class values from the red channel.
- The timeline ends at the highest year of any published layer, 2025 now. Colours already in use: grey `#767676` (Built), pink (Tree loss), red-orange (Fire), orange (Crops), teal-grey (Dams), and green (Tree height).

## Do this

- Ask me when you are not 90% sure or something is unclear.
- Add `roads` after `cropland` in `layers.json`, titled Roads, in the threats group, published, a small button with a road icon from Lucide (add it to `src/icons/layerIcon.ts`). Use `tileSize` 512, `maxzoom` 11, nearest resampling, and years `[2025]`, `snapshot`. The tooltip and the source version name the release `2026-10-21.0`. The source is Overture Maps transportation, with its link.
- Extend `sharePaint` in the schema, the types, `rasterColor.ts` and the map, so that Crops renders exactly as it does now:
  - An optional minimum opacity, 0.2 when it is left out. Roads starts near 0.05. Tune it in the browser at zooms 1–4 so that sparse land reads light and Gauteng reads strong.
  - Optional class colours for `solidZoom` and above, with a satellite variant. When they are set, they replace the solid ≥ 0.5 rule. Roads gets the 12 values: one hue, darkest for major and lightest for track, and unpaved fainter than paved. Unknown surface sits between paved and unpaved.
- **Colour comparison.** Before the colour is fixed, show me two candidates side by side in the browser, each on the monochrome and the satellite basemap, at zoom 2, zoom 8 over Gauteng, and zoom 11 over Nairobi:
  1. charcoal, with a light grey on satellite;
  2. a bluer grey, with a lighter shade of it on satellite.
  Both must be distinguishable from Built's `#767676`. Put the chosen one in the catalog.
- Write the info card in the same style as Crops: what the shades mean, what zoom 11 shows, that unpaved is fainter, that paths are left out, the release and the attribution with the ODbL link. Keep the card inside the viewport on a narrow screen.
- The map turns the Mapbox attribution control off (`attributionControl: false` in `MapComponent.vue`), so the info card holds the attribution. Add "attribution on the map while a layer is on" to the parcel's Left for later.
- Catalog tests: the roads URL, the tile settings, the paint (minimum opacity, the zoom 11 classes, the satellite variant), and the unchanged Crops paint.
- `docs/user/data.md`: a Roads entry after Crops, the same shape as Crops' entry. `docs/blueprint.md`: add the roads seed and sprout prefixes to the bucket table rows, the archive to the tiles row and the PMTiles list, and one sentence on how the client paints Roads. Do not copy the pipeline procedure.
- Check in the browser with the `browser-check` skill, wide and narrow: zoom 2, Gauteng and Chinko at zoom 8, Nairobi at zoom 11 and 13, an ocean area that stays clear, the timeline at 2024 (Roads hidden) and 2025, both basemaps, and the info card. Look once in Safari on Mac.

## Do not

- Do not change the Crops look, its archive, or any other layer.
- Do not change the archive, the recipe or the encoding. If the paint cannot work with them, stop and ask.
- Do not register the sprout in `sprouts` or add a place stat.
- Do not open a pull request from `develop` into `main`.

## Done when

- Roads turns on in the threats group and draws the global archive: share shades below zoom 11 and road levels from zoom 11, with unpaved fainter. Ocean and land without roads stay clear.
- The world view reads lighter than the task 03 preview. The colour is the one I picked from the comparison.
- The info card and the user doc name release `2026-10-21.0` and the attribution.
- Crops looks the same as before.
- The catalog vitest suite, `npm run type-check` and `npm run lint` pass.
- One pull request into `develop`, with the wide and narrow screenshots. Report its address and the required checks. Claude does not merge it.

## How to work

Branch `feat/task-04-roads-on-the-map` from `develop`. Do this task only. Run the catalog vitest suite before the pull request. Do not commit secrets. Do not add AI or tool attribution.
