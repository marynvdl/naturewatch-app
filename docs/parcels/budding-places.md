# Parcel: Budding Places

The first of three places parcels. Molding Places is the admin editor. Places Tiles is the global map. This parcel is the public browsing experience. It uses the places and facts already stored. It does not add a tile pipeline.

## Goal

A person can browse places on the map, search and filter them, and open a profile. The profile shows a photograph when one is approved, general information, disturbances, and species.

The place types are Protected Areas, Ecoregions, and Countries. The stored places are terrestrial protected areas in South Africa of at least 10 km². Ecoregions and Countries have no stored rows, so those lists say so. Do not invent places, descriptions, photographs, or measurements.

## Look

The map stays the main surface. On a wide screen the results sit on the left, the open place sits beside the results, and the map fills the rest. The list stays visible while a place is open. On a narrow screen the panels shrink over the map, and the map remains.

The active place type uses the same near-black selected style as the other controls. The place name is a serif title. The area is a prominent tag in square kilometres, at the two decimal places already used for display. Do not show hectares.

The refined mock-up at [budding-places.html](budding-places.html) is the interaction reference. Its polygons, names, and photographs are examples. Do not copy them into the app. Keep Mapbox. Do not switch the map to the library used in the mock-up.

## Left for later

- Molding Places: signing in, edit mode, curated text, overlap review, which places are drawn, and approving photographs. This parcel does not write to Supabase.
- Places Tiles: a larger protected-area set, PMTiles, and a faster way to draw boundaries. This parcel leaves boundary loading as it is.
- Species records, and disturbance measurements other than the cropland fact already stored.
- A production release. Merge into `develop` only.

## Tasks

Do one task at a time. Start a task only after the one above it has merged. Each task is one branch and one pull request into `develop`.

### naturewatch-app

- [ ] [task-008-places-frame.md](../tasks/task-008-places-frame.md)
  - *Goal:* Add the results column, below the three place-type controls, and search. Protected Areas lists the stored places. The other two types say that none are stored. The detail column is empty until a place is chosen. Filtering the list does not download boundaries again.
- [ ] [task-009-place-selection.md](../tasks/task-009-place-selection.md)
  - *Goal:* Choosing a result and clicking a boundary select the same place and open its profile beside the list. Move the map to the place only when it is outside the current view. Keep a zoom-to-place control. Closing the profile leaves the map, the search, and the place type as they are. When a place is clicked in the map while the list view wasn't opened, keep the list view closed, and just show the profile to the left.
- [ ] [task-010-place-profile.md](../tasks/task-010-place-profile.md)
  - *Goal:* Overview, Disturbances, and Species. Overview shows the stored name, designation, country, area, and source. Disturbances shows the stored cropland fact, or that it is not stored. Species says that no species records are stored, and does not say the place has none.
- [ ] [task-011-place-photographs.md](../tasks/task-011-place-photographs.md)
  - *Goal:* Show one approved photograph, and open the rest in a gallery with the photographer, the source, and the licence. Arrows and Escape move through the gallery and close it. No approved photographs are stored, so the profile shows that.

## Done when

The catalog tests still pass. New tests cover search, place-type filtering, selection, and the profile text for a place with a cropland fact, a place without one, and a type with no rows. Each task is checked in the browser on a wide screen and a narrow screen, including an empty search and a missing place-store setting. No cloud processing and no production deploy.
