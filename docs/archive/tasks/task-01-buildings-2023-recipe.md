# Task 01 — Buildings 2023 recipe

Parcel: [Buildings 2023](../../parcels/buildings-2023.md).

Repository: naturewatch-analysis. Start from `main`. This is the first task in the parcel.

## Goal

Add `cookbook/recipes/buildings-2023-v1.yaml`. Set the sprout grid, the Google presence threshold, the TEMPO floor, and the merge rule from measurements. List the TEMPO 2023 Q4 tiles. Write a cost estimate for the Earth Engine route and the Batch route for Google, and for the TEMPO transfer. Add `compare.py` and `render.py` so task 03 can check the boxes again. No transfer, no export task, and no Batch job.

Decided 16 November 2026 by the user:

- The buildings code goes in a new `buildings/` folder, with its own README and tests.
- This task runs `earthengine authenticate` and reduces one comparison box to share in Earth Engine. It uses `computePixels` or `getPixels`, not an export task. Both global costs are still estimates.

Changed 17 November 2026 by the user, after the measurements:

- **Google is read through Earth Engine as mean presence.** Each sprout cell holds the mean `building_presence` of the 2023 images, read from Earth Engine's mean pyramid, as in the user's earlier Africa built layer (`built.ipynb`) without its cut at 0.1. There is no presence threshold. Thresholding 0.5 m pixels cost about $40–120 on Batch or over 100,000 EECU-hours in Earth Engine. Mean presence is about 60–90 EECU-hours. Steps 2 and 5 below became comparisons. Their tables stay in `buildings/README.md`.
- **TEMPO uses a seed rule, not a floor.** A TEMPO cell is kept only if a cell within 2 km reaches a share of 0.15. No floor removed the noise and kept scattered buildings, and an Overture mask keeps the noise.
- **The grid is EPSG:4326 at 0.00025°**, and the share is stored as uint8, value ÷ 250, 255 nodata.
- **How a parent tile combines its children** (share-weighted mean as cropland, or max) is chosen in task 04.

## Facts already stored

- The parcel holds the source choice, the share and source bands, the merge rule, the TEMPO floor reasoning, the object paths, and the comparison boxes. The comparison page is [Built layer candidates](https://claude.ai/artifact/8D1BrG37y9qLSnH5SHevcd).
- The 10 November `compare.py` and `render.py` were in a session scratchpad and are gone. This task writes them again.
- Google Temporal 2023 is listed by 151 manifests named `<s2cell>_EPSG_<utm>_2023_06_30.json` under `gs://open-buildings-temporal-data/v1/manifests/`. Each manifest names 0.5 m tiles of 25,000 × 25,000 px under `gs://open-buildings-temporal-data/v1/geotiffs/`, with each tile's affine transform. The Earth Engine collection is `GOOGLE/Research/open-buildings-temporal/v1`. Nodata is −99.
- On 16 November 2026 the highest Google `building_presence` was 0.09 in a 6 × 6 km box at 20.8892° N, 5.8708° E. TEMPO showed many low-density cells there.
- `cookbook/recipes/cropland-2024-v3.yaml` is the pattern for the recipe: grid, seed, sprout, and tiles blocks with comments. `python -m pytest cookbook` checks recipes.
- `gee/fire/export_fire.py` is the pattern for an Earth Engine script with `plan`, `check`, `export`, and `status`. The saved Earth Engine login on the laptop no longer works.
- The expected cropland seed storage was written in `cookbook/README.md`, and the status table in `docs/pipelines.md` names every recipe.

## Do this

1. **Scripts in `buildings/`.**
   - `compare.py` reads one box from Google Temporal (ranged COG reads through the manifests), TEMPO 2023 Q4 (COGs from the index), and Overture building outlines (GeoParquet through DuckDB, the box only). It writes per-box figures as CSV: Google share at several presence thresholds, TEMPO share before and after several floors, Overture outline area, and the ratios between them.
   - `render.py` draws the three sources side by side for one box as a PNG, in the sprout's √share shades.
   - Boxes are named in `buildings/boxes.yaml`: the seven comparison boxes from the parcel, and the empty-land boxes from step 3.
   - Laptop reads stay at box size. Each box reads at most a few hundred MB.
2. **Google presence threshold.** In the Google-covered comparison boxes, compare Google share with Overture outline area for thresholds from 0.3 to 0.7. Choose the threshold whose ratios are closest to 1 across the boxes. Record the per-box ratios.
3. **TEMPO floor.**
   - Pick at least eight 6 × 6 km empty-land boxes where Google has valid data, starting with 20.8892° N, 5.8708° E. Spread them across the Sahara and Sahel from Mauritania to Sudan, and include some near Google's northern edge around 22.7° N. A box counts as empty when its highest Google presence is below the chosen threshold.
   - For floors from 0 to 0.10, measure the share of TEMPO's built area in the empty boxes that the floor removes, and the share of Overture outline area in the comparison boxes that falls in TEMPO cells the floor removes.
   - Propose the floor that removes the noise and keeps the real buildings. If no floor does both, say so and estimate the Overture-mask fallback from the parcel. Do not build it.
4. **Sprout grid.** Start from EPSG:4326 at 0.00025°. Confirm it holds a rural compound at the chosen threshold in the comparison boxes, or propose another grid with a reason. TEMPO is resampled onto it by area-weighted average.
5. **Earth Engine check.** After `earthengine authenticate`, reduce one comparison box to share on the sprout grid in Earth Engine, with the same threshold. Compare it with the result from the COG reads for the same box. Record the agreement and any edge effect.
6. **TEMPO tile list.** Read the 2023 Q4 GeoPackage index. Count the tiles, sum their bytes where the index or a HEAD request gives them, and fix the URL pattern. If there are more than about 1,000 tiles, write the index URL, the tile count, and a SHA-256 of the sorted URL list in the recipe, and have the seed step rebuild the list from the index. Otherwise list them in the recipe.
7. **Cost estimates.** Write them in `cookbook/README.md`.
   - Earth Engine route: the number of export blocks, the expected EECU-hours and whether this project is billed for them, and the size of the share COGs in the bucket.
   - Batch route: the number of Google tiles across the 151 manifests, the bytes read at the overview chosen, the machine type and hours, and egress from the US multi-region bucket to `europe-west1`.
   - TEMPO: the Storage Transfer bytes and the bucket storage.
   - Name the cheaper route and why.
8. **Recipe.** `cookbook/recipes/buildings-2023-v1.yaml` with the grid, both seeds, the sprout with the share and source bands (1 Google, 2 TEMPO, 0 none), the threshold, the floor, the merge rule, the tile path, and comments that point at `buildings/README.md` for the measurements. Leave the tile zooms and the top-zoom rule unset. Task 04 chooses them.
9. **Records.** `buildings/README.md` holds how to run the scripts and the measured tables. Add the recipe to the status table in `docs/pipelines.md`. Tests in `buildings/` cover the box reads on fixtures, without network.

## Do not

- Do not start a Storage Transfer, an Earth Engine export task, or a Batch job, and do not write to either bucket.
- Do not download whole Google tiles or the global Overture buildings to the laptop.
- Do not build the Overture mask.
- Do not choose the tile zooms or the top-zoom rule.
- Do not add a GitHub workflow that starts on push.

## Done when

- `buildings-2023-v1.yaml` names the grid, the threshold, the floor, the merge rule, both seeds, the sprout, and the tile path.
- `buildings/README.md` holds the threshold ratios, the floor table, and the Earth Engine agreement on one box.
- Both Google routes and the TEMPO transfer have a written cost in `cookbook/README.md`.
- The user approved the threshold, the floor, and the grid.
- `python -m pytest cookbook buildings` passes.
- One pull request into `main` in naturewatch-analysis, and one into `develop` here with this file and the parcel link. Each links the other. Neither is merged by Claude.

## How to work

Read `../naturewatch-analysis/CLAUDE.md` first. Branch `feat/task-01-buildings-2023-recipe` from `main` there. Do this task only. Stop with the floor table and the threshold ratios for approval before writing them into the recipe. Do not commit secrets or the Earth Engine credentials. Do not add AI or tool attribution.
