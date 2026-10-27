# Task 005 — Places and split

Not part of the [Sooty Earth interface](../parcels/ui-revamp.md) parcel. The places list and the map-and-list split wait for a later parcel. Do not start this task from that parcel.

Repository: naturewatch-app. Start only after that later parcel takes it up, and after task 004.

## Goal

Show the filtered places as a grid or a table, and offer the same list beside the map. The map shows the places the list shows. Choosing a row and clicking a shape select the same place.

## Do this

- Rebuild `frontend/naturewatch/src/views/PlacesView.vue` with the new controls. Offer a grid and a table. Use the filter from task 004: name, type, and minimum size.
- Add `/?view=split` if it is not already a mode of the map page. Keep one Mapbox instance. Put this grid or table in the left pane, in the proportions of the Airbnb map-and-list layout. If the split view already has a way back to the map and a way to `/places`, keep those.
- Keep one Mapbox instance when moving between the plain map and split. Do not create a second map.
- The list and the map use the same filter. A row click and a shape click share one selected place id.
- Keep today’s loading, empty, error, and “not configured” states.
- A row may still link to `/places/:id`. Do not redesign that page. Task 006 owns the popup.

## Do not

- Do not download boundaries again in order to filter.
- Do not add photos, charts, or place types that are not stored.
- Do not restyle the popup beyond what is required for the shared selection.
- Do not start task 006.

## Done when

- Grid and table show the same filtered places.
- Split shows that list beside the map, and the map hides places the filter excludes.
- Selecting a row highlights the shape, and clicking the shape selects the row.
- Catalog and filter tests pass. The list, an empty filter, a missing place-store setting, and split have been used in the browser on a desktop width and a narrow width.
- The work is on a branch from `develop`, in one pull request into `develop`. Report the pull request address. Do not merge it.

## How to work

Branch from `develop`. Do this task only. No cloud processing and no production deploy. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
