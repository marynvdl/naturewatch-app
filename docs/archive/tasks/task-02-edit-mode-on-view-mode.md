# Task 02 — Edit mode on view mode

Parcel: [Wayfinding](../../parcels/wayfinding.md).

Repository: naturewatch-app. Start from `develop`. Task 01 merged in #457.

## Goal

Edit mode does everything view mode does, with the edit controls added on top. The profile shows Overview, Related, Photos, and Status. Related keeps its cards, map drawing, hover, and chips in edit mode. The link editor's actions sit on those cards.

Decided 25 November 2026 by the user:

- **Actions on the cards.** Related in edit mode is one list in which each link appears once. **Add +** sits at the top. A **Proposed** group comes first, then the view's groups by relationship, then **Rejected** and **Retired**. Each card has its origin and coverage under it, with that status's buttons. Edit mode also lists the links that view mode shows as badges or Overview tags, so they can be reviewed.
- **Tabs, changed during evaluation.** Edit mode hides Landscape and Species, which have nothing to edit, so the tabs fit on one line. The gap between tabs is 20 px. The header, Zoom to place, and the tabs keep their height on every tab.

## Facts already stored

From the code on 25 November 2026:

- `tabs` in `PlaceProfileComponent.vue` is Overview, Related (`links`), Photos, and Status while `editing`, and Overview, Related, Landscape, and Species otherwise. `EDIT_TAB` and `VIEW_TAB`, with a watch on `auth.editMode`, map one set onto the other. The tab is kept in `placesStore.profileTab`, and a tab the place lacks shows Overview (task 01).
- In view mode the profile reads confirmed links with `loadRelatedPlaces` and emits `areas`, which draws the conservation areas and makes the temporary chip. That watch runs only while `activeTab === 'related'`. So in edit mode, on `links`, nothing is drawn and there is no chip or card hover.
- `PlaceLinksEditor.vue` reads every link with `loadPlaceLinks(id)`. It groups them as Proposed, Confirmed, Rejected, and Retired, 20 at a time. Each one is a text row with its label, name, type, origin, coverage, and actions (`ACTIONS`). Its **Add +** opens `EditDialog` with `LINK_CHOICES` and a place search. A change emits `changed`, and the profile reads `related` again.
- View-mode Related leaves out the recognitions shown as badges and the ecoregions shown as Overview tags.
- `PlaceCard` is a `<button>` with an optional `note` tag. It has no slot, so buttons go beside it, not inside it.
- `.place-tabs` wraps, so six tabs fit on two lines at a narrow width.
- Tests: `PlaceProfileComponent.spec.ts`, which covers the links editor under `describe('links')`.

## Do this

1. **Tabs, `PlaceProfileComponent.vue`.**
   - Edit mode shows Overview, Related, Photos, and Status, in that order. View mode is unchanged.
   - Remove the `links` tab id, `EDIT_TAB`, `VIEW_TAB`, and their watch. Switching mode keeps the open tab where the other mode has it, and shows Overview through the fallback from task 01 where it does not.
   - The `areas` emit, the main photos, and `is-list-tab` follow `related` in both modes.
2. **Related in edit mode, `PlaceLinksEditor.vue`.**
   - The profile shows it in place of the view's groups on Related while `editing`. It keeps its own `loadPlaceLinks` read and the Add dialog.
   - **Add +** at the top. Then **Proposed**, then the confirmed links in the view's groups and order (`RELATED_ORDER`, `linkLabel`), then **Rejected** and **Retired**. Each group shows its count and 20 cards at a time with **Show more**. Badge and tag links are included.
   - Each link is a `PlaceCard`, with name, type, country, area, and main photo, as on view-mode Related. Under it is one muted line and the buttons: the relationship label (only in Proposed, Rejected, and Retired), the origin ("Added by an admin" or the origin), and the coverage when known. Then the buttons from `ACTIONS`, as today. A link whose other place has no name shows its id, and its card does not open.
   - A card click emits `open`. Hover and focus emit `highlight`, which the profile passes on as view mode does.
   - Ask for the main photos of the cards shown (`requestMainPhotos`).
3. **Map drawing in edit mode.** The map draws, and the chip shows, the same confirmed conservation areas as view mode, from the profile's `related`. Proposed, rejected, and retired links are not drawn. A link change reads `related` again, so the drawn set follows.
4. **Docs.** In `docs/user/using-the-map.md`, rewrite the edit-mode paragraph on tabs and Related to match the result: the four tabs, Related as cards with actions, and that the map, chips, and hover work as in view mode. Remove "Leaving Edit mode returns to the Related cards".
5. **Tests.**
   - Profile: the four tabs in edit mode, and the tab kept across the switch, including Landscape and Photos falling back to Overview. The `areas` emit and card hover in edit mode.
   - Links editor: the group order, the badge and tag links included, the actions per status, the line under each card, Add, and Show more. Update or move the existing `describe('links')` tests.
   - Run the catalog suite, the component and store tests, `npm run type-check`, and `npm run lint`.
6. **Browser check.** Run the `browser-check` skill on `/`, wide and narrow, signed in as an admin in edit mode if the skill can sign in. Otherwise check view mode for no change, and say that edit mode was checked only by tests and the user. Look at:
   - an ecoregion on Related in edit mode, with its parks drawn, the chip, and cards with actions;
   - the tabs on one line, and the header the same height on every tab;
   - every existing control still visible where it was.
7. **User evaluation.** Start the dev server on `http://localhost:5173` and give the URL to the user. The user evaluates the local app in edit mode before the pull request is opened. Changes they ask for within this task go on this branch.

## Do not

- Do not change the database, a migration, a policy, or a tile archive.
- Do not change the Photos or Status tabs, the photo queue, or the admin lists. Task 05a moves the photo queue.
- Do not change view mode, apart from shared code moving.
- Do not draw proposed, rejected, or retired links on the map.
- Do not change `PlaceCard` beyond what the cards need. It stays a button.
- Do not change the Places bar, its type rules, In view, or Filter. Task 03 does.
- Do not open the pull request before the user has evaluated the local app.
- Do not start task 03.

## Done when

- Edit mode shows the four tabs, and Related shows each link once as a card with its actions. The map, chips, and hover work as in view mode, with no console errors in the browser check.
- The tests, type check, and lint pass.
- The user has evaluated the local app and approved it.
- `using-the-map.md` matches the result.
- One pull request into `develop`, merged after its checks pass and the user approves.

## How to work

Branch from `develop`. Do this task only. Do not commit secrets. Do not add AI or tool attribution to a commit or a pull request.
