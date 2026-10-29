# Task 03 — Place tiles on the map

Parcel: [Places Tiles](../parcels/places-tiles.md)

Repository: naturewatch-app. Start only after task 02 has published the archive.

## Goal

Draw boundaries from the published PMTiles archive. Stop calling `loadPlaceMap`. A click still opens the Supabase profile.

## Facts already stored

Task 02 publishes `gs://nature-watch-tiles/places/protected-area/v1/places.pmtiles`. Each feature has `places.id`, `area_km2`, and cropland percent when a fact exists. The list still reads Supabase. `places.geom` stays ungranted. The app does not offer a polygon download.

`loadPlaceMap` in `frontend/naturewatch/src/places/api.ts` still downloads every `pilot_place_map` row. This task removes that path from the map.

## Do this

- Show me options for the visual design of the features and let me approve.
- Draw protected-area boundaries from that archive for the current view and zoom. Keep Mapbox.
- Size and cropland filters still hide places on the map. Use the copied fields on the tile. A place with no cropland fact passes the cropland filter only while that range is 0–100%.
- A click on a boundary opens that place’s profile from Supabase, even when it is not in the 50. The tile’s `id` is `places.id`.
- Choosing a place still moves the map to it when it is outside the current view. That boundary is drawn at that zoom.
- Stop calling `loadPlaceMap`. Leave `pilot_place_map` in the database. Do not grant `places.geom`.
- Update `docs/blueprint.md` and `docs/user/using-the-map.md` where they say the map reads `pilot_place_map`.
- Ask me when you are not 90% sure.

## Do not

- Do not import the global WDPCA file. Task 04 does that.
- Do not change the list query from task 01.
- Do not offer a polygon download.
- Do not start task 04.

## Done when

- Protected Areas draws from the archive. Opening Places does not download `pilot_place_map`.
- A place that is on the map and not in the 50 can still be opened from its boundary.
- Size and cropland filters still apply to the drawn boundaries.
- Tests cover a map click that is not in the list window, and a missing place-store setting. The catalog tests still pass.
- The map has been checked in the browser on a wide screen and a narrow screen, including a world view and a zoomed-in place.
- The work is on a branch from `develop`, in one pull request into `develop`. Report the pull request address. Do not merge it.

## How to work

Branch from `develop`. Do this task only. No cloud processing and no production deploy. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
