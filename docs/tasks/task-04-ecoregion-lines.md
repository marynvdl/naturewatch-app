# Task 04 — Ecoregion lines

Parcel: [Wayfinding](../parcels/wayfinding.md).

Repository: naturewatch-app. The work moves to naturewatch-analysis only if the tiles need a rebuild. Start from `develop`. Task 03 merged in #460.

## Goal

Ecoregion outlines get thinner and lighter when zoomed out, so a world or continent view is not covered in olive lines. The user picks the paint on the dev server. Find out why the Aldabra and Amsterdam–Saint Paul ecoregions do not line up with the basemap. Then fix it in the recipe, or record it in `docs/user/data.md`.

## Facts already stored

From the code, naturewatch-analysis, and the hosted database on 26 November 2026:

- `usePlaceBoundaries.ts`: `ecoregionPaint(satellite)` gives `ecoregions-line` the colour `ECOREGION_COLOUR` (`display.ts`: monochrome `#5b6b2f`, satellite `#e3e8a0`) and the width `OUTLINE_WIDTH`: 0.8 px at zoom 3, 1.4 at 6, 2 at 9, and 2.6 at 12. The line has full opacity at every zoom. Recognitions share `OUTLINE_WIDTH`. The selected line is 2.5 px and the hover line 2 px. `setBasemapPaint` reapplies the paint when the basemap changes.
- The archive `gs://nature-watch-tiles/places/ecoregions/v1/ecoregions.pmtiles`, layer `ecoregions`, zooms 0–12, was built on 21 November 2026 from `cookbook/recipes/places-ecoregions.yaml`. The recipe sets `simplification: 1`, `simplification_max_zoom: 0`, and `detect_shared_borders: true`. Ecoregions under 30 km² start at zoom 1.
- Hosted `place_boundaries`, current boundary, read only:
  - Aldabra Island xeric scrub: 159.1 km², 5 parts, 167 points, box 46.20–46.52° E, 9.47–9.34° S.
  - Amsterdam-Saint Paul Islands temperate grasslands: 69.2 km², 2 parts, 48 points, box 77.48–77.59° E, 38.74–37.82° S.
  - Both boxes sit on the real islands. The polygons are coarse, so the likely cause is RESOLVE's own shapes, not a shifted tile. This step checks that.
- `docs/user/data.md` says the ecoregions come from RESOLVE Ecoregions 2017. `docs/user/using-the-map.md` says the outlines are olive, and pale yellow on satellite.

## Do this

1. **Paint, `usePlaceBoundaries.ts`.** Give ecoregions their own line width and opacity by zoom. Recognitions keep `OUTLINE_WIDTH`. The selected and hover lines stay as they are. Start from these candidates. Show them to the user one at a time on the dev server, and change them as the user asks:
   - **A, thinner:** 0.3 px at zoom 1, 0.5 at 4, 1 at 7, 1.6 at 10, 2.2 at 12. Full opacity.
   - **B, thinner and faded:** A's widths, with opacity 0.4 up to zoom 3, rising to 0.9 at zoom 7.
   - **C, thinner and paler:** A's widths, with the colour going from a paler olive at zoom 3 to `#5b6b2f` at zoom 7. On satellite, from a fainter yellow to `#e3e8a0`.

   Both basemaps follow the same rule. The candidates are not committed side by side, and no switcher is added.
2. **Misplaced ecoregions.** For Aldabra and Amsterdam–Saint Paul, compare:
   - the RESOLVE 2017 polygon, from the source file if it is on the laptop, otherwise its stored copy;
   - the stored current boundary;
   - the archive's features at zoom 12, read with a range request from the public bucket;
   - the basemap coastline in the browser.

   Report which step the mismatch starts at, with a screenshot of each place.
   - **RESOLVE's shape is the cause:** add one sentence to the ecoregions part of `docs/user/data.md`. It says RESOLVE draws small islands coarsely, so an outline can miss the coastline, and names these two as examples.
   - **The tiles are the cause:** propose the recipe change in naturewatch-analysis, with a cost estimate for the rebuild, and wait for approval. Rebuilding goes through that repo's task skill, with its own branch and a pull request into `main`, linked from this one.
3. **Tests.** In `usePlaceBoundaries.spec.ts`, check the ecoregion line paint on both basemaps, and that recognitions keep their widths. Run the catalog suite, the places tests, `npm run type-check`, and `npm run lint`.
4. **Browser check.** Run the `browser-check` skill on `/`, wide and narrow, with Ecoregions on. Use a world view and a zoom 8 view, on the monochrome and satellite basemaps, with Conservation areas on too in one shot.
5. **User evaluation.** Start the dev server on `http://localhost:5173` and give the URL to the user. The user picks the paint before the pull request is opened.
6. **Docs.**
   - `docs/user/using-the-map.md`: one sentence that ecoregion outlines are thinner and lighter when zoomed out.
   - `docs/user/data.md`: only if step 2 records the cause there.
   - The parcel: remove the Aldabra and Amsterdam–Saint Paul open question, and give its answer in this task's archived file.

## Do not

- Do not change the conservation-area, recognition, selected, or hover paint.
- Do not change the database.
- Do not rebuild or replace a tile archive without a costed, approved proposal.
- Do not edit the RESOLVE polygons by hand.
- Do not open the pull request before the user has picked the paint.
- Do not start task 05a.

## Done when

- Ecoregion outlines are thinner and lighter when zoomed out, in the paint the user picked, on both basemaps, with no console errors in the browser check.
- The cause of the two misplaced ecoregions is found. It is either recorded in `data.md`, or fixed by an approved rebuild whose pull request in naturewatch-analysis has merged.
- The tests, type check, and lint pass.
- `using-the-map.md`, `data.md` where needed, and the parcel match the result.
- One pull request into `develop`, merged after its checks pass and the user approves.

## How to work

Branch from `develop`. Do this task only. Do not commit secrets. Do not add AI or tool attribution to a commit or a pull request.
