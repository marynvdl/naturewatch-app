# Parcel: Places Tiles

The second of three places parcels. Budding Places is the public browsing experience. Molding Places is the admin editor. This parcel is the global map. Supabase stays the source for names, search, filters, and profiles. The map draws boundaries from a PMTiles archive. The browser does not download the geometry table.

## Goal

Prepare Sooty Earth to display Places globally and efficiently. Expand the stored protected areas to terrestrial areas larger than 10 km² worldwide, publish those boundaries as PMTiles, and keep the list a short ranked window beside a map that draws what is in view.

Task 04 stored terrestrial protected areas worldwide: 51,001 places of at least 10 km², loaded on 31 October 2026. The published tiles stay the South Africa archive until task 05. Do not invent places, descriptions, photographs, or measurements.

## List and map

The map is the fabric of places. The list is a way in. They do not share one fetch.

- **Map.** All terrestrial protected areas of at least 10 km² that pass the size and cropland filters, drawn from PMTiles for the current view and zoom. Smaller places appear as you zoom in. The largest are visible at a world view. Choosing a place still moves the map to it, and that boundary is drawn at that zoom. The tile carries `places.id`. A click opens the Supabase profile even when that place is not in the 50. `places.geom` stays ungranted. The app does not offer a polygon download.
- **List.** A separate Supabase query. Default order is largest first. Show 50, and the count already used today, for example “50 of N”. Search and the existing size and cropland filters narrow that query. The numbers on the cards are 1 to the length of this window. Search is part of the query, so it changes which 50 are shown. Name search does not change which boundaries are drawn.
- **Map extent is optional and off at the start.** Off: the 50 largest places that match the filters, worldwide. On: the same sort and cap, limited to the current map view, and refreshed when the view changes. Turning it on does not change the tiles. Extent filtering uses a database function that accepts a bounding box and returns attributes only.
- **Later table.** A comparison table is left for a later parcel. The list query is the one that table will reuse, with a higher limit.

Size and cropland filters apply to both surfaces. `area_km2` and, where a fact exists, cropland percent are copied onto the tile so the map can filter without a second geometry download. The profile still reads the fact from Supabase. A place with no cropland fact passes the cropland filter only while that range is 0–100%. Filter charts read counts from the database. They do not download every place.

## Look

The map stays the main surface. Keep the Budding Places layout, type, and area tags. Add a control that limits the list to the current map view. It uses the same charcoal-while-on style as Filter. Do not switch the map away from Mapbox.

## Left for later

- Molding Places: signing in, edit mode, curated text, overlap review, which places are drawn, and approving photographs.
- Ecoregions, countries, and a comparison table of places.
- Cropland facts for places outside the South Africa set, and the cropland raster PMTiles archive, are [Cropland 2024 global](cropland-2024-global.md). This parcel is the places archive only.
- A production release. Merge into `develop` only.

## Tasks

Do one task at a time, in this order. Start a task only after the one above it has merged. Each task is one branch and one pull request into `develop` in the repo that does the work. When a task has merged, move its file to `docs/archive/tasks/` in that repo, and point the tick at that copy.

[Budding Places](../archive/parcels/budding-places.md) is archived. Start the first task from `develop`.

- [x] [task-01-place-list-window.md](../archive/tasks/task-01-place-list-window.md) — naturewatch-app
  - *Goal:* Replace loading every stored place into the list with a bounded query. Default sort is largest first. Cap 50. Keep the other sorts. Add the extent option, off by default. Do not change boundary loading.
- [x] [task-02-places-pmtiles.md](https://github.com/marynvdl/naturewatch-analysis/blob/main/docs/archive/tasks/task-02-places-pmtiles.md) — naturewatch-analysis
  - *Goal:* Build one PMTiles archive from the authoritative places, prove it on the current South Africa rows, and publish it to `nature-watch-tiles`.
- [x] [task-03-place-tiles-on-the-map.md](../archive/tasks/task-03-place-tiles-on-the-map.md) — naturewatch-app
  - *Goal:* Draw boundaries from the published PMTiles archive. Stop calling `loadPlaceMap`. A click still opens the Supabase profile.
- [x] [task-04-global-protected-areas.md](../archive/tasks/task-04-global-protected-areas.md) — naturewatch-app
  - *Goal:* Store terrestrial protected areas worldwide with calculated `area_km2` of at least 10. Keep existing South Africa ids and cropland facts. Do not copy global geometries into `pilot_place_map`.
- [ ] [task-05-republish-places-pmtiles.md](https://github.com/marynvdl/naturewatch-analysis/blob/develop/docs/tasks/task-05-republish-places-pmtiles.md) — naturewatch-analysis
  - *Goal:* Rebuild that archive from the global places and replace the published object. Record the run cost.

## Done when

The catalog tests still pass. New tests cover the capped list, the extent option, a place opened from the map that is not in the 50, and a type with no rows. Each app task is checked in the browser on a wide screen and a narrow screen. No production deploy. The hosted import and both tile publishes wait for approval. Their cost notes stay in the analysis repo.
