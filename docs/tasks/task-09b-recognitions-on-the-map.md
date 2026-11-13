# Task 09b — Recognitions on the map and profile

Parcel: [Database Honing](../parcels/database-honing.md)

Repository: naturewatch-app. Start only after task 09 has merged into `develop` (pull request #411, merged 12 November 2026).

## Goal

Show the recognitions that task 09 stored. The Places panel gets a **Recognitions** button that opens World Heritage, Ramsar, and UNESCO-MAB buttons. Each lists that type and draws its outlines from the recognitions archive. A park's profile shows its confirmed recognitions as badges under the title, and each badge opens that recognition's profile.

Decided 12 and 13 November 2026 by the user, the second time from a local preview of the real archive, and changed on 13 November 2026 after the user evaluated the local app:

- **Buttons.** The place types read **Protected areas · Ecoregions · Countries · More…**. **More…** is a text link, not a button like the types. It adds **World Heritage · Ramsar · UNESCO-MAB** to the end of the types, moves after them, and reads **Less**. **Less** hides them and clears a selected one. The pill is the standard `.map-control` button across the app, including the Landscape layer buttons: 32 px high, fully rounded, 13 px text, 6 px apart. The Places type is named **Conservation areas** in the app, not Protected areas.
- **Drawing.** Recognitions are never drawn while Protected areas is selected. A recognition button lists that type and draws only that type's outlines. Clicking it again clears both, as Protected areas does. There is no separate always-on recognitions toggle.
- **Style A.** Outlines only, with no fill, a solid line, and one colour per group. Monochrome: World Heritage `#a8730f`, Ramsar `#1f6f9a`, UNESCO-MAB `#7a4a9c`, other `#7d7a72`. Satellite: `#f2c14e`, `#8fd3f4`, `#d9b3f5`, `#d8d5cc`. Width 0.8 px at zoom 3, 1.4 at 6, 2 at 9, and 2.6 at 12.
- **Tools.** A recognition list keeps Sort, Filter, and In view, by size only. It has no cropland range and no cropland sorts. The size filter is kept across place types. Choosing a recognition type clears only the cropland range.
- **Profile.** Badges read the recognition type (World Heritage, Ramsar, UNESCO-MAB, Natura 2000, Emerald, Regional), with the name on hover, and open that recognition. Overview shows the countries as tags. A recognition has an **Areas** tab listing the conservation areas it recognises, as list cards, largest first, 20 at a time, where only the list scrolls. While that tab is open, the map draws those conservation areas.
- **Search and hover.** With no type selected, search covers every listed type through `listed_places`; choosing a result switches on its type when it has a button. Hovering or focusing a card outlines its place on the map while it is drawn, without moving the map.

## Facts already stored

From the code and the hosted database on 13 November 2026:

- `gs://nature-watch-tiles/places/recognitions/v1/recognitions.pmtiles` has vector layer `recognitions` with `id`, `area_km2`, and `place_type_id`, and the area minzoom bands of the places archive. The bucket's CORS allows `http://localhost:5173`. The Mapbox token works there too, but not on other local ports.
- The six recognition types are `world_heritage_site` (207), `ramsar_site` (1,087), `biosphere_reserve` (220), `natura_2000_site`, `emerald_site`, and `other_recognition`. Their titles are in `place_types`.
- `listed_places` lists every published place that is not a conservation area. `place_window`, `place_window_count`, `place_rank`, and `place_filter_stats` already take `p_place_type`. `place_summaries` takes `designation`, `iso3`, `realm`, and `site_id` from either details table. No migration is needed.
- `anon` reads `place_relationships` rows that are `confirmed`, not retired, and between published places. 8,015 `recognises` links are confirmed at 75% of the park (World Heritage 524, Ramsar 793, UNESCO-MAB 1,526, Natura 2000 4,062, Emerald 909, Other regional 201). In a `recognises` row the subject is the recognition and the object is the park.
- The frontend lists `PLACE_TYPE = 'conservation_area'` in `src/places/api.ts`. The list, the filter stats, and the release notice use it. The Places panel's types are `protected_area`, `ecoregion`, and `country` in `PlacesBarComponent.vue`, and only `protected_area` lists anything. `usePlaceBoundaries.ts` draws `places-tiles` with a fill, a line, and a selected line, and `PlacesStore.tileFilter` is the size and cropland filter.
- `PlaceProfileComponent.vue` and `PlaceView.vue` read `loadPilotPlace(id)`, which works for any published place.

## Do this

1. **Reads, `src/places/api.ts`.** The list, count, rank, and filter-stats reads take the place type instead of `PLACE_TYPE`. Add `loadPlaceRecognitions(id)`: the confirmed `recognises` rows whose object is the place, then the `id`, `name`, and `place_type_id` of each recognition from `place_summaries`, ordered by type (World Heritage, Ramsar, UNESCO-MAB, Natura 2000, Emerald, other), then name. Add `RECOGNITION_TILES_URL` and `RECOGNITION_TILE_LAYER`. The release notice keeps reading conservation areas.
2. **Places panel, `PlacesBarComponent.vue`.** Add **More…** and **Less** as described above. A recognition button lists its type 50 at a time with the same cards, count, Sort, Filter, and In view as Protected areas, but without the cropland sorts. Move the list card into `PlaceCard.vue`, so the profile can use it. Search with no type selected is unchanged. Add the pill style to `visual.css`.
3. **Filter, `PlacesFilterDialog.vue` and `PlacesStore.ts`.** The store keeps the selected place type. For a recognition type the dialog shows the size range only, with that type's size chart, and the tile filter uses size only.
4. **Map, `usePlaceBoundaries.ts`.** Add a `recognitions-tiles` source with a transparent fill, for clicks, and a Style A line, filtered to the selected recognition type and the size filter, under the labels. Protected-area boundaries draw only while Protected areas is selected. Recognition outlines draw only while a recognition button is selected. A click inside a drawn recognition opens its profile, as a boundary click does now. The selected place's thicker outline comes from whichever archive holds it, and shows even when its type is not drawn, so a recognition opened from a badge is highlighted. Colours follow the basemap, as the place colours do.
5. **Profile, `PlaceProfileComponent.vue`.** Under the title, show a conservation area's recognitions as badges: a small dot in the group's colour, then the type. A badge is a button that opens that recognition's profile in the same column and selects it on the map. A recognition's own profile has no badges. Its **Areas** tab lists the conservation areas it recognises, read by `loadRecognisedPlaces` in pages and chunks, as `PlaceCard`s that open them. Overview shows each country as a tag. Elsewhere several country names are joined with commas. `/places/:id` is unchanged.
6. **Tests.** Extend `api.spec.ts`, `PlacesBarComponent.spec.ts`, `PlaceProfileComponent.spec.ts`, and `usePlaceBoundaries.spec.ts` for the type argument, the second row, size-only tools, the layer filters, and the badges. Run the catalog suite, the component and places tests, `npm run type-check`, and `npm run lint`.
7. **Browser check.** Run the `browser-check` skill on `/` with Places open: Protected areas, Recognitions, World Heritage, a World Heritage profile, and a park with a badge, wide and narrow.
8. **User evaluation.** Start the dev server on `http://localhost:5173` and give the URL to the user. The user evaluates the local app in the browser before the pull request is opened. Changes they ask for that stay within this task go on this branch.
9. **Docs.**
   - `docs/user/using-the-map.md`: the Recognitions button and its row, the outlines and their colours, the size-only tools, and the badges.
   - `docs/user/data.md`: recognitions are shown. What a badge means: a confirmed link, where at least 75% of the park is inside the recognition.
   - `docs/blueprint.md`: the app now reads the recognitions archive.

## Do not

- Do not change the database, a migration, the importer, or a published archive.
- Do not add buttons for Natura 2000, Emerald, or other regional. They show only as badges and through search.
- Do not draw recognitions while Protected areas is selected. Do not draw all recognitions at once.
- Do not show proposed links.
- Do not add a catalog entry or change `layers.json`.
- Do not open the pull request before the user has evaluated the local app.
- Do not start task 10.

## Done when

- The Places panel, map, and profile work as described above, with no console errors in the browser check.
- The tests, type check, and lint pass.
- The user has evaluated the local app and approved it.
- using-the-map.md, data.md, blueprint.md, and the parcel match the result.
- One pull request into `develop`, merged after its checks pass and the user approves.

## How to work

Branch from `develop`. Do this task only. Do not commit secrets. Do not add an AI or tool attribution to a commit or a pull request.
