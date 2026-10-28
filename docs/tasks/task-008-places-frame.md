# Task 008 — Places frame

Parcel: [Budding Places](../parcels/budding-places.md)

Repository: naturewatch-app. Start from `develop`. Do not start the unchecked tasks in the Sooty Earth interface parcel.

## Goal

Add the results column, below the three place-type controls, and search. Protected Areas lists the stored places. The other two types say that none are stored. The detail column is empty until a place is chosen. Filtering the list does not download boundaries again.

## Facts already stored

`public.pilot_places` returns terrestrial protected areas in South Africa of at least 10 km². It exposes `id`, `name`, `place_type`, and `area_km2`. There are no stored ecoregions or countries.

`loadPlaceMap` in `frontend/naturewatch/src/places/api.ts` downloads every boundary. That wait stays. Places Tiles replaces it. This task must not call it again when the search or the place type changes.

The places panel already has the search field and the three type controls in `PlacesBarComponent.vue`. Ecoregions and Countries are disabled. The search field does not filter a list yet.

## Do this

- Put the results below the Protected Areas, Ecoregions, and Countries controls. Keep the search in that column.
- Protected Areas lists the stored places by name. Ecoregions and Countries can be selected, and each says that none are stored. Do not invent rows.
- Search matches the place name. An empty search shows every place of the selected type.
- Keep the current loading, empty, error, and “not configured” states.
- Leave room for the profile beside the list. Leave that column empty. Task 009 opens it.
- Update `docs/blueprint.md` only where a sentence about what the places panel reads would now be false.

## Do not

- Do not add a database migration.
- Do not change how boundaries are loaded or drawn.
- Do not build the profile, the gallery, or a popup.
- Do not copy names or polygons from `docs/parcels/budding-places.html`.
- Do not start task 009.

## Done when

- The three place types can be selected. Only Protected Areas has rows, and those rows are the stored places.
- Search narrows that list, and an empty search restores it, without a second boundary download.
- The catalog tests still pass. New tests cover the name search and the empty types.
- The list has been used in the browser on a wide screen and a narrow screen, including an empty search and a missing place-store setting.
- The work is on a branch from `develop`, in one pull request into `develop`. Report the pull request address. Do not merge it.

## How to work

Branch from `develop`. Do this task only. No cloud processing and no production deploy. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
