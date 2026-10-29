# Task 009 — Place selection

Archived. This task is not active.

Parcel: [Budding Places](../parcels/budding-places.md)

Repository: naturewatch-app. Start only after task 008 has merged.

## Goal

Choosing a result and clicking a boundary select the same place and open its profile beside the list. Move the map to the place only when it is outside the current view. Keep a zoom-to-place control. Closing the profile leaves the map, the search, and the place type as they are. When a place is clicked in the map while the list view wasn't opened, keep the list view closed, and just show the profile to the left.

## Do this

- One selected place id is shared by the results and the map. The selected result is visibly selected, and its boundary is highlighted.
- Opening a place shows its profile beside the list. The profile contents belong to task 010. This task can show the place name in that column.
- If the list is closed, a click on a boundary does not open the list. The profile sits on the left on its own.
- If the selected place is already in the current map view, leave the camera where it is. If it is not, fit the map to that place with room for the open panels.
- Add a zoom-to-place control that fits the map to the selected place.
- Closing the profile clears the selection and leaves the map position, the search text, and the selected place type as they are.
- Keep the text as text, not as HTML assembled from the database.

## Do not

- Do not download boundaries again in order to select a place.
- Do not build the Overview, Disturbances, and Species tabs. Task 010 owns them.
- Do not add photographs.
- Do not change how the full set of boundaries is loaded.
- Do not start task 010.

## Done when

- A result click and a boundary click select the same place and open the profile.
- A boundary click while the list is closed leaves the list closed.
- The map stays put when the place is already in view, and the zoom-to-place control still fits it.
- Closing the profile does not change the search, the place type, or the camera.
- New tests cover that selection behaviour. The catalog tests still pass.
- The selection has been used in the browser on a wide screen and a narrow screen.
- The work is on a branch from `develop`, in one pull request into `develop`. Report the pull request address. Do not merge it.

## How to work

Branch from `develop`. Do this task only. No cloud processing and no production deploy. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
