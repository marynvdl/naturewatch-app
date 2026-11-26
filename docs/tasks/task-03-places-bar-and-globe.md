# Task 03 — Places bar and globe

Parcel: [Wayfinding](../parcels/wayfinding.md).

Repository: naturewatch-app. Start from `develop`. Task 02 merged in #459.

## Goal

Ecoregions combine with the other place types and draw below them. The list starts with In view on. Sort, Filter, and In view show even before a type is chosen. The map's padding follows the open panels, so the globe and every fit are centred in the space the panels leave free.

Decided 26 November 2026 by the user:

- **Tools before a type.** The whole tools row, Sort, Filter, and In view, always shows under the type buttons. The count shows only once a list loads. With no type on, Filter edits the kept size range and ecoregions, and its button reads **Apply** instead of a count.
- **Panels.** The padding leaves room for the Places columns on the left (list and profile) and the Landscape panel on the right while it is open. Measure, and the stacked column on a narrow screen, add no padding.
- **Camera.** When a panel opens or closes, the map eases for about 300 ms to the new padding, so its centre stays in the middle of the free space. The zoom stays.
- **Ecoregion filter.** While Ecoregions is on, with or without other types, the Ecoregion field is hidden and the chosen ecoregions do not apply. That is today's rule. No database change.

## Facts already stored

From the code on 26 November 2026:

- `PlacesBarComponent.vue`: `ALONE = ['ecoregion', 'country']`, and `selectPlaceType` turns every other type off when one of those is chosen, and turns them off when another type is chosen. `listedTypes` already maps several buttons to stored types, in button order, and `listQuery` passes them all as `placeTypes`.
- The list RPCs (`supabase/migrations/20261128100000_ecoregion_filter.sql`) filter on `place_type_id = any (p_place_types)`, so a list of ecoregions and conservation areas needs no database change. `placesStore.ecoregionIds` is empty whenever `listTypes` includes `ecoregion`, and `PlacesFilterDialog` hides the Ecoregion field then.
- `placesStore.sizeOnly` is true while any listed type is a recognition or ecoregion, which leaves the cropland sorts out. `applyKeptFilter` draws conservation areas while they are listed or while nothing size-only is, and draws ecoregions while they are listed.
- The ecoregion layers are added below the conservation-area and recognition layers. `onPlaceClick` already opens the park when a click on an ecoregion also hits a drawn place above it, and the name tooltip names the park.
- `listInView` starts `false`, and `clearPlaces` sets it `false`.
- The tools row (`.places-tools`) shows only while `showTools`: a type is listed, the list loaded, and something is stored or filtered. The Filter button opens `PlacesFilterDialog`, whose button reads `Show N places` from `loadPilotPlaceWindowCount`.
- The map has no padding of its own. `panelCover` measures `.places-frame` and `.place-profile`. `panelPadding` gives `fitBounds` 72 px with the cover on the left, and `centreCoveredPlace` pans a place clicked on the map out from under the panels. Both pass `retainPadding: false`.
- `MapComponent.vue` lays out the columns with `--list-track` and `--profile-track`. The Landscape panel is `DrawerComponent` in the right-edge `BlobButton`, open while `drawerVisible`. At 720 px and below the list and profile stack in one column.
- Tests: `PlacesBarComponent.spec.ts`, `PlacesFilterDialog.spec.ts`, `usePlaceBoundaries.spec.ts`, and `PlacesStore.spec.ts`.

## Do this

1. **Types, `PlacesBarComponent.vue`.**
   - Only Countries stays alone. Ecoregions turns on and off like Conservation areas and the recognition types. Choosing Countries turns the others off, and choosing another type turns Countries off.
   - The list holds every listed type in one order. Cards already label their type.
   - Update the comments that say Ecoregions is on alone, here and in `PlacesStore.ts` (`listTypes`).
2. **Map, `usePlaceBoundaries.ts`.** Conservation areas and recognitions draw while they are listed, also while Ecoregions is on. Ecoregions stay below them. Check that a click and the name tooltip over a park inside a drawn ecoregion still give the park. Change the drawing rule only as far as that needs.
3. **In view.** `listInView` starts `true`, and clearing the list returns it to `true`. The button still turns it off.
4. **Tools row.**
   - Sort, Filter, and In view always show under the type buttons, also with no type and while the list loads. The count shows only once a list has loaded.
   - With no type on, Filter opens the dialog with the size range and the Ecoregion field. It reads no count and no chart, and its button reads **Apply**. Applying keeps the size range and ecoregions in the store, so they apply when a type is chosen.
   - While an admin list or a search with no type is shown, the row stays as it is in that view today, apart from showing.
5. **Map padding.**
   - The map's padding is the Places cover on the left (as `panelCover` measures it) and, while Landscape is open on a screen wider than 720 px, the Landscape panel's width on the right. It is 0 on the right otherwise, and 0 on the left at 720 px and below.
   - It follows the panels as they open, close, and resize. When it changes, the map eases for about 300 ms to the new padding, keeping the zoom.
   - `fitBounds` and `centreCoveredPlace` pass the panels' padding, with the 72 px margin for a fit, and keep `retainPadding: false`, because Mapbox otherwise keeps a fit's padding, margin included, as the map's own. A move under way when the panels change takes the new padding when it ends, keeping the view where it is. A place fitted or clicked lands in the middle of the free space, as today.
6. **Docs.** In `docs/user/using-the-map.md`, rewrite the sentences on Ecoregions being on alone, conservation areas not drawn while it is on, In view being off at the start, and when the tools show. Add one sentence that the map centres in the space the open panels leave free.
7. **Tests.**
   - Places bar: Ecoregions together with Conservation areas and a recognition type, Countries alone, the tools row with no type, Filter's Apply with no type, and In view on at the start and after clearing.
   - Filter dialog: Apply with no type writes the store and reads no count.
   - Boundaries: conservation areas drawn with ecoregions, and the map padding from the panels.
   - Run the catalog suite, the component and store tests, `npm run type-check`, and `npm run lint`.
8. **Browser check.** Run the `browser-check` skill on `/`, wide and narrow. Look at:
   - Ecoregions with Conservation areas on, both drawn, parks above ecoregions;
   - the tools row before a type is chosen, and In view on;
   - the globe centred beside the Places columns, and again with Landscape open;
   - every existing control still visible where it was, and no console errors.
9. **User evaluation.** Start the dev server on `http://localhost:5173` and give the URL to the user. The user evaluates the local app before the pull request is opened. Changes they ask for within this task go on this branch.

## Do not

- Do not change the database, a migration, an RPC, or a tile archive.
- Do not change the ecoregion line paint. Task 04 does.
- Do not apply the Ecoregion filter while Ecoregions is on.
- Do not make In view follow the padded area. It stays the whole map view.
- Do not pad for Measure or for the narrow stacked column.
- Do not change the photo queue or the admin lists. Task 05a does.
- Do not build the query builder. It is deferred.
- Do not open the pull request before the user has evaluated the local app.
- Do not start task 04.

## Done when

- Ecoregions combine with the other types and draw below them, and a park inside an ecoregion opens the park.
- The list starts with In view on, and Sort, Filter, and In view show before a type is chosen.
- The globe is centred in the free space beside the open panels, and fits land there, with no console errors in the browser check.
- The tests, type check, and lint pass.
- The user has evaluated the local app and approved it.
- `using-the-map.md` matches the result.
- One pull request into `develop`, merged after its checks pass and the user approves.

## How to work

Branch from `develop`. Do this task only. Do not commit secrets. Do not add AI or tool attribution to a commit or a pull request.
