# Task 01 — Profile navigation

Parcel: [Wayfinding](../../parcels/wayfinding.md).

Repository: naturewatch-app. Start from `develop`. The parcel merged in #456.

## Goal

A person can move from a place to its related places and back without losing what is drawn. The profile keeps its tab, has a back button and a breadcrumb, and keeps a Related set on the map while one of its places is open. That set shows as a chip under Landscape, which can be pinned. Resting the pointer on a place on the map shows its name. The source line scrolls with the content.

Decided 25 November 2026 by the user:

- **Drilling down opens Overview.** Opening a place that belongs to the drawn Related set, from the map or from a card, opens it on Overview and keeps the set drawn. Opening any other place keeps the open tab. Back returns to the previous place on the tab it was on.
- **Chips: temporary and pinned.** A temporary set goes when you leave it. A pinned set stays until you remove it.
- **Chip label, changed during evaluation.** A link icon and the owner's initials, such as SSD. The full "Related to South Sahara desert" shows on hover. Icons per place type are for later.
- **Sets and the list draw together, decided during evaluation.** The list's conservation areas draw as before, and the sets' places draw with them, with a darker outline on a `places-set-line` layer above. With Places closed, only the sets draw. The chips move under the Landscape panel while it is open.
- **Map hover, changed during evaluation.** Hovering the map no longer highlights or scrolls cards. After the pointer rests on a place for 600 ms, a tooltip names it. The name is read from `place_summaries`, once per place.

## Facts already stored

From the code on 25 November 2026:

- The tab is `activeTab = ref('overview')` in `PlaceProfileComponent.vue`. `load()` resets it to `props.startTab ?? 'overview'` on every place change. `PlacesStore.startTab` (`'photos' | 'status'`) is set by `openFromPhotoQueue` and `openFromAdminList`, and cleared through `@started`.
- `PlacesStore` keeps only `selectedId` and `selectedFrom`. `selectPlace(id)` on the selected place clears it. There is no history.
- The profile emits `areas` with the related conservation-area ids while Related is open, and `null` otherwise and on unmount. `MapComponent.vue` writes them to `placesStore.shownAreaIds`. `applyKeptFilter` (`usePlaceBoundaries.ts`) draws only those ids on `places-fill` and `places-line` while it is set, whatever the list shows. Only conservation areas are drawn this way.
- A card hover goes `PlaceCard @highlight` → `placesStore.hoverPlace(id, on)` → `hoveredId` → the hover-line filters. Map hover on `places-fill`, `recognitions-fill`, and `ecoregions-fill` only sets the cursor.
- The source line `.place-source` sits after `.place-body` with `margin: auto 0 0` and a top border. On a wide screen, Related and Photos (`.is-list-tab`) scroll only their list, so the source line stays at the bottom.
- Landscape is a `BlobButton` with `edge="right"` in `MapComponent.vue`, wrapping `DrawerComponent`.
- Tests: `PlaceProfileComponent.spec.ts`, `PlacesStore.spec.ts`, and `usePlaceBoundaries.spec.ts`.

## Do this

1. **Store, `PlacesStore.ts`.**
   - `profileTab` holds the open tab. It replaces `startTab`: `openFromPhotoQueue` sets `photos`, and `openFromAdminList` sets `status`.
   - `history`: entries of `{id, name, tab}`. Opening a place pushes the current one. `goBack()` pops one, selects it, and restores its tab. `clearSelection()` and a second click on the selected place empty it. Keep at most 20 entries.
   - `mapSets`: entries of `{id, label, kind: 'related', ownerId, placeIds, pinned}`.
     - At most one is temporary. It is created or replaced from the profile's `areas` emit, labelled "Related to <place>".
     - `pin(id)` makes it pinned. `removeSet(id)` removes it.
     - `shownAreaIds` becomes a computed union of all sets' ids, or `null` when there are none. `applyKeptFilter` is unchanged.
   - **Drill-down.** `selectPlace` checks whether the new place is in the temporary set. If it is, the profile opens on Overview and the set stays. If it is not, the set is removed and the tab is kept. Back to the set's owner keeps the set.
2. **Profile, `PlaceProfileComponent.vue`.**
   - Read and write the tab through `placesStore.profileTab`. When the tab is not in the current tab list, show Overview. Remove the `startTab` prop and `@started`.
   - While a place is a member of the temporary set, its own Related tab does not replace that set. Opening Related on it replaces the set, as today.
   - Add a back button (Lucide `ArrowLeft`, `map-control`) at the top left of the header, opposite the close mark. Show it only when `history` is not empty. Its label names the previous place.
   - Add a breadcrumb under it: up to the last two places before this one, each a button that steps back to it, and ending with the current name. It is one line that truncates with an ellipsis.
   - Move `.place-source` inside the scrolling content, after the tab panel, so it scrolls with the list on Related and Photos. Drop the top border, and keep the 10 px muted text.
3. **Chips, `MapComponent.vue` and a new `MapSetChips.vue`.**
   - Each set is a chip under the Landscape button on the right, in the panel style of `visual.css` and the Landscape and Measure panels.
   - A temporary chip has an outline and a pin button (Lucide `Pin`). A pinned chip is solid with `PinOff`. Both have a × that removes the set.
   - Clicking a chip's label opens its owner place.
   - The chips stack and must not cover Measure, Labels, the basemap button, or the account button, at wide and narrow sizes.
4. **Map hover, `usePlaceBoundaries.ts`.**
   - When the pointer rests on a drawn place for 600 ms, show its name in a tooltip above the pointer (`placesStore.mapTip`, drawn in `MapComponent.vue`). Use the same "drawn above" rule as clicks: an ecoregion under a drawn park gives the park.
   - A move of 4 px or more, leaving the map, dragging, or a click hides it. While measuring, nothing is shown.
   - Hover on touch screens is out of scope.
5. **Name read, `places/api.ts`.** `loadPlaceName(id)` reads `place_summaries.name` and keeps it for the session.
6. **Tests.**
   - Store: tab kept and the fallback, the drill-down rule, history push, pop, and clear, the temporary set replaced and removed, pinned sets kept, and the union.
   - Profile: the back button and breadcrumb, the tab read from the store, and the source line inside the panel.
   - Boundaries: the tooltip after a rest, a small move, hiding, and the drawn-above rule.
   - Initials: `initials()` in `display.ts`.
   - Chips: they render, and pin and remove work.
   - Run the catalog suite, the component, store, and places tests, `npm run type-check`, and `npm run lint`.
7. **Browser check.** Run the `browser-check` skill on `/`, wide and narrow:
   - an ecoregion on Related with its parks drawn and the chip;
   - a park opened from a Related card, with the set still drawn, the back button, and the breadcrumb;
   - a pinned chip after opening an unrelated place;
   - the source line at the end of a long Related list;
   - every existing control still visible where it was.
8. **User evaluation.** Start the dev server on `http://localhost:5173` and give the URL to the user. The user evaluates the local app before the pull request is opened. Changes they ask for within this task go on this branch.
9. **Docs.** `docs/user/using-the-map.md`: the tab kept between places and the drill-down rule, back and the breadcrumb, the chips and pinning, the name tooltip on the map, and the source line at the end of the content. Replace the sentence "Leaving the tab or closing the profile removes them."

## Do not

- Do not change the database, a migration, or a tile archive.
- Do not change edit mode's tabs or the link editor. Task 02 does.
- Do not change the Places bar, its type rules, In view, or Filter. Task 03 does.
- Do not draw related ecoregions or recognitions from a set. Sets draw conservation areas only, as today.
- Do not tie the history to the browser's back button or the route.
- Do not build the query builder or "Places here" on right click.
- Do not open the pull request before the user has evaluated the local app.
- Do not start task 02.

## Done when

- Tab, back, breadcrumb, drill-down, sets and chips, the name tooltip, and the source line work as described above, with no console errors in the browser check.
- The tests, type check, and lint pass.
- The user has evaluated the local app and approved it.
- `using-the-map.md` matches the result.
- One pull request into `develop`, merged after its checks pass and the user approves.

## How to work

Branch from `develop`. Do this task only. Do not commit secrets. Do not add AI or tool attribution to a commit or a pull request.
