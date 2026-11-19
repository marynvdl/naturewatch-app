# Task 03b — Buildings 2023 Google cut test

Parcel: [Buildings 2023](../../parcels/buildings-2023.md).

Repository: naturewatch-analysis. Start from `main`.

**Done 19 November 2026.** The 0.5 m exports failed in Earth Engine (output too large), and the 0.5 m cut was read from the COGs instead. A global cut on 4 m pixels would take 11–12 months of the project's allowance, so the user chose not to make seed v2. The figures set the speckle rule for the tiles in task 04. They are in `buildings/README.md`, "Google cut test (task 03b)".

## Goal

Test whether cutting Google's `building_presence` at 0.2 before averaging into 28 m cells removes the speckle that seed v1 shows at Kocho, and still keeps lone buildings. Run the cut in Earth Engine on three 10 × 10 km boxes, once on each of 0.5 m, 2 m and 4 m pixels, and export only 28 m cells. Measure what each run costs in EECU. Recommend how seed v2 is made, then stop for approval. Do not export a global seed.

## Facts already stored

- Seed v1 is the mean `building_presence` of the 2023 images on the sprout grid (EPSG:4326, 0.00025° from −180, 90). Earth Engine reads it from its mean pyramid, with no cut. Task 02 has the run, and `buildings/README.md` has the cost.
- Task 04's sample found the speckle. At Kocho, 75% of the sprout's built cells are value 1 of 250, and 97% are 5 or less. Six of those dots were read from the 0.5 m COGs, and five of them have no pixel at 0.2 or more. These figures are in the uncommitted `buildings/README.md` on the task 04 branch.
- Google's [explorer](https://mmeka-ee.projects.earthengine.app/view/open-buildings-temporal-dataset) draws Building Presence only for values from 0.2 to 0.96.
- `buildings/ee_box.py --value threshold --threshold T --scale S` already does the cut onto the sprout grid through `computePixels`. At 0.5 m it cuts Google's own grid. At 2 m and 4 m it cuts Earth Engine's pyramid. It starts no export.
- Task 01 measured this cut at 0.45 (`buildings/README.md`, the Earth Engine table). Per 25–36 km² box it cost 14.2 EECU-seconds for 1.73 km² at 0.5 m, 8.4–23 at 2 m and 2.2–5.5 at 4 m. Over Google's 75.3 million km², that is 100,000–171,000, 7,500–13,500 and 1,800–3,200 EECU-hours.
- `buildings/compare.py` reads the 0.5 m COGs and Overture outlines for a box, and caches them. `windows` and `all` skip boxes that are not comparison boxes.

## Do this

1. **Boxes.** Add three 10 × 10 km boxes to `buildings/boxes.yaml`, `kind: cut-test`:
   - `kocho-cut` at 6.30532° N, 23.859° E;
   - `bria-cut` at Bria's centre, 6.537° N, 21.987° E;
   - `yalinga-cut` at 6.48° N, 23.23° E: Yalinga, at Chinko's western gate, and the compounds in its fields. Chinko's bush away from Kocho has no huts: the lone Overture outlines there are bright patches and termite mounds in Esri imagery.

   `compare.py all` skips them, as it skips windows.
2. **Script.** Add an `export` command to `ee_box.py`. It reuses the threshold image, so the cut is the one task 01 measured:
   - set presence below 0.2 to 0;
   - average the result into sprout cells;
   - write uint8 share = value ÷ 250, the seed's encoding.

   It starts one Earth Engine export task for each box and pixel size, nine in all, to `gs://nature-watch-bucket/scratch/buildings/google-cut-test/<box>-<scale>m.tif`.
3. **Cost first.** From task 01's figures, the expected cost is about 0.25 EECU-hours for each box at 0.5 m, and under 1 EECU-hour for all nine runs. Read the project's Earth Engine quota tier and monthly allowance, and write them down. Get approval, then submit. Record each task id, its EECU-seconds from the operation metadata, the wall time and the bytes.
4. **Compare.** For each box and pixel size, compare with seed v1 (read from the sprout), with the 0.5 m COG read cut at 0.2 by `compare.py`, and with Overture:
   - cells with any building, and built km²;
   - at Kocho, how many of the v1 speckle cells are left;
   - lone buildings: Overture outlines with no other outline within 100 m, and the share of them whose cell is above 0;
   - check that the 0.5 m export equals the COG read within rounding.
5. **Look.** Render seed v1 and each cut over Esri imagery with `buildings/render.py`. Compare them by eye with Google's explorer at the same places.
6. **Report and stop.**
   - Give one table per box.
   - For each pixel size, estimate the global EECU-hours from the measured EECU per km², and say how many months of quota that is.
   - Recommend the pixel size for seed v2, with the figures behind it.
   - Stop for approval.
7. **Record.** Add a "Google cut test (task 03b)" section to `buildings/README.md` with the boxes, the figures, the cost and the approval. Delete the scratch exports once their figures are recorded. After approval, the parcel gets tasks for recipe v2, seed v2 and sprout v2. Task 04 then resumes on sprout v2.

## Do not

- Do not export a global or continental seed.
- Do not change seed v1, sprout v1 or recipe v1.
- Do not change TEMPO or its seed rule. The looser TEMPO rule comes in recipe v2.
- Do not submit a Batch job, and do not upload tiles.
- Do not mix task 04's uncommitted work into this branch. Commit it to its own branch first.
- Do not add a GitHub workflow that starts on push.

## Done when

- The nine exports ran after approval, and each one's EECU cost is recorded.
- The comparison, the renders, the global estimates and the recommendation are in `buildings/README.md`.
- The scratch exports are deleted.
- `python -m pytest buildings` passes.
- One pull request into `main` in naturewatch-analysis, and one into `develop` here with this file and the parcel line. Each links the other. Neither is merged by Claude.

## How to work

Read `../naturewatch-analysis/CLAUDE.md` first. Branch `data/task-03b-buildings-2023-google-cut-test` from `main` there. Do this task only. Do not commit secrets. Do not add AI or tool attribution.
