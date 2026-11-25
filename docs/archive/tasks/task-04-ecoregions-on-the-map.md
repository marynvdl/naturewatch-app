# Task 04 — Ecoregions on the map and profile

Parcel: [Ecoregions](../parcels/ecoregions.md).

Repository: naturewatch-app. Start from `develop`. Task 03 merged in #451 here and naturewatch-analysis#43.

## Goal

The **Ecoregions** button lists the 846 ecoregions and draws their outlines from the ecoregions archive. A click inside one opens its profile, which shows its size. Its Related tab lists the places inside it. A conservation area's or recognition's Overview shows its ecoregions as tags that open them.

Decided 22 November 2026 by the user:

- **Paint: outlines only**, like recognitions, with no fill. No colour preview, and RESOLVE's colours are not read. The colour and widths below are a starting point the user judges in the local app.
- **No One Earth link in this task.** No URL is stored, and a slug made from the name is not checked. It moves to the parcel's Deferred section.
- **Related lists everything inside**, conservation areas and recognitions together in the existing "Contains" group, largest first, 20 at a time.

## Facts already stored

From the code and the hosted database on 22 November 2026:

- `gs://nature-watch-tiles/places/ecoregions/v1/ecoregions.pmtiles` has vector layer `ecoregions` with `id` and `area_km2`. Ecoregions of 30 km² and more start at zoom 0, the rest at zoom 1, up to zoom 12 (task 03).
- `listed_places` holds all 846 published ecoregions. `place_window`, `place_window_count`, `place_rank`, and `place_filter_stats` take `p_place_types text[]`, so the list reads already work for `ecoregion`. No migration is needed.
- `anon` reads confirmed `located_in` links. Subject is the park or recognition, object the ecoregion. Confirmed links: 45,002 from 39,389 conservation areas, and 12,912 from recognitions. The largest ecoregion holds 1,153 conservation areas.
- `PlacesBarComponent.vue` has the Ecoregions button, on alone (`ALONE`), and it lists nothing. `listedTypes` maps only Conservation areas and the recognition buttons to stored types. `PlacesStore.listingRecognitions` makes the tools size-only and clears the cropland range.
- `usePlaceBoundaries.ts` draws `places-tiles` and `recognitions-tiles`, each with a transparent fill for clicks, a line, a selected line, and a hover line. The selected place's outline shows even when its type is not drawn.
- `PlaceProfileComponent.vue` opens any published place through `place_summaries`. The Overview shows Area from the current boundary. The Related tab reads `loadRelatedPlaces`, groups by link label ("Located in", "Contains"), and leaves out the recognitions shown as badges. Countries show as tags in `.place-countries`.

## Do this

1. **Reads, `src/places/api.ts`.** Add `ECOREGION_TILES_URL` and `ECOREGION_TILE_LAYER`. The list reads take `ecoregion` like any type.
2. **Places panel, `PlacesBarComponent.vue`.** Ecoregions stays on alone. It lists `ecoregion` 50 at a time with the same cards, count, Sort, Filter, and In view as a recognition type, by size only. Drop the "nothing to show" text for Ecoregions; Countries keeps it.
3. **Store and filter, `PlacesStore.ts` and `PlacesFilterDialog.vue`.** The size-only rule covers ecoregions as well as recognitions: the dialog shows the size range with the ecoregion size chart, and the cropland range is cleared. Rename `listingRecognitions` to fit, for example `sizeOnly`. The size filter is kept across types.
4. **Map, `usePlaceBoundaries.ts`.** Add an `ecoregions-tiles` source with a transparent fill, a line, a selected line, and a hover line, under the labels, filtered by the size filter. It draws only while Ecoregions is on. Line monochrome `#5b6b2f`, satellite `#e3e8a0`, with the recognition widths (0.8 px at zoom 3, 1.4 at 6, 2 at 9, 2.6 at 12). A click inside a drawn ecoregion opens its profile. A selected ecoregion's thicker outline shows even when Ecoregions is off, so one opened from a tag is highlighted. Hovering a card outlines it.
5. **Profile, `PlaceProfileComponent.vue`.** In Overview, a place with confirmed `located_in` links to ecoregions shows them as tags under **Ecoregion** or **Ecoregions**, after Countries, in the country tag style, ordered by the share of the place inside, largest first. Each tag is a button that opens that ecoregion in the same column and selects it on the map. Those ecoregions are left out of the Related tab, as badges are. An ecoregion's own profile shows its Area, and its Related tab lists "Contains" unchanged, and draws those places while it is open, as it does now.
6. **Tests.** Extend `PlacesBarComponent.spec.ts`, `PlaceProfileComponent.spec.ts`, `usePlaceBoundaries.spec.ts`, and the store spec for the ecoregion list, the size-only tools, the layer filter and visibility, the tags, and their removal from Related. Run the catalog suite, the component and places tests, `npm run type-check`, and `npm run lint`.
7. **Browser check.** Run the `browser-check` skill on `/` with Places open: Ecoregions listed and drawn, an ecoregion profile with its Related tab, and a park with ecoregion tags, wide and narrow, on the monochrome and the satellite basemaps.
8. **User evaluation.** Start the dev server on `http://localhost:5173` and give the URL to the user. The user evaluates the local app, the outline colour included, before the pull request is opened. Changes they ask for within this task go on this branch.
9. **Docs.**
   - `docs/user/using-the-map.md`: Ecoregions lists and draws, its outline colours, size-only tools, and the ecoregion tags. Remove "nothing to show" for Ecoregions.
   - `docs/user/data.md`: ecoregions are shown, from RESOLVE Ecoregions 2017. What a tag means: a confirmed link, where at least 10% of the place is inside the ecoregion.
   - `docs/blueprint.md`: the app reads the ecoregions archive, and the list reads take `ecoregion`.
   - The parcel: the paint question answered, the One Earth link moved to Deferred, and task 04's goal and Done when without it.

## Do not

- Do not change the database, a migration, an importer, or a published archive.
- Do not read or paint RESOLVE's colours, or show biome or realm.
- Do not add the One Earth link.
- Do not draw ecoregions together with conservation areas or recognitions.
- Do not show proposed links.
- Do not add a catalog entry or change `layers.json`.
- Do not add the Ecoregion filter field. Task 05 does.
- Do not open the pull request before the user has evaluated the local app.
- Do not start task 05.

## Done when

- The Places panel, map, and profile work as described above, with no console errors in the browser check.
- The tests, type check, and lint pass.
- The user has evaluated the local app and approved it.
- using-the-map.md, data.md, blueprint.md, and the parcel match the result.
- One pull request into `develop`, merged after its checks pass and the user approves.

## How to work

Branch from `develop`. Do this task only. Do not commit secrets. Do not add AI or tool attribution to a commit or a pull request.
