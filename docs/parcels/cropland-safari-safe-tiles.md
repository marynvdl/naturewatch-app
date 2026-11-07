# Parcel: Cropland tiles for Safari

Fix the orange dotted artefacts on the Cropland layer in Safari on Mac, and in Safari and Brave on iPhone. Chrome is not affected.

## Goal

A person on any browser sees Cropland only where the dataset says cropland. Safari shows the same map as Chrome.

## What we know

The published tiles are correct. The version 2 archive stores class values as 8-bit gray-and-alpha PNGs. Safari's decoder alters gray PNG pixels, so a tile that is all class 0 comes back with scattered 1s, which the map paints orange. A canvas decode test on 7 November 2026 showed:

- Gray + alpha, and gray without alpha, are wrong in Safari, with class values 0 and 1 or 0 and 255.
- RGB, RGBA and palette PNGs are exact, with class values 0 and 1 or 0 and 255.

So the cause is the tile encoding, not Mapbox settings or the colour expression. The fix is to publish the class tiles in a truecolour or palette PNG, not gray. Colour stays in the client. The red channel already carries the class through `classRasterPaint`.

## Plan

Task 09 first finds the cheapest reliable route, with no billable processing, then stops for approval. It compares RGB with R = 0 and 1 against RGB or RGBA with R = 0 and 255, and checks whether the existing archive can be transcoded without redoing the COG-to-tile build. It measures cold load in the browser against Global Forest Watch treeloss, benchmarks tile and archive size, and recommends delivery and layout changes (CDN, cache headers, PMTiles directories, optional 512 px tiles) where they help. It tests the real Mapbox and PMTiles path in Safari and Chrome. After approval it writes `cropland/2024/v3/cropland.pmtiles` and verifies it before publishing.

Task 10 points the layer at v3 and adjusts the colour paint if the encoding needs it. The v2 archive stays until v3 is live.

## Left for later

- Deleting the v2 archive.
- Checking other class-value layers for gray PNG tiles. None exist yet besides cropland.
- A production release. Merge app work into `develop` only.

## Tasks

Do one task at a time, in this order. Start a task only after the one above it has merged.

- [ ] [task-09-cropland-rgb-tiles-v3.md](https://github.com/marynvdl/naturewatch-analysis/blob/docs/cropland-rgb-tiles-task/docs/tasks/task-09-cropland-rgb-tiles-v3.md) — naturewatch-analysis
  - *Goal:* Find the cheapest reliable Safari-safe encoding, prove it on the real map path, stop for approval, then publish and verify the v3 archive.
- [ ] [task-10-cropland-rgb-tiles-on-the-map.md](../tasks/task-10-cropland-rgb-tiles-on-the-map.md) — naturewatch-app
  - *Goal:* Point the cropland layer at v3, change the colour paint if the encoding needs it, and check Safari.

## Done when

Safari on Mac and iPhone draw Cropland like Chrome. The v3 archive was verified pixel for pixel against v2 before publishing. Costs are in `tiles/README.md` in naturewatch-analysis. The catalog tests pass. No production deploy.
