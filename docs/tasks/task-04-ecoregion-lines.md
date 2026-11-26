# Task 04 — Ecoregion lines

Parcel: [Wayfinding](../parcels/wayfinding.md).

Repository: naturewatch-app. Start from `develop`. Task 03 merged in #460.

## Goal

Zoomed out, ecoregions show as fills in RESOLVE's colours, with no outline. Zoomed in, they show as outlines only. In between, one fades into the other, so a squiggly, patchy ecoregion such as Zambezian Baikiaea woodlands no longer looks like a solid shape. The user judges the paint on the dev server. The Labels toggle stops hiding the ecoregion and recognition outlines. Find out why the Aldabra and Amsterdam–Saint Paul ecoregions do not line up with the basemap, and record the cause.

Decided 26 November 2026 by the user, after seeing the thinner outline (candidate A):

- **Thinner lines alone do not help.** Zambezian Baikiaea woodlands has 470 parts, 387 of them under 10 km², with 131,645 points and 53 holes. Zoomed out it still reads as a solid shape.
- **Crossfade from fill to outline.** This replaces candidates B and C. It reverses the decision of 22 November (Ecoregions task 04) to draw outlines only and leave RESOLVE's colours unread.
- **One colour per ecoregion**, RESOLVE's `COLOR`, not the biome colour `COLOR_BIO`.
- **No tile rebuild.** Colours come from the database through a new read-only function. Generalised tiles, which would drop small parts and holes when zoomed out, go to the parcel's Deferred section.
- **The Labels fix is part of this task.**

Changed 26 November 2026 by the user, after evaluating the local app:

- **Fill only, at every zoom, with no outline.** The crossfade went first. The `ecoregions-line` layer is removed.
- **Softer colours on the monochrome basemap.** Each RESOLVE colour is mixed halfway towards paper (`#f3eee2`). On satellite the mix read as a haze, so there RESOLVE's own colours are used. The opacity is 0.35 on both.
- **No seams.** `fill-antialias` is off. It drew a 1 px edge in the fill colour, which showed as a faint outline where two ecoregions meet.
- **Selection.** The selected outline is 1.5 px, a light charcoal `#6b6a65` on the monochrome basemap, and light grey `#e4e4e2` on satellite. The hover outline matches, at 1.25 px.

## Facts already stored

From the code, naturewatch-analysis, and the hosted database on 26 November 2026:

- `usePlaceBoundaries.ts`:
  - `ecoregionPaint(satellite)` gives `ecoregions-fill` a transparent fill that only catches clicks.
  - It gives `ecoregions-line` the colour `ECOREGION_COLOUR` (`display.ts`: monochrome `#5b6b2f`, satellite `#e3e8a0`) at full opacity. Candidate A's widths are on this branch, uncommitted: 0.3 px at zoom 1, 0.5 at 4, 1 at 7, 1.6 at 10, and 2.2 at 12.
  - Recognitions keep `OUTLINE_WIDTH`. The selected line is 2.5 px and the hover line 2 px.
  - `applyBasemapPaint` reapplies the paint when the basemap changes. The ecoregion layers sit below the conservation-area and recognition layers, whose fill is a solid green patch when zoomed out (`PLACE_FILL_OPACITY`, 0.6 at zoom 4).
- `ecoregion_details.source_attributes` holds RESOLVE's attributes. All 846 published ecoregions have a valid `COLOR` (`#RRGGBB`), 537 distinct colours. `anon` has no grant on `ecoregion_details`. The tiles carry only `id` and `area_km2`.
- `withdrawn_place_ids()` (`20261126100000_place_cleanup.sql`) is the pattern for a small read the map makes once per page load: `language sql`, `stable`, `security definer`, `set search_path = ''`. Its local test is `supabase/tests/test_place_cleanup_local.py`.
- **Labels.** `setLabels` in `MapComponent.vue` hides every `symbol` and `line` layer except `measure-label`, `gl-draw`, and `places-` layers. The `ecoregions-` and `recognitions-` lines are hidden too. Turning Labels back on makes them visible even while their type is off.
- **Aldabra and Amsterdam–Saint Paul.** Checked on 26 November 2026:
  - The importer only repairs invalid shapes and does not simplify. The stored boundaries are RESOLVE's polygons: Aldabra has 5 parts and 167 points, Amsterdam–Saint Paul 2 parts and 48 points.
  - The archive's features match them at zooms 1 to 12.
  - In the browser, the Aldabra outline sits about 1–2 km north of the basemap atoll, and the Amsterdam outline about 2 km south-west of the island.
  - So the offset is RESOLVE's own coarse island shapes. One sentence in `docs/user/data.md` records it, uncommitted on this branch.

## Do this

1. **Read, a migration.** Add `ecoregion_colours()`, which returns `(id uuid, colour text)` for each published ecoregion from `source_attributes->>'COLOR'`. It follows the `withdrawn_place_ids()` pattern, and `anon` and `authenticated` may execute it. Add a local test beside `test_place_cleanup_local.py`. Apply the migration to the hosted database only after the user approves.
2. **Client read, `src/places/api.ts`.** Read `ecoregion_colours()` once per page load, the first time ecoregions draw. Until it answers, or if it fails, the fill uses `ECOREGION_COLOUR`.
3. **Paint, `usePlaceBoundaries.ts`.**
   - `ecoregions-fill` takes each ecoregion's colour through a `match` on `id`. Its opacity fades by zoom.
   - `ecoregions-line` keeps its single colour, and its opacity rises as the fill fades.
   - Starting point, both basemaps: fill opacity 0.35 up to zoom 4, falling to 0 at zoom 7. Line opacity 0 up to zoom 4, rising to 1 at zoom 7. Candidate A's widths stay.
   - The fill keeps catching clicks at every zoom, at opacity 0.
   - The selected and hover lines stay as they are, at full opacity at every zoom.
   - Change the numbers as the user asks.
4. **Labels, `MapComponent.vue`.** `setLabels` leaves the `ecoregions-` and `recognitions-` layers alone, as it does the `places-` layers.
5. **Tests.**
   - `usePlaceBoundaries.spec.ts`: the fill's colour match and both opacity ramps on both basemaps, the fallback colour, and that recognitions keep their widths.
   - A test that turning Labels off and on leaves the place, recognition, and ecoregion layers as they were.
   - Run the catalog suite, the places and component tests, the new local pytest, `npm run type-check`, and `npm run lint`.
6. **Browser check.** Run the `browser-check` skill on `/`, wide and narrow, with Ecoregions on. Use a world view, southern Africa at zoom 4 and 6, and zoom 8, on the monochrome and satellite basemaps. Take one shot with Conservation areas on too, and one with Labels off.
7. **User evaluation.** Start the dev server on `http://localhost:5173` and give the URL to the user. The user judges the paint before the pull request is opened.
8. **Docs.**
   - `docs/blueprint.md`: the app reads `ecoregion_colours()` and paints the ecoregion fill from it.
   - `docs/user/using-the-map.md`: ecoregions are fills in RESOLVE's colours, with a thin outline only when selected or hovered. Labels no longer affects the outlines.
   - `docs/user/data.md`: the colours are RESOLVE's, and the island sentence from the facts above.
   - The parcel:
     - Remove the Aldabra and Amsterdam–Saint Paul open question, and give its answer in this task's archived file.
     - Add the generalised tiles to Deferred.
     - Make task 04's goal and the Done when line match the crossfade.

## Do not

- Do not rebuild or replace a tile archive.
- Do not change the conservation-area, recognition, selected, or hover paint.
- Do not apply the migration to the hosted database before the user approves.
- Do not change the card dot colour or `ECOREGION_COLOUR`.
- Do not paint by biome.
- Do not edit the RESOLVE polygons by hand.
- Do not open the pull request before the user has judged the paint.
- Do not start task 05a.

## Done when

- Ecoregions are fills in their RESOLVE colours with no outline, in the paint the user approved, on both basemaps.
- Labels off and on leaves every place, recognition, and ecoregion layer as it was.
- The browser check shows no console errors.
- The island offset is recorded in `data.md`.
- `ecoregion_colours()` is applied to the hosted database, after approval, and the map reads it.
- The tests, type check, and lint pass.
- `blueprint.md`, `using-the-map.md`, `data.md`, and the parcel match the result.
- One pull request into `develop`, merged after its checks pass and the user approves.

## How to work

Branch from `develop`. Do this task only. Do not commit secrets. Do not add AI or tool attribution to a commit or a pull request.
