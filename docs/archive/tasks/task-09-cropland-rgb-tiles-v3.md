# Task 09 — Cropland tiles that Safari decodes correctly (version 3)

Parcel: [Cropland tiles for Safari](../parcels/cropland-safari-safe-tiles.md).

Repository: naturewatch-analysis.

## Goal

Find the least costly reliable way to publish the global cropland 2024 class-value tiles so that Safari draws them exactly as Chrome does, and so cropland loads as quickly as we can without changing the map design. Prove it before anything is published. Then, after approval, write the version 3 archive. Do not rebuild from the COGs unless the cheaper routes below fail.

## The bug

On Safari for Mac, and on Safari and Brave on iPhone (all WebKit), the Cropland layer shows orange patterned dots where there is no cropland. Chrome is correct.

The version 2 archive `gs://nature-watch-tiles/cropland/2024/v2/cropland.pmtiles` is correct. Its tiles are 8-bit gray-and-alpha PNGs (PNG colour type 4) with class 0 and class 1, no gamma or ICC chunks. The zoom 10 tile at 10.02° N, 22.63° E is 65,536 pixels of gray 0 with alpha 255.

## Facts already stored

Tested in Safari 26.4 on macOS on 7 November 2026, by decoding the PNG to a canvas and reading the pixels back. This does not use Mapbox. Colour conversion and alpha premultiplication settings made no difference.

| Encoding of the same tile | Safari reads |
| --- | --- |
| Gray + alpha, values 0 and 1 (the current tiles) | Wrong. The all-zero tile gets 8,960 pixels of 1 (35 rows of 256). The zoom 9 tile also gets value 2. |
| Gray + alpha, values 0 and 255 | Wrong. Pixels land on 1 and 254. |
| Gray, no alpha, values 0 and 255 | Wrong, same as above. |
| RGB, R = 0 and 1 | Exact |
| RGB, R = 0 and 255 | Exact |
| RGBA, R = 0 and 255, alpha 255 | Exact |
| Palette (colour type 3), index 0 → black, index 1 → red | Exact |

So any gray PNG is altered by Safari, and spreading the class values does not help. Truecolour and palette PNGs are exact. The Safari test did not use partial or zero alpha, and did not use the iPhone. Those are part of this task.

The client already reads the red channel: `classRasterPaint` in `frontend/naturewatch/src/catalog/rasterColor.ts` in naturewatch-app uses `raster-color-mix [255, 0, 0, 0]`, so R = 0 and 1 needs no client change. R = 0 and 255 needs the mix changed. That change is task 10 in naturewatch-app, not here.

The v2 build is described in `tiles/README.md`. It used 302 shards at zoom 5, merged into one archive. The merge task deleted the shards afterwards. The archive tiles are PNG with `tile_compression` none, and the directories are gzip. Metadata has `encoding: class-value`, `resampling: q3`.

The v2 archive is about 2.8 GB on `gs://nature-watch-tiles`, with about 5.08 million addressed tiles, a 1.6 KB root directory and about 3.4 MB of leaf directories. Mapbox loads it as one PMTiles `url` and fetches tiles with HTTP Range requests. The object is served with `Cache-Control: public, max-age=3600`.

The Treeloss layer in naturewatch-app reads Global Forest Watch XYZ PNG tiles from `tiles.globalforestwatch.org` through CloudFront. Each tile is its own URL. That path is optimised for edge caching and per-tile browser cache. Cropland feels slower in use; the reasons are not measured yet. Likely factors are direct GCS delivery without a CDN, PMTiles directory round trips before the first tile, small per-tile cache lifetime, 256 px tiles (more requests than 512 px), and gray-and-alpha PNGs that are larger than the two-class data needs. GPU colour (`classRasterPaint`) is unlikely to be the bottleneck.

Delivery changes (CDN, cache headers, CORS preflight cache) and archive layout (root directory size, tile size, encoding) belong in the recommendation unless they need a separate task or approval outside this parcel.

## Do this

- Ask me when you are not 90% sure or something is unclear.
- Work in two stages. Stage 1 costs nothing in the cloud. Stop after stage 1 and wait for approval.

### Stage 1: investigate (local, no billable processing)

1. **Candidates.** Compare, at least:
   - 8-bit RGB with R = 0 and 1 (G and B zero), alpha absent.
   - 8-bit RGB or RGBA with R = 0 and 255.
   - RGBA where nodata is alpha 0 and where nodata is represented another way (for example an unused class value), if alpha 0 turns out to be unsafe.
   - Optionally an indexed (palette) PNG, which passed the Safari test and may be the smallest.
2. **Transcode, don't rebuild.** Check whether the existing v2 archive can be read tile by tile and rewritten into the new encoding without the COG-to-tile build. Gray and alpha map one to one to R and alpha, so this should be possible. Confirm the shards are gone (`gcloud storage ls gs://nature-watch-bucket/scratch/tiles/cropland-2024-v2/`). Reading the archive costs a download of its bytes. Report bytes, where to run it (a machine in `europe-west1` to avoid egress, or a laptop), and the expected hours and cost for all candidates. Only if transcoding is wrong or impossible, estimate re-running the shard build with a new `encode` step, using the structure in `tiles/pyramid.py`.
3. **Exactness.** For a representative sample of tiles, spread over zooms 0 to 12 and over places with all-zero, mixed, all-one and partly-nodata tiles, prove the transcode keeps every pixel: the class value, and nodata. Report the count of tiles checked and the count that differ. It must be zero.
4. **Load time in the browser.** On a cold cache, measure how long cropland and treeloss take to show tiles on the same view in the real app (or a minimal page with the same sources). Use the browser Network panel. For each layer record: time to first visible tile, total requests, bytes transferred, OPTIONS preflights (if any), and whether responses are 206 Range or full GET. Compare one pan at a fixed zoom over land with cropland (for example Zakouma) and a similar view with treeloss. Say what you did and paste a short table in `tiles/README.md`. This is the baseline before optimisations.
5. **Benchmark.** For the candidates, on the same sample, report compressed PNG bytes per tile and in total, the extrapolated archive size, processing time per 1,000 tiles, and peak memory. Compare palette (colour type 3) against RGB and RGBA on size and decode time. Extrapolate total archive size and bytes per typical map view from step 4. Include directory overhead (header plus root and leaf reads) for v2 and for a v3 layout with a larger root directory if the writer allows it.
6. **Safari and Chrome, through the real path.** Build a small PMTiles sample in each candidate encoding and draw it in the real map path: Mapbox GL JS 3.34.x (the app's version) with the raster source `url` set to the archive, not a direct PNG decode. Use the app's `classRasterPaint` (and the changed mix for R = 255). Test in Safari on macOS, Chrome, and Safari on iPhone (Brave on iPhone too if available). Cover:
   - low and high zooms (at least 2, 6, 9, 12 and one past 12);
   - tile boundaries, with no seams or lines;
   - different basemaps: the app's Standard style, a light style, a satellite style and a dark style;
   - an area that is all class 0, a mixed area, and nodata (open ocean, or a 10° tile the publisher does not provide);
   - the Zakouma area near 10.02° N, 22.63° E, which shows the bug today. Include the v2 archive in the same page as the control, to show that the bug still appears there.
7. **Delivery and archive layout.** Recommend what to change for faster loads, with cost and who does it (this task, a follow-up task, or infrastructure outside the repos). At least cover:
   - A CDN or reverse proxy in front of `nature-watch-tiles` that caches Range responses for `.pmtiles` (for example Cloud CDN on the bucket, or Cloudflare). Estimate monthly cost at low and moderate traffic and whether invalidation on a new version path is enough (versioned URLs need no purge).
   - Object metadata on upload: `Cache-Control: public, max-age=31536000, immutable` for versioned archives, instead of `max-age=3600`. Bucket CORS: long `Access-Control-Max-Age` if preflights appear in step 4.
   - PMTiles directory depth: whether a larger root directory (up to about 16 KB on first read) cuts a round trip for typical views. Check what the merge or transcoder can set.
   - Tile size 512 px instead of 256: fewer requests per screen at the cost of a full rebuild and a catalog `tileSize` change in task 10. Estimate archive size and whether Mapbox still colourises class tiles correctly. Do not build 512 unless the recommendation says it is worth the cost.
   - Do not turn on billable CDN or change production bucket settings in stage 1. Stage 2 may set cache headers on the new v3 object only, after approval for anything that bills.
8. **Check `raster-resampling: nearest`.** The layer sets nearest resampling. For categorical data, nearest keeps class values unmixed, and Mapbox's raster-color works on the sampled value. Check on the real path whether `linear` would blend 0 and 1 into 0.5 and show wrong colours at edges, and whether nearest causes visible artefacts at fractional zooms. Report what you find and recommend keeping or changing it. Do not change the recipe or the app.
9. **Recommend.** Write which encoding, which route (transcode or rebuild), and which delivery or layout changes are the best value for faster loads without harming Safari correctness. One section in `tiles/README.md` for version 3. List follow-ups that are out of scope for stage 2 (for example global CDN enablement) as separate tasks if needed. Open a pull request into `main` with the investigation, scripts and tests. Do not publish.
10. Stop and wait for approval.

### Stage 2: build and verify version 3 (after approval)

- Write `gs://nature-watch-tiles/cropland/2024/v3/cropland.pmtiles` using the approved encoding and route. Keep the same tile ids, zoom range 0 to 12, tile type, metadata and `q3` resampling. Update metadata `description` and `encoding` to say the new encoding.
- Before upload, verify on the local file or scratch copy:
  - archive integrity: header, directories, counts of addressed tiles and entries, and that every tile id in v2 exists in v3, with no additions;
  - every tile's class values and alpha equal the v2 tile, for all tiles if it is cheap, and otherwise for a stated random sample of at least 10,000 tiles plus every non-uniform tile at zooms 0 to 8;
  - the file answers HTTP Range requests with 206 once uploaded, and `Cache-Control` is `public, max-age=31536000, immutable` (or the headers approved in stage 1);
  - Safari and Chrome draw the v3 file with no artefacts, at the zooms and places in stage 1.
- Upload after the checks pass. The tile bucket's CORS settings already allow the app origins, so confirm they apply to the new object.
- Explain the billable work, with the expected cost and a way to cancel, and get approval before starting it. After an authorized run, record the job ids, the output, how to check it, and how to cancel it, then return. Do not wait in the chat for a job.
- Record in `tiles/README.md`: archive bytes, tile count, wall time, peak memory, route, encoding, what was verified, and that no virtual machine was left running. Update the status table in `docs/pipelines.md`.

## Do not

- Do not overwrite or delete `cropland/2024/v2/`. The live app reads it until task 10 merges.
- Do not use a gray PNG, with or without alpha, for any class-value layer.
- Do not change the app catalog. Task 10 in naturewatch-app does that.
- Do not change the resampling choice (`q3`) or the class meaning.
- Do not start a Batch job, VM or large download before the estimate is approved.
- Do not commit a key, token or `.env` content. A Mapbox public token for local testing is read from `MAPBOX_ACCESS_TOKEN` and is not committed.

## Done when

- Stage 1: the recommendation and its numbers are in `tiles/README.md`, with a pull request into `main` open and nothing published.
- Stage 2: `gs://nature-watch-tiles/cropland/2024/v3/cropland.pmtiles` exists, matches v2 pixel for pixel, and draws without artefacts in Safari on macOS, Safari on iPhone and Chrome, or the task stops before the upload and records how to run it.
- `python -m pytest tiles cookbook` passes.
- The work is on a branch from `main`, in one pull request into `main` for each stage. Report the pull request address. Do not merge it.

## How to work

Branch from `main`. Do this task only. Explain billable processing and get approval before starting it. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
