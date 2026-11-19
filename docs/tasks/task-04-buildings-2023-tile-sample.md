# Task 04 — Buildings 2023 tile sample

Parcel: [Buildings 2023](../parcels/buildings-2023.md).

**Resumed 19 November 2026 on sprout v1.** The sample showed speckle at Kocho, from Google's mean presence with no cut. [Task 03b](../archive/tasks/task-03b-buildings-2023-google-cut-test.md) found a cut in Earth Engine too costly, so the tiles thin the speckle instead (step 3, Google speckle). Rebiana's missing village is in the parcel's Left for later.

Repository: naturewatch-analysis. Start from `main`, after task 03 has merged.

## Goal

Build the share pyramid from the published sprout on seven small windows, on the laptop. Choose the top zoom, the top-zoom rule, the shade curve, how a parent combines its children, and whether empty land is stored. Stop for approval. Do not build the global archive.

## Facts already stored

- The sprout is `gs://nature-watch-bucket/sprouts/buildings/2023/v1/buildings-2023.vrt`: band `share` (uint8, share = value ÷ 250, nodata 255) and band `source` (0 none, 1 Google, 2 TEMPO), EPSG:4326 at 0.00025°. `sprout/README.md` "buildings 2023" has the run and the box check.
- The recipe `cookbook/recipes/buildings-2023-v1.yaml` already sets `tile_size` 512, `encoding` share-palette, `resampling` share, `share_steps` 7 and `share_curve` sqrt. Its comment leaves `max_zoom`, the top-zoom rule and the parent rule to this task.
- `roads/tiles.py` is the nearest pattern: `layer` warps the top zoom from a sprout VRT with `average`, `reduce` takes the mean of four children with an absent child as 0, `shade_index` spaces shades in √(share / `full`), `palette_png` writes the 4-bit palette, and `build` writes a local window archive through `tiles/pyramid.py`. `roads/preview.py` serves archives with Range requests on a Mapbox map. `roads/render.py tiles` draws an archive over Esri imagery.
- Roads chose top zoom 11 and `full` 0.25, because road share is small and √share up to 1 put 78% of road pixels in the two faintest shades (`roads/README.md`, "Top zoom" and "Shades"). Cropland version 3 chose top zoom 11 and solid at share 0.5 or more (`tiles/README.md`, "Version 3").
- Cropland and roads store index 0 differently. Cropland keeps nodata apart from share 0. Roads stores no tile without a road. Buildings has nodata only where neither source exists, mostly sea.
- Google's 2023 edge in the Sahara runs along Libya's borders: 9.80° E at 27.5° N in the sprout (parcel, Design).
- The comparison boxes are in `buildings/boxes.yaml`. The sprout's km² for each is in `sprout/README.md`, "Check against task 01".

## Do this

1. **Script.** `buildings/tiles.py`, with `window` and `compare` commands, reusing `roads/tiles.py` and `tiles/pyramid.py` where they fit rather than copying them. It reads the sprout VRT over HTTPS, one window at a time. The settings below are flags, so one window can be built several ways.
2. **Windows.** 1° × 1°, added to `buildings/boxes.yaml` as `window` entries:
   - a rural Sahel village, centred on `kongoussi`;
   - Bria;
   - Kocho, centred on 6.30532° N, 23.859° E;
   - Mueda;
   - Saint-Flour (TEMPO);
   - empty desert where only TEMPO exists, in Libya beyond Google's edge, for example the Rebiana sand sea near 24.2° N, 22° E;
   - Google's edge at 9.8° E, 27.5° N, with both sides in the window.
3. **Settings to compare.** Start from cropland's settings and change one at a time:
   - Top zoom: 11, 12 and 13. A 512 px tile at zoom 11 is about 38 m a pixel at the equator, against 28 m sprout cells.
   - Top-zoom rule: graded as below it, or solid from a threshold. Try 0.5 (cropland) and lower ones, and report how much of the built area each one drops at Kongoussi and Mueda.
   - Shade curve: `full` 1 (cropland) against lower values such as 0.25 (roads). Report the share of built pixels in each shade at zooms 4, 8 and 11.
   - Parent rule: the mean of the children (cropland and roads) against the maximum. Report what each does to the lone buildings at Kongoussi and to TEMPO's leftover noise in the desert window.
   - Nodata: kept apart from share 0 (cropland), or tiles with no building not stored (roads). Report both archive sizes.
   - Google speckle, on Google cells only, from the recommended settings: a floor of 0.008, 0.012 or 0.016, and the seed rule (a Google cell within 2 km reaches 0.15). Report the cells and km² each removes in the Kocho, Bria, Kongoussi and Mueda windows. Judge them in the preview over imagery. `buildings/README.md` "Google cut test (task 03b)" has what each floor removes against the exact cut.
4. **Check the share.** At the top zoom of each window, the built area summed from the tiles equals the sprout's km² over the same cells within rounding. The Kongoussi, Bria, Mueda and Saint-Flour boxes inside their windows match `sprout/README.md`.
5. **Look.** Serve the samples with `roads/preview.py` or a copy of it, light grey with the share paint, on satellite and the app's monochrome basemap. Check the edge window for a seam where Google meets TEMPO, and the desert window for a haze. Write renders with `render.py` for the README.
6. **Report and stop.** Per window and setting: tiles, bytes, wall time and peak memory. Recommend one setting for each choice in step 3, with the figures behind it. Estimate the global archive from the windows and from the cropland and roads archives, as tiles, bytes, task hours and cost, with the assumptions. Stop for approval.
7. **Record.** After approval, write the chosen settings on the recipe (`max_zoom`, the top-zoom rule, `full`, the parent rule, how nodata is stored, and the Google speckle rule). Record the sample, the figures and the approval in `buildings/README.md`. Update the Tiles row in `docs/pipelines.md`. The sample reads a few MB from the bucket and runs on the laptop: say that, with the egress figure.

## Do not

- Do not build or upload the global archive. Task 05 does that.
- Do not upload the sample to `nature-watch-tiles`, and do not submit a Batch job.
- Do not read more than the windows from the sprout.
- Do not change the sprout, the seeds, or the app catalog.
- Do not add a GitHub workflow that starts on push.

## Done when

- A local preview shows the seven windows under the settings compared.
- The comparison, the share check and the global estimate are in `buildings/README.md`.
- The approved settings are on the recipe, or the pull request waits on that approval and says so.
- The global PMTiles object does not exist.
- `python -m pytest buildings roads tiles cookbook` passes.
- One pull request into `main` in naturewatch-analysis, and one into `develop` here with this file and the parcel link. Each links the other. Neither is merged by Claude.

## How to work

Read `../naturewatch-analysis/CLAUDE.md` first. Branch `feat/task-04-buildings-2023-tile-sample` from `main` there. Do this task only. Do not commit secrets. Do not add AI or tool attribution.
