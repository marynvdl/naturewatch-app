# Task 004 — Place filters

Parcel: [Sooty Earth interface](../parcels/ui-revamp.md)

Repository: naturewatch-app. Start only after task 003 has merged.

## Goal

Let the places list be narrowed by name, type, and minimum size. Filtering hides map shapes that are already loaded. It does not download the park boundaries again.

## Facts already stored

`public.pilot_places` already exposes `id`, `name`, `place_type`, and `area_km2`. Every current row is a terrestrial protected area in South Africa of at least 10 km². `area_km2` on that view is the size of the place.

`public.facts.area_km2` is the cropland area inside the place, not the size of the place. Keep those two numbers separate. Cropland for the list is the existing sprout `cropland-2024-v1` and method `area-weighted-spheroid-v1`.

`loadPlaceMap` in `frontend/naturewatch/src/places/api.ts` downloads every boundary. That wait is accepted for this task. A later parcel replaces it with vector tiles.

## Do this

- Extend `loadPilotPlaces` so each row has `id`, `name`, `place_type`, `area_km2`, and the cropland square kilometres and percent when a fact exists.
- Add one filter function in `frontend/naturewatch/src/places/display.ts`: text, place type, and minimum area. Cover it with unit tests. An empty text query and an empty minimum match everything. The 10 km² floor stays in the database view, not as a hidden extra filter.
- The only type available today is protected area. The control may offer that type. Do not invent Wild Space, Ecoregion, Country, or ecosystem condition.
- When the filter changes, hide non-matching shapes with a Mapbox filter on the features already in the map source. Do not call `loadPlaceMap` again.
- Keep the current empty, error, and “place store is not configured” states.
- Update the one blueprint sentence that says what `/places` reads, if that sentence would otherwise be wrong. Do not copy the pipeline docs into this repo.

## Do not

- Do not add a database migration unless a required column is missing. These columns are already on `pilot_places`.
- Do not simplify or re-download geometries.
- Do not build the grid, the split layout, or a new popup. Apply this filter to the names on `/places` and to the shapes already on the map. Task 005 builds the grid, the table, and the split view. Task 006 owns the popup.
- Do not start task 005.

## Done when

- The filter tests pass, and the catalog tests still pass.
- Changing the filter updates which names are shown and which shapes are visible, without a second boundary download.
- The work is on a branch from `develop`, in one pull request into `develop`. Report the pull request address. Do not merge it.

## How to work

Branch from `develop`. Do this task only. No cloud processing and no production deploy. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
