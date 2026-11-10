# Task 05 — Cropland global PMTiles

Archived. This task is not active.

Parcel: [Cropland 2024 global](../parcels/cropland-2024-global.md).

Repository: naturewatch-analysis. Start only after task 04 has recorded an approved resampling on the global recipe.

## Goal

After the cropland sample is approved, write zooms 0–12 to the version 2 global PMTiles object, built in parallel pieces and merged. Record the run cost.

## Facts already stored

Task 04 sets the resampling on `cookbook/recipes/cropland-2024-v2.yaml` and proves the bottom-up pyramid and the `pmtiles` writer on a small window. It also records a global estimate in tiles, bytes, and hours. The archive path is `gs://nature-watch-tiles/cropland/2024/v2/cropland.pmtiles`. The sprout is the collection VRT `gs://nature-watch-bucket/sprouts/cropland/2024/v2/cropland-2024.vrt` over the per-tile COGs in `.../v2/tiles/`. These COGs have no overviews.

Version 1 tiles stay at `gs://nature-watch-tiles/cropland/2024/v1/`. The app still reads that PNG template until task 07 in naturewatch-app. This task publishes the object. It does not change the app.

The version 1 tile job was Batch `tiles-cropland-2024-v1` in `europe-west1`, spot `e2-standard-2`, 937 seconds, 23,467 PNG objects. A global XYZ upload would be a much larger object-write cost. This run writes one archive.

Why one machine will not do: at about 25 tiles a second, a global zoom 0–12 set of roughly 3 million tiles is around 30 hours on one `e2-standard-2`, and a spot interruption would lose all of it. GDAL's PMTiles driver cannot write rasters, so the archive is written with the `pmtiles` Python `Writer`.

## Do this

- Ask me when you're not 90% sure or if anything is unclear.
- This is the first global tiles run for the tiles pipeline. As such, we need to ensure that what we do here is best practice, most efficient, modular and reproducible for other years and for other layer types.
- Refuse to start when the recipe's resampling is unset.
- Partition by a coarse tile. One Batch task per zoom 5 tile that holds data, covering zooms 12 down to 5. Each task builds its zoom 12 tiles from the VRT, then its lower zooms bottom-up, with the approved resampling. Gray 1 is cropland, gray 0 is other land, nodata is empty. Colour stays in the client. Each task writes a shard to scratch, a PMTiles file or a sorted tile list, under a final name only when finished. A task skips a shard that exists and is complete, so a rerun redoes only what is missing. Cap parallelism below the project's vCPU quota, as the sprout job did with 20.
- A final merge task reads the shards, builds zooms 0–4 from the zoom 5 tiles, and writes one archive in tile id order with `Writer`. Check that no tile is written twice and that tiles at zoom 5 and above come from exactly one shard.
- The object must answer HTTP Range requests. The places archive on this bucket already does. After the upload, check a Range request returns 206, and set `Cache-Control` as the v1 tiles do.
- Estimate bytes and Batch time from the task 04 estimate, then wait for approval. Give shard task count, machine type, parallelism, expected hours, and storage. Size each task's disk for its own windows of the sprout, and the merge task's disk for all shards. The version 1 tile job's 30 GB disk is not assumed to be enough for the merge.
- Use spot machines in `europe-west1`. Delete scratch. Batch must delete the virtual machines when the tasks end.
- After an authorized run, record the job ids, the output, how to check status, and how to cancel, then return.
- Record the finished run in `tiles/README.md`: archive bytes, zoom range, tile count, wall time, peak memory, resampling, and that no virtual machine was left running. Update the status table in `docs/pipelines.md`. Note in the task that the app blueprint in naturewatch-app still names `cropland-2024.tif` for the sprout, so task 07 or a docs change there must correct it to the VRT.

## Do not

- Do not write `{z}/{x}/{y}.png` objects for the global layer.
- Do not warp every tile from the source at every zoom.
- Do not use the GDAL PMTiles driver for the raster archive.
- Do not delete the version 1 PNG prefix.
- Do not change the app catalog. Task 07 in naturewatch-app does that.
- Do not calculate facts. Task 06 does that.
- Do not add a GitHub workflow that starts on push.
- Do not submit the global job until the expected cost is approved.

## Done when

- `gs://nature-watch-tiles/cropland/2024/v2/cropland.pmtiles` is the global zooms 0–12 archive, or this pull request stops before that job and records how to run it.
- The archive uses the resampling approved in task 04, and a check against the sprout at a sample of tiles agrees.
- `python -m pytest tiles cookbook` passes.
- `tiles/README.md` has the run cost, or the expected cost waiting for approval.
- The work is on a branch from `main`, in one pull request into `main`. Report the pull request address. Do not merge it.

## How to work

Branch from `main`. Do this task only. Explain billable processing and get approval before starting it. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.

## Notes from the work

- The run is done and recorded in `tiles/README.md`. The estimate was approved and the pilot, the 302-shard job and the merge job ran on 2 November 2026.
- The app blueprint in naturewatch-app (and the parcel) still names `.../v2/cropland-2024.tif` for the sprout. The sprout is the VRT `.../v2/cropland-2024.vrt`. Task 07, or a docs change there, must correct it.
- This task says to cap parallelism "as the sprout job did with 20". `sprout/README.md` records 8 for the per-tile job. The estimate uses 8. The vCPU quota was not checked.
- "Set `Cache-Control` as the v1 tiles do": the v1 objects carry no explicit value; they serve the bucket default `public, max-age=3600`. The merge task sets that value on the archive.
