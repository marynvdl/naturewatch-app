# Task 07 — Cropland on the map

Parcel: [Cropland 2024 global](../parcels/cropland-2024-global.md)

Repository: naturewatch-app. Start only after task 05 has published the archive.

## Goal

Draw the global cropland layer from the published PMTiles archive. Keep class colouring in the client.

## Facts already stored

Task 05 publishes `gs://nature-watch-tiles/cropland/2024/v2/cropland.pmtiles`. Zooms 0–12. Pixels are class values: gray 1 is cropland, gray 0 is other land, and nodata is empty. The South Africa tiles remain individual PNG files at `gs://nature-watch-tiles/cropland/2024/v1/{z}/{x}/{y}.png`.

The catalog layer `cropland` in `frontend/naturewatch/src/catalog/layers.json` still requests that PNG template. `addSourceToMap` in `frontend/naturewatch/src/components/MapComponent.vue` adds a raster source with a `tiles` template. Places already pass an `https` URL ending in `.pmtiles` as a vector source URL. The installed Mapbox GL JS is 3.34.

Place facts still read sprout `cropland-2024-v1`. Task 08 changes that read.

## Do this

- Point the `cropland` layer at the version 2 archive. Keep `maxzoom` 12, nearest resampling, and class 1 coloured `#e59139` through `classRasterPaint`.
- Teach the raster source path to load one PMTiles URL. Places load `.pmtiles` as a source `url`. Use that for this raster layer when the raster source accepts it. Leave the `{z}/{x}/{y}` template in place for the other raster layers.
- Say in the layer info that the snapshot is global 2024, from UMD GLAD annual cropland, and that it is a different product from the 2015 and 2019 crops snapshots.
- Update the catalog test that expects the South Africa PNG template.
- Update `docs/blueprint.md` and `docs/user/data.md` where they say the 2024 cropland tiles are South Africa PNG files.
- Confirm in the browser that the layer draws, that class 1 is orange, and that a missing ocean area stays clear. Check a wide screen and a narrow screen.

## Do not

- Do not change sprout `cropland-2024-v1` on the place read. Task 08 does that.
- Do not change the 2015 and 2019 crops layer.
- Do not upload tiles. The archive is already published.
- Do not start task 08 until this map read is merged.
- Do not open a pull request from `develop` into `main`.

## Done when

- The cropland control draws the global archive. The South Africa PNG template is no longer the `cropland` layer URL.
- Class 1 is orange and class 0 stays clear. Zooming past 12 enlarges zoom 12.
- The catalog tests pass.
- The work is checked in the browser on a wide screen and a narrow screen.
- The work is on a branch from `develop`, in one pull request into `develop`. Report the pull request address. Do not merge it.

## How to work

Branch from `develop`. Do this task only. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
