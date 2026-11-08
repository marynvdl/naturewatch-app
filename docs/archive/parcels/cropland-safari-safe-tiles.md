# Parcel: Cropland tiles for Safari

Archived 8 November 2026. Version 3 shipped as 512 px share tiles (task 09b), not a transcode of v2. The Crops layer reads `gs://nature-watch-tiles/cropland/2024/v3/cropland.pmtiles`.

Fix the orange dotted artefacts on the Cropland layer in Safari on Mac, and in Safari and Brave on iPhone. Chrome is not affected.

## Goal

A person on any browser sees Cropland only where the dataset says cropland. Safari shows the same map as Chrome.

## What we know

The published tiles are correct. The version 2 archive stores class values as 8-bit gray-and-alpha PNGs. Safari's decoder alters gray PNG pixels, so a tile that is all class 0 comes back with scattered 1s, which the map paints orange. A canvas decode test on 7 November 2026 showed:

- Gray + alpha, and gray without alpha, are wrong in Safari, with class values 0 and 1 or 0 and 255.
- RGB, RGBA and palette PNGs are exact, with class values 0 and 1 or 0 and 255.

So the cause is the tile encoding, not Mapbox settings or the colour expression. The first plan was to publish class tiles in a truecolour or palette PNG, not gray. Colour stays in the client. On 8 November 2026 the published v3 archive is graded cropland share instead: palette PNGs, 512 px, zooms 0–11, eight √share shades in the red channel.

## Plan

Task 09 first finds the cheapest reliable route, with no billable processing, then stops for approval. After the share-tile decision, task 09b writes `cropland/2024/v3/cropland.pmtiles`. Task 10 points the layer at v3, sets `tileSize` 512 and `maxzoom` 11, and paints the share. The v2 archive stays.

## Left for later

- Deleting the v2 archive.
- Checking other class-value layers for gray PNG tiles. None exist yet besides cropland.
- A production release. Merge app work into `develop` only.

## Tasks

Do one task at a time, in this order. Start a task only after the one above it has merged.

- [x] [task-09-cropland-rgb-tiles-v3.md](https://github.com/marynvdl/naturewatch-analysis/blob/main/docs/tasks/task-09-cropland-rgb-tiles-v3.md) — naturewatch-analysis
  - *Goal:* Find the cheapest reliable Safari-safe encoding, prove it on the real map path, stop for approval, then publish and verify the v3 archive.
- [x] [task-09b-cropland-share-tiles-v3.md](https://github.com/marynvdl/naturewatch-analysis/blob/main/docs/tasks/task-09b-cropland-share-tiles-v3.md) — naturewatch-analysis
  - *Goal:* Publish the version 3 archive as 512 px share tiles, zooms 0–11, eight √share shades.
- [x] [task-10-cropland-rgb-tiles-on-the-map.md](../tasks/task-10-cropland-rgb-tiles-on-the-map.md) — naturewatch-app
  - *Goal:* Point the Crops layer at v3, paint the share, and keep the info card on screen.

## Done when

Safari on Mac and iPhone draw Cropland like Chrome. The v3 archive is the 512 px share tiles from task 09b. Costs are in `tiles/README.md` in naturewatch-analysis. The catalog tests pass. No production deploy.
