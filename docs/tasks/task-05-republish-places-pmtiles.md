# Task 05 — Republish places PMTiles

Parcel: [Places Tiles](../parcels/places-tiles.md).

Repository: naturewatch-analysis. Start only after Places Tiles task 04 has finished the hosted import.

## Goal

Rebuild that archive from the global places with Tippecanoe and replace the published object. Record the run cost.

## Facts already stored

Task 02 published `gs://nature-watch-tiles/places/protected-areas/v1/places.pmtiles` from the South Africa rows. It used GDAL's PMTiles writer, which proved fine for 941 places (29 seconds, 402 MB peak, 3.6 MB). Task 04 in naturewatch-app then stored 51,001 terrestrial protected areas worldwide of at least 10 km². The app already draws that object path. Raster tiles stay as they are.

Decision, 31 October 2026: the global build uses Tippecanoe, not the GDAL writer. GDAL's vector tile writer has per-tile size and feature limits that drop features without a warning, and it keeps every clipped feature for every tile in one temporary SQLite file. Tippecanoe streams, uses all cores, and writes PMTiles directly. There is no GDAL versus Tippecanoe benchmark. The archive format stays PMTiles, with Mapbox Vector Tile encoding inside it. This is the same Places pipeline: same script, recipe, object path, and copied fields. Only the tile engine changes. GDAL and OGR stay for reading, validation, and the proof.

## Do this

- Rerun the task 02 publish against the global places, following the step README. Do not invent a second pipeline. Change `places/protected_areas.py` so the global build calls Tippecanoe. Keep the South Africa `prove` path working, or move it to Tippecanoe as well so both produce the same kind of archive.
- Use Tippecanoe 2.x from the `felt/tippecanoe` project, which writes `.pmtiles`. The Debian package is the older build without PMTiles. Pin a version in a container image for the Batch job, and say which one in the README.
- Read places without holding them in memory. Replace `fetchall()` with a server-side cursor that writes newline-delimited GeoJSON or FlatGeobuf to local disk. Memory must not grow with place count.
- Check whether the task 04 import already stored valid polygons. If it did, drop `ST_MakeValid` and `ST_CollectionExtract` from the query so the app database does not run them on 51,001 rows. If not, validate on the virtual machine with OGR `MakeValid`. Record which. Read the database from the Batch job, not from a laptop, so the geometry does not leave Google's network.
- Keep the layer name `places`, the copied fields `places.id`, `area_km2`, and cropland percent when a fact exists, and omit the field when it does not. Most global places have no fact.
- Keep the same generalization: 1,000 km² from zoom 0, 300 from zoom 2, 100 from zoom 3, 30 from zoom 4, 10 from zoom 6, every place by zoom 6, full resolution at zoom 12. Express each band as a per-feature `tippecanoe.minzoom` taken from the recipe. Set the size and feature caps so Tippecanoe does not drop or coalesce places. Pass the flags that keep every feature, and record the flags in the README.
- The proof must go beyond zoom 0 and zoom 12. Check every zoom from 0 to 12 that each place appears at or after its band's minzoom and not before it, and that every one of the 51,001 ids is present by zoom 6. Record the largest tile in bytes at each zoom. A tile near 500 KB is a finding to report, not to hide.
- Replace the object at the same path. Add an explicit `--replace` to `submit` and `run`. Until it is given, keep the current refusal when the object exists. Before replacing, copy the v1 object to `gs://nature-watch-tiles/places/protected-areas/v1/places.previous.pmtiles` so the South Africa archive can come back. Remove that copy only when told to.
- Set `Cache-Control` on the replaced object to `no-cache`, so a reader holding the old directory does not request byte ranges from the new file. Check afterwards that HTTP Range requests still return 206.
- Size the job from a cropped sample, then record the expected cost and wait for approval. Run the build on a cropped window first, for example Germany and the Benelux for density and one large-park country such as Tanzania, on the laptop only, to give wall time, peak memory, archive bytes, and the largest tile. Scale to 51,001 places and set machine type, memory, boot disk, and `maxRunDuration` from those figures. The task 02 job's `e2-standard-2`, 8 GiB, 30 GB disk, and 3,600 seconds are not assumed to be enough. A spot machine with more vCPUs is likely, since Tippecanoe uses them.
- Use a spot machine in `europe-west1`. Delete scratch. Batch must delete the virtual machine when the task ends.
- Record the run in the step README: bytes stored, wall time, peak memory, zoom range, place count, Tippecanoe version and flags, largest tile per zoom, and how to cancel the job. Do not copy that procedure into naturewatch-app.
- After an authorized run, record the job id, output, status check, and how to cancel it, then return. Do not wait in the chat for the job. Update the status table in `docs/pipelines.md`.

## Do not

- Do not change the object path unless the step cannot replace the file in place. If the path must change, stop and say so; the app read path lives in naturewatch-app.
- Do not calculate new cropland facts.
- Do not convert raster tiles to PMTiles.
- Do not start a virtual machine or a Batch job until it is approved.
- Do not add a GitHub workflow that starts on push.
- Do not write individual `{z}/{x}/{y}.mvt` objects. The archive is one PMTiles object.
- Do not read the global geometry to a laptop for anything beyond the cropped samples.

## Done when

- The published archive is built from the global places with Tippecanoe, or this pull request stops before the hosted publish and records how to run it.
- The proof passes at every zoom from 0 to 12, with all 51,001 ids present.
- A copy of the version 1 object exists for rollback, and the replaced object has `Cache-Control: no-cache` and answers Range requests.
- `python -m pytest places cookbook` passes.
- The step README has the new run cost, or the expected cost waiting for approval.
- The work is on a branch from `main`, in one pull request into `main`. Report the pull request address. Do not merge it.

## How to work

Branch from `main`. Do this task only. Explain billable processing and get approval before starting it. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
