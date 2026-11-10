# Task 09b — Cropland share tiles, version 3 (graded display)

Follows task 09 stage 1 ([`tiles/README.md`](https://github.com/marynvdl/naturewatch-analysis/blob/main/tiles/README.md), "Version 3"). The user chose option **B2** on 8 November 2026. This task replaces task 09 stage 2: version 3 is no longer a transcode of v2, because the tiles carry the cropland share, not a class.

## Goal

Publish `gs://nature-watch-tiles/cropland/2024/v3/cropland.pmtiles`, a PMTiles archive of Safari-safe palette PNG tiles that carry how much of each cell is cropland, so the app can draw faint where sparse and strong where dense, as Global Forest Watch does for treeloss.

## Decided in task 09

| Choice | Value |
| --- | --- |
| Encoding | Palette PNG, 4 bits. Index 0 is nodata (tRNS alpha 0). Index k + 1 is shade k of 8 (k = 0 to 7). Red is the share on a 0–255 scale, 255 × (k / 7)², so shades are evenly spaced in √share. Any share above 0 is at least shade 1. No gray PNG |
| Top zoom | Two shades (share below 0.5 is 0, otherwise 255), 2-bit palette. The map draws it solid |
| Tile size | 512 px. Archive zoom 0 to 11. The top tile holds zoom 12 pixels, so solid is from archive zoom 11 (`--solid-zoom 11`) |
| Pyramid | The task 04 share pyramid: parent share is the weighted mean of its children, from the sprout at the top zoom |
| Paint | Opacity 0.2 + 0.75 × √share below the solid zoom, solid from it, in the app's orange. Two layers with `maxzoom` and `minzoom`; see `tiles/v3_check/shade.html` |
| Size | About 1.75 times a class palette archive. About 3.4 GB estimated, an upper bound. v2 is 2.81 GB |
| Accuracy | Mean opacity error about 1 point, worst 5.8, against the unquantised share |

Code that exists: `transcode.py share` (share archive to palette), `cropland.py --resampling share` (share pyramid, tested on windows only), and `tests`.

## What to do

1. Branch from `main`. Do not start from the task 09 branch.
2. Make `tiles/global_cropland.py` build share shards: accept `share`, call the share reduction, write palette tiles at 512 px with the settings above, record `share_steps`, `share_curve`, `solid_zoom` and `tile_size` in the metadata, and include them in the shard settings hash so an old shard is never reused.
3. Test on a tightly cropped window first, then compare the window with `cropland.py build --resampling share` and `transcode.py share` output tile for tile.
4. Pilot one shard on the laptop sample, then one shard in Batch (cents). Check wall time, peak memory and bytes against the estimate.
5. Estimate the full run from the pilot, explain it and get approval. Then run the shard job and the merge job by hand.
6. Verify before upload: every tile id has a v2 tile, nodata matches v2 exactly, and the share against the sprout for a stated sample (error numbers as in task 09). Safari on macOS, Chrome, with `shade.html`.
7. Upload with `Cache-Control: public, max-age=31536000, immutable`. Check 206 and CORS.
8. Record the run in `tiles/README.md` and update `docs/pipelines.md`.

## Cost (estimate, needs approval)

v2 ran as 302 shard tasks on spot `e2-standard-2` (22.4 task hours, about 3 h wall, about $2–3) and one merge on `e2-standard-4` (468 s, under $0.20). Expect the same shape, a little more for the share arithmetic. Storage about $0.07 a month. No egress inside the region. A one-shard pilot is a few cents. Nothing is started before approval.

## Do not

- Do not overwrite or delete `cropland/2024/v1/` or `v2/`. The live app reads v2 until the app task merges.
- Do not use a gray PNG.
- Do not change the app catalog. The app task sets `tileSize: 512`, `maxzoom: 11`, the paint and the legend text. The layer now shows a share, so the info text changes.
- Do not start a Batch job, VM or large download before the estimate is approved.
- Do not commit a key, token or `.env` content.

## Done when

- `v3/cropland.pmtiles` exists, passes the checks in step 6, and draws without artefacts in Safari and Chrome.
- Run record, bytes, tile count, wall time, peak memory and cost are in `tiles/README.md`. No virtual machine is left running.
- `python -m pytest tiles cookbook` passes. One pull request into `main`. Do not merge it.
