# Task 01 — Place list window

Parcel: [Places Tiles](../parcels/places-tiles.md)

Repository: naturewatch-app. Start from `develop`.

## Goal

Replace loading every stored place into the list with a bounded query. Default sort is largest first. Cap 50. Keep the other sorts. Add the extent option, off by default. Do not change boundary loading.

## Facts already stored

`public.pilot_places` returns terrestrial protected areas in South Africa of at least 10 km². `loadPilotPlaces` in `frontend/naturewatch/src/places/api.ts` selects every row. `loadPlaceMap` downloads every boundary. That wait stays. Task 03 replaces it. This task must not call it again when the search, the sort, the filters, or the extent option change.

## Do this

- Query the list from Supabase. Return at most 50 rows for the current search, sort, size filter, cropland filter, and optional map extent.
- Default order is largest first. Keep name, smallest first, and both cropland-percent orders. A place without the sorted figure goes last.
- Show the count already used today, for example “50 of N”. N is the number of stored places that match the filters, not the length of the window.
- Card numbers are 1 to the length of this window.
- Search is part of the query. It changes which 50 are shown. It does not change which boundaries are drawn.
- Add a control that limits the list to the current map view. It is off at the start. While it is on, use the same charcoal style as Filter, and refresh the list when the view changes. Extent filtering uses a database function that accepts a bounding box and returns attributes only. `places.geom` stays ungranted.
- Filter charts read counts from the database. Do not download every place to draw them.
- Update `docs/user/using-the-map.md` for the cap, the default sort, and the extent option.

## Do not

- Do not change how boundaries are loaded or drawn.
- Do not drop `iso3 = 'ZAF'` from `pilot_places`. Task 04 does that.
- Do not invent ecoregions, countries, photographs, or measurements.
- Do not start task 02.

## Done when

- Protected Areas shows at most 50 places, largest first, with a total count.
- The other sorts still work. Search and the size and cropland filters still narrow the list.
- The extent option is off until it is turned on, and then the list follows the map view.
- Filter charts still show the stored distribution without a full place download.
- Tests cover the cap, the default sort, a search that changes the window, the extent option on and off, and a type with no rows. The catalog tests still pass.
- The list has been checked in the browser on a wide screen and a narrow screen.
- The work is on a branch from `develop`, in one pull request into `develop`. Report the pull request address. Do not merge it.

## How to work

Branch from `develop`. Do this task only. No cloud processing and no production deploy. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
