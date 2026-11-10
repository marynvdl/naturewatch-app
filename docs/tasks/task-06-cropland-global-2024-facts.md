# Task 06 — Cropland global facts

Parcel: [Cropland 2024 global](../parcels/cropland-2024-global.md).

Repository: naturewatch-analysis. Start only after task 03 has written the sprout and Places Tiles task 04 in naturewatch-app has finished the hosted place import. In this parcel’s order, start it after task 05 has merged.

## Goal

Write cropland facts for every stored place on sprout `cropland-2024-v2`. Record the run cost.

## Facts already stored

The sprout is `gs://nature-watch-bucket/sprouts/cropland/2024/v2/cropland-2024.tif`, id `cropland-2024-v2`. Method `area-weighted-spheroid-v1` is already in `fact_methods`. Version 1 wrote 941 rows for sprout `cropland-2024-v1`. Those rows stay.

`facts/cropland.py` counts the sprout inside each place and writes square kilometres, percent, and valid coverage. The formula is area-weighted spheroid. The version 1 run checked three places before any row was written, then used Batch job `facts-cropland-2024-v1-20261022180517` in `europe-west1` on a spot `e2-standard-4`. The successful Python process took 432 seconds for 941 places. The database URL is secret `naturewatch-facts-database-url` in `europe-west1`. It is the same variable as `DATABASE_URL`. Do not commit it.

Places Tiles task 04 stores terrestrial protected areas worldwide of at least 10 km². Until that hosted import has finished, the table does not hold the global set. The places PMTiles archive copies percent from sprout `cropland-2024-v1`. This task does not republish that archive.

## Do this

- Point the facts command at the global recipe and sprout `cropland-2024-v2`. Upsert those rows. Leave the version 1 rows in place.
- Stop if the stored places are still only the South Africa set. The hosted import from Places Tiles task 04 has to be finished first.
- Keep the independent check, and add one South Africa place that already has a version 1 fact. Cropland and valid area for that place must agree with the version 1 row within the existing tolerances: 0.01 km² for a small place counted by polygon intersection, 1 percent for a large place counted by pixel centre. A failed check writes no rows.
- Before the Batch job, record the expected cost from the version 1 time per place and the global place count, and wait for approval. Call out the largest polygons.
- Use a spot machine in `europe-west1`. Pass the database URL through the existing secret. Do not store it in the job spec. Delete scratch. Batch must delete the virtual machine when the task ends.
- After an authorized run, record the job id, the output, how to check status, and how to cancel, then return.
- Record the finished run in `facts/README.md`: place count, rows written, wall time, peak memory, whether a few large polygons dominate, and that no virtual machine was left running. Update the status table in `docs/pipelines.md`.

## Do not

- Do not delete or overwrite sprout `cropland-2024-v1` rows.
- Do not republish `gs://nature-watch-tiles/places/protected-areas/v1/places.pmtiles`.
- Do not grant `places.geom` to `anon` or `authenticated`.
- Do not change the app. Task 08 in naturewatch-app points the place read at version 2.
- Do not add a GitHub workflow that starts on push.
- Do not submit the Batch job until the expected cost is approved.

## Done when

- Every stored place has a sprout `cropland-2024-v2` fact, or this pull request stops before the Batch job and records how to run it.
- Version 1 facts are still present. One South Africa place agrees with its version 1 fact within the check tolerance.
- `python -m pytest facts` passes.
- `facts/README.md` has the run cost, or the expected cost waiting for approval.
- The work is on a branch from `main`, in one pull request into `main`. Report the pull request address. Do not merge it.

## How to work

Branch from `main`. Do this task only. Explain billable processing and get approval before starting it. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
