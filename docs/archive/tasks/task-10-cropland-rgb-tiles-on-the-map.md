# Task 10 — Cropland version 3 tiles on the map

Archived. This task is not active.

Parcel: [Cropland tiles for Safari](../parcels/cropland-safari-safe-tiles.md)

Repository: naturewatch-app. Start only after task 09 in naturewatch-analysis has published and verified `gs://nature-watch-tiles/cropland/2024/v3/cropland.pmtiles`.

## Goal

Draw cropland from the version 3 archive, so Safari on Mac and iPhone shows no orange dots where there is no cropland.

## Facts already stored

The `cropland` layer in `frontend/naturewatch/src/catalog/layers.json` reads `.../cropland/2024/v2/cropland.pmtiles`. Those tiles are gray-and-alpha PNGs. Safari decodes gray PNGs wrongly, so pixels that are 0 come back as 1 or 2. The 1s are painted orange. RGB, RGBA and palette PNGs decode exactly. Task 09 has the test results.

`classRasterPaint` in `frontend/naturewatch/src/catalog/rasterColor.ts` colours class 1 through `raster-color-mix [255, 0, 0, 0]`, `raster-color-range [0, top]` and a `step` at `value - 0.5`. It reads the red channel. Task 09b published share tiles instead of class RGB: 512 px palette PNGs, zooms 0–11, eight √share shades in the red channel. The app paints that share, `#e59139` on the monochrome basemap and `#f49a3c` on satellite.

## Do this

- Ask me when you are not 90% sure or something is unclear. The encoding comes from task 09's recommendation.
- Point the `cropland` layer at the version 3 archive. Set `tileSize` 512 and `maxzoom` 11.
- Apply the `resampling` choice task 09 recommends. Keep nearest unless it says otherwise.
- Paint the share: opacity `0.2 + 0.75 × √share` below zoom 11, solid from zoom 11 when the share is at least half. Update the catalog tests.
- Update the catalog test that expects the v2 URL.
- Update `docs/blueprint.md` (the bucket table and the cropland paragraph) and `docs/user/data.md` where they name v2 or describe the tile encoding. Say once, in the blueprint, that class tiles must not be gray PNGs because Safari alters them. Do not copy the pipeline procedure here.
- Remove the old Africa Crops layer from the catalog and rename the Cropland button to Crops.
- Keep the Crops info card inside the viewport when the description is open, including on a narrow screen.
- Check in the browser: Chrome, Safari on Mac, and Safari on iPhone (Brave on iPhone too if you can). Check the Zakouma area near 10.02° N, 22.63° E, low and high zooms, tile edges, the light and satellite basemaps, an ocean area that stays clear, and a wide and a narrow screen. Put screenshots of the Safari result in the pull request.

## Do not

- Do not change the 2015 and 2019 crops layer, or the fire layer.
- Do not change sprout `cropland-2024-v1` or `cropland-2024-v2` on the place read.
- Do not delete the v2 archive.
- Do not open a pull request from `develop` into `main`.

## Done when

- The `cropland` layer URL is the version 3 archive.
- Safari on Mac and iPhone show no dots outside cropland, and the result matches Chrome.
- Share paint is orange, faint where sparse and strong where dense. From zoom 11 a cell is solid if at least half of it is cropland. Nodata stays clear.
- The catalog tests pass, including the changed ones.
- The work is on a branch from `develop`, in one pull request into `develop`. Report the pull request address and the required checks. Do not merge it.

## How to work

Branch from `develop`. Do this task only. Run the catalog vitest suite before the pull request. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
