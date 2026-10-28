# Task 010 — Place profile

Parcel: [Budding Places](../parcels/budding-places.md)

Repository: naturewatch-app. Start only after task 009 has merged.

## Goal

Overview, Disturbances, and Species. Overview shows the stored name, designation, country, area, and source. Disturbances shows the stored cropland fact, or that it is not stored. Species says that no species records are stored, and does not say the place has none.

## Facts already stored

The place size is `pilot_places.area_km2`. Cropland is `facts.area_km2` and `facts.percent` for sprout `cropland-2024-v1` and method `area-weighted-spheroid-v1`. Those are different numbers.

Shown square kilometres use two decimal places. Do not show hectares. The source line is the WDPCA release already returned with the place. There is no stored description and no species table.

## Do this

- Add the three tabs to the profile column opened in task 009: Overview, Disturbances, and Species.
- Overview shows the stored name as a serif title, the designation, the country, the area in a prominent tag, and the source. Do not write a description.
- Disturbances shows the stored cropland square kilometres and percent. When that fact is missing, say that it is not stored. Do not invent figures for built-up area or tree loss.
- Species says that no species records are stored. Do not say the place has no species.
- Keep the text as text, not as HTML assembled from the database.
- The photograph area stays the empty state from the parcel. Task 011 builds the gallery.

## Do not

- Do not add a database migration.
- Do not invent places, descriptions, photographs, or measurements.
- Do not download the boundary again to fill the profile.
- Do not start task 011.

## Done when

- A place with a cropland fact shows that fact under Disturbances. A place without one says the fact is not stored.
- Species does not claim that a place has no species.
- The area tag is square kilometres at two decimal places.
- New tests cover those three texts. The catalog tests still pass.
- The profile has been read in the browser on a wide screen and a narrow screen.
- The work is on a branch from `develop`, in one pull request into `develop`. Report the pull request address. Do not merge it.

## How to work

Branch from `develop`. Do this task only. No cloud processing and no production deploy. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
