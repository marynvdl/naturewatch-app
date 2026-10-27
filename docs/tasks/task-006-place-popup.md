# Task 006 — Place popup

Parcel: [Sooty Earth interface](../parcels/ui-revamp.md)

Repository: naturewatch-app. Start only after task 005 has merged.

## Goal

Restyle the popup that opens when a place is clicked. Show the facts already stored. There is no photo and no further page.

## Do this

- Restyle the popup built by `placePopupElement` in `frontend/naturewatch/src/places/display.ts` and opened from `MapComponent.vue`. Use the new type, white panel, and thin grey border.
- Show the place name, the place size (`pilot_places.area_km2`), cropland square kilometres and percent, the release month, the source line, and the Protected Planet link when a site id exists.
- Place size and cropland area are different numbers. Size is the park. Cropland is the fact for sprout `cropland-2024-v1`. If the map feature does not already carry the park size, join it from the place row already loaded for the list. Do not download the boundary again to get it.
- Keep the text as text, not as HTML assembled from the database.
- Opening a place from the list selection uses this same popup.
- Update the popup unit tests for the new size line.

## Do not

- Do not add an image slot, a chart, or a click-through to a detail page.
- Do not redesign `/places/:id`. Leave `PlaceView.vue` as it is.
- Do not change attribution text or the Protected Planet address format.
- Do not start task 007.

## Done when

- Clicking a shape on the map and selecting a row in split both open this popup with the stored facts.
- A place with no cropland fact still says that no figure is stored.
- Popup tests and catalog tests pass, and the popup has been opened in the browser.
- The work is on a branch from `develop`, in one pull request into `develop`. Report the pull request address. Do not merge it.

## How to work

Branch from `develop`. Do this task only. No cloud processing and no production deploy. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
