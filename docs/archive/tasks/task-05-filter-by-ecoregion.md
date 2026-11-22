# Task 05 — Filter by ecoregion

Parcel: [Ecoregions](../../parcels/ecoregions.md).

Repository: naturewatch-app. Start from `develop`. Task 04 merged in #452.

## Goal

The filter dialog of Conservation areas and of each recognition type gets an **Ecoregion** field. You type an ecoregion's name and choose one or more. The list, its count, the filter charts, and the map then keep only the places with a confirmed `located_in` link to a chosen ecoregion, together with the size and cropland ranges. The chosen ecoregions are kept when you switch place type, as the size range is.

Decided 22 November 2026 by the user, during the evaluation of the local app:

- **The cropland range leaves the filter dialog**, for every place type, as the cropland figures are only useful in South Africa. The cropland sort stays. The list reads keep their cropland parameters, which the app now leaves at 0–100%.
- **The suggestions list inside the dialog**, under the field. The dialog grows and scrolls to show them.
- **The Ecoregion hint shows on hover** of a small info icon beside the field's name.

## Facts already stored

From the code and the hosted database on 22 November 2026:

- `place_matched`, `place_window`, `place_window_count`, `place_rank`, `place_kept_ids`, and `place_filter_stats` take `p_place_types text[]` (`20261126100000_place_cleanup.sql`). `place_window`, `place_window_count`, and `place_rank` read `place_matched`. `place_filter_stats` reads `listed_places` itself. `place_kept_ids` is not called by the frontend.
- `place_relationships` has an index on `object_place_id`. `anon` reads only confirmed, unretired links between published places. A park or recognition is the subject, the ecoregion the object (task 02). Confirmed links: 45,002 from 39,389 conservation areas, 12,912 from recognitions. The largest ecoregion holds 1,153 conservation areas.
- `listed_places` holds the 846 published ecoregions.
- The map filters places on tile properties: `PlacesStore.tileFilter` from `placeTileFilter` (size and cropland), and the withdrawn ids. The tiles do not hold ecoregion ids. `shownAreaIds` draws an id list instead, while a Related tab is open.
- `PlacesFilterDialog.vue` holds the size and cropland ranges, a live count from `loadPilotPlaceWindowCount`, **Clear all**, and the Show button. `PlacesStore` holds `sizeKept`, `croplandKept`, `filtering`, `applyFilter`, and `clearFilter`. `sizeOnly` covers the recognition types and ecoregions.
- `PlaceCountriesEditor.vue` is a reka-ui Combobox with removable chips, filtered on the client.

## Do this

1. **Migration, `supabase/migrations/20261128100000_ecoregion_filter.sql`.** Drop and recreate `place_matched`, `place_window`, `place_window_count`, `place_rank`, `place_kept_ids`, and `place_filter_stats` with a last parameter `p_ecoregion_ids uuid[] default null`. Null or empty keeps every place. Otherwise a place is kept when it is the subject of a confirmed, unretired `located_in` link to one of them. Bodies, sorts, limits, security, comments, and grants otherwise as now. Load it locally and check, as `anon`, that a default list read returns the same first 50 ids before and after, and that a read with one ecoregion returns its "Contains" places of that type.
2. **Reads, `src/places/api.ts`.** `PlaceWindowQuery` and `matchedArgs` take `ecoregionIds`. `loadPilotPlaceFilterStats` takes them. Add `loadEcoregionNames()`, the 846 ids and names from `listed_places`, read once, and `loadKeptPlaceIds(query)` over `place_kept_ids`.
3. **Store, `PlacesStore.ts`.** `ecoregionsKept: string[]`, set by `applyFilter` and cleared by `clearFilter`, and part of `filtering`. Kept across place types. Not applied while Ecoregions is listed, nor to the search with no type selected. While it is applied, the store holds `ecoregionPlaceIds`, read with `loadKeptPlaceIds` for the listed types, the size range, and the chosen ecoregions, read again when one of them changes.
4. **Dialog, `PlacesFilterDialog.vue`.** A new `PlaceEcoregionsField.vue` after the ranges, labelled **Ecoregion**, on the `PlaceCountriesEditor` pattern: type to see up to 8 matching names, pick one to add a chip, remove a chip with its mark. Shown for Conservation areas and the recognition types, not for Ecoregions. The live count and the charts follow the chosen ecoregions. **Clear all** clears them too.
5. **List, `PlacesBarComponent.vue`.** The window, count, rank, and stats reads pass the applied ecoregions.
6. **Map, `usePlaceBoundaries.ts`.** While ecoregions are applied, the conservation area and recognition layers keep only `ecoregionPlaceIds`, together with the tile filter and the withdrawn ids. The Related tab's `shownAreaIds` still wins while open. The selected outline still shows.
7. **Tests.** The migration in pytest where the list reads are tested. Extend the specs for the store, the dialog, the bar, and the boundaries: choosing and removing ecoregions, the args passed, the map filter, clearing, and keeping across types. Run the catalog suite, the component and places tests, `npm run type-check`, `npm run lint`, and pytest.
8. **Browser check.** Run the `browser-check` skill on `/` with Places open: Conservation areas filtered by two ecoregions, then switched to Ramsar with the filter kept, wide and narrow.
9. **User evaluation.** Start the dev server on `http://localhost:5173` against the local database with the migration, and give the URL to the user. The user evaluates before the pull request is opened.
10. **Docs.**
    - `docs/user/using-the-map.md`: the Ecoregion field in the Filter paragraph.
    - `docs/database/design.md` and `supabase/README.md`: the list reads take `p_ecoregion_ids`, in the sentence that lists the reads.
11. **Hosted step, after approval.** Open the pull request first. Then `supabase migration list` and `supabase db push` after approval. Check read-only as `anon` the same default list ids and one ecoregion read, with their times.

## Do not

- Do not change the tiles, an archive, a link, or the confirmation share.
- Do not show proposed links, or filter by coverage.
- Do not add the field to the Ecoregions list or to the search with no type selected.
- Do not filter by biome or realm.
- Do not push the migration before approval.
- Do not open the pull request before the user has evaluated the local app.
- Do not start task 06.

## Done when

- The filter dialog, list, count, charts, and map work as described, with no console errors in the browser check.
- The tests, type check, lint, and pytest pass.
- The user has evaluated the local app and approved it.
- The migration is applied to the hosted database, and the `anon` checks match.
- using-the-map.md, design.md, and supabase/README.md match the result.
- One pull request into `develop`, merged after its checks pass and the user approves.

## How to work

Branch from `develop`. Do this task only. Do not commit secrets. Do not add AI or tool attribution to a commit or a pull request.
