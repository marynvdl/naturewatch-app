# Task 08 — Place cropland facts

Parcel: [Cropland 2024 global](../parcels/cropland-2024-global.md)

Repository: naturewatch-app. Start only after task 06 has written the facts and task 07 has merged.

## Goal

Show sprout `cropland-2024-v2` on the place profile, the popup, and the list.

## Facts already stored

Task 06 writes `facts` rows for sprout `cropland-2024-v2` and method `area-weighted-spheroid-v1`. Version 1 rows stay on sprout `cropland-2024-v1`.

`CROPLAND_SPROUT_ID` in `frontend/naturewatch/src/places/display.ts` is `cropland-2024-v1`. The place fetch in `frontend/naturewatch/src/places/api.ts` filters on that constant. `protected_area_matched` and `protected_area_filter_stats` in `supabase/migrations/20261030100000_protected_areas.sql` join `facts` on sprout `cropland-2024-v1`. Those functions feed the list, the sort, and the filter charts.

The places PMTiles archive still copies percent from sprout `cropland-2024-v1`. The boundary filter uses that copied field. Republishing the archive is left for later.

## Do this

- Point `CROPLAND_SPROUT_ID` at `cropland-2024-v2`.
- Add a new migration that replaces `protected_area_matched` and `protected_area_filter_stats` so the cropland join reads sprout `cropland-2024-v2`. Leave the earlier migration files as history.
- Update the records fixture and the tests that insert or expect sprout `cropland-2024-v1` for the live read. Keep a version 1 row in the fixture so a stored South Africa fact is still present, and assert the live read uses version 2.
- Keep the display rules. Square kilometres to two decimal places, percent to one. A place with no version 2 fact still says that it is not stored. Place size stays `protected_areas.area_km2`.
- Update `docs/blueprint.md` and `docs/user/data.md` where they say the shown cropland figures are the South Africa sprout.
- Before applying the migration to the hosted database, wait for approval. The pull request can merge the file and record the apply command.
- Check in the browser: a place whose version 2 fact is stored, and a place with no version 2 fact. Wide screen and narrow screen.

## Do not

- Do not delete version 1 fact rows.
- Do not republish the places PMTiles archive.
- Do not grant `places.geom`.
- Do not edit `supabase/migrations/20261030100000_protected_areas.sql` in place.
- Do not open a pull request from `develop` into `main`.

## Done when

- The profile, the popup, and the list read sprout `cropland-2024-v2`.
- A place with a version 2 fact shows square kilometres and percent. A place without one says the fact is not stored.
- The list sort and the filter charts use the version 2 figure. A place with no version 2 fact passes the cropland filter only while that range is 0–100%.
- The catalog tests still pass. Tests cover a place with a version 2 fact and a place without one.
- The hosted migration is applied, or the pull request records the apply command and stops before that apply.
- The work is checked in the browser on a wide screen and a narrow screen.
- The work is on a branch from `develop`, in one pull request into `develop`. Report the pull request address. Do not merge it.

## How to work

Branch from `develop`. Do this task only. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
