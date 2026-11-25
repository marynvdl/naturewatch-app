# Task 03 — Ecoregions PMTiles

Parcel: [Ecoregions](../parcels/ecoregions.md).

Repository: naturewatch-analysis. Start from `main` there. This task file and the parcel link are on `data/task-03-ecoregions-pmtiles` in naturewatch-app. Task 02 merged in #450.

## Goal

Publish `gs://nature-watch-tiles/places/ecoregions/v1/ecoregions.pmtiles`, vector layer `ecoregions`, from the current boundaries of the 846 published ecoregions, built by a Batch job from a new recipe `places-ecoregions.yaml`. Record the run and its cost. Nothing a person sees changes until task 04.

Decided 21 November 2026 by the user:

- **Properties are `id` and `area_km2` only.** RESOLVE's colour is not in the archive. If task 04 picks the colour fill, task 04 rebuilds the archive with it.
- **Built by a Batch job**, with `submit`, as the recognitions were. Not on the laptop.
- **Ecoregions are written from zoom 0**, with Tippecanoe's `--detect-shared-borders`, so neighbours simplify to the same edge. Changed after the first job failed its proof: the 11 island ecoregions under 30 km² start at zoom 1, because Tippecanoe dropped two of them at zoom 0.

## Facts already stored

From the code and the hosted database on 21 November 2026:

- 846 ecoregions are published, each with one current boundary. Together they are 180 MB of geometry and 13,974,327 vertices, and every one is valid. The smallest is 6.04 km², the median 59,190 km², the largest 3,922,506 km². 53 are under 1,000 km², 20 under 100 km², 4 under 10 km².
- `places/protected_areas.py` builds both places archives. `--recipe` picks one. It streams the current boundaries of the recipe's published `place_type` values from a server-side cursor to NDJSON, runs Tippecanoe 2.79.0, proves every zoom, and uploads. `submit` uploads the script and the recipe to `gs://nature-watch-bucket/scratch/places/<recipe name>/`, and the job downloads them. The image of 31 October is reused, so a script change needs no new image.
- The recipe contract takes `id`, `area_km2`, then any of `cropland_percent` and `place_type_id`, and needs `minzoom_by_area_km2`. The Tippecanoe flags are the constant `TIPPECANOE_FLAGS`. Nothing in a recipe adds a flag yet.
- `submit` refuses when the object exists. Without `--replace` it writes no rollback copy.
- The app's `records_fixture.sql` has one ecoregion, "Fixture savanna", over the recognition fixture's park, inside the proof window `29.5,-20.5,31.5,-19.5`.
- The recognitions job on 12 November 2026: 11,480 places, 736 s on spot `e2-standard-8`, 3.8 GiB peak, 202 MiB stored, roughly $0.03.

## Do this

In naturewatch-analysis:

1. **Recipe `cookbook/recipes/places-ecoregions.yaml`**, following `places-recognitions.yaml`. Source: the current boundaries of published `ecoregion` places. Tiles: the path above, layer `ecoregions`, zooms 0 to 12, properties `id` and `area_km2`, the bands `{ area_km2: 30, minzoom: 0 }` and `{ area_km2: 0, minzoom: 1 }`, `simplification: 1`, and `detect_shared_borders: true`. The header comment names RESOLVE Ecoregions 2017 and says the paint is applied in the client.
2. **Script.** `places_contract` reads an optional boolean `tiles.detect_shared_borders`, default false, and `tippecanoe_command` adds `--detect-shared-borders` when it is true. The other two recipes build with the same flags as before. Update the module docstring: three recipes.
3. **Tests** in `places/test_places.py`: the ecoregions recipe passes the contract, its command holds `--detect-shared-borders`, and a place has minzoom 0 from 30 km² and 1 below, and the protected-area and recognition commands are unchanged. Run `python -m pytest places cookbook`.
4. **Local proof.** Against the local Supabase stack loaded with the app's `records_fixture.sql`, run `prove --recipe cookbook/recipes/places-ecoregions.yaml --bbox=29.5,-20.5,31.5,-19.5`. It must hold the fixture ecoregion at every zoom 0 to 12.
5. **Docs.** `places/README.md`: the third archive, its recipe and properties, the shared-borders flag, and the expected cost before the run. `docs/pipelines.md` only if it lists the places archives.

### Hosted, after approval

6. **Submit.** Write the expected cost and get approval. Then `submit --recipe cookbook/recipes/places-ecoregions.yaml`. Record the job id, the output, the status and cancel commands in `places/README.md`, and return. Do not wait in the chat.
7. **Record.** When the job ends, record in `places/README.md`: the result, the places present at each zoom, the bytes stored, the run duration, the wall time, the peak memory, the largest tile per zoom, the range request answer, and the cost.

## Do not

- Do not add RESOLVE's colour, names, biome, or realm to the archive.
- Do not change the protected-area or recognition archives, or their recipes' flags.
- Do not build the global archive on the laptop, or `prove` without `--bbox`.
- Do not change `frontend/naturewatch/src/catalog/layers.json`, the frontend, `docs/blueprint.md`, or `docs/user/`. Task 04 does.
- Do not build or push a new image.
- Do not submit the Batch job without approval.
- Do not commit the NDJSON, the archive, a token, a database URL, or a password.
- Do not start task 04.

## Done when

- `gs://nature-watch-tiles/places/ecoregions/v1/ecoregions.pmtiles` holds the 846 published ecoregions at every zoom 1 to 12, and those of 30 km² and more at zoom 0, with `id` and `area_km2`, `Cache-Control: no-cache`, and a 206 answer to a range request.
- `python -m pytest places cookbook` passes.
- `places/README.md` records the run and its cost.
- One pull request into `main` in naturewatch-analysis, and one into `develop` here with this file and the parcel link, each linking the other, merged after their checks pass and the user approves.

## How to work

Branch from `main` in naturewatch-analysis as `data/task-03-ecoregions-pmtiles`, and run git there with `git -C ../naturewatch-analysis`. Do this task only. Get approval before the Batch job. Do not commit secrets. Do not add AI or tool attribution to a commit or a pull request.
