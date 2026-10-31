# Task 04 — Global protected areas

Parcel: [Places Tiles](../parcels/places-tiles.md)

Repository: naturewatch-app. Start only after task 03 has merged.

## Goal

Store terrestrial protected areas worldwide with calculated `area_km2` of at least 10. Keep existing South Africa ids and cropland facts. Do not copy global geometries into `pilot_place_map`.

## Facts already stored

The pinned October 2026 source in `supabase/migrations/20261021120000_records.sql` and `supabase/import_wdpa.py` is the South Africa zip. `pilot_places` and `pilot_place_map` both filter `iso3 = 'ZAF'`. The map no longer reads `pilot_place_map`. The list reads a bounded query. Cropland facts exist for the South Africa places already stored.

## Do this

- Point that October 2026 WDPCA source at the global public zip. Pin the URL and SHA-256 checksum the same way as the South Africa extract. Update the migration constants and `import_wdpa.py` together.
- Store terrestrial polygons with calculated `area_km2` of at least 10. Drop the `iso3 = 'ZAF'` read filter. Keep `REALM = Terrestrial`.
- Upsert on `(source_release_id, source_id)` so existing South Africa ids and cropland facts remain.
- Drop `iso3 = 'ZAF'` from `pilot_places` only. Do not copy global geometries into `pilot_place_map`.
- Stream or batch the import. Do not hold the whole world in memory.
- Extend the country-name map so a single ISO 3166 alpha-3 code shows an English name. Leave transboundary strings as stored.
- Filter charts must not download every global attribute row. Keep using database counts.
- Before any hosted load, record the row count and database size and wait for approval.
- Update `docs/blueprint.md`, `docs/user/data.md`, `docs/user/using-the-map.md`, and `supabase/README.md` where they say the stored places are South Africa only.

## Do not

- Do not calculate cropland facts for the new places.
- Do not grant `places.geom` to `anon` or `authenticated`.
- Do not offer a polygon download.
- Do not publish tiles. Task 05 does that.
- Do not start task 05 until the hosted load is approved and finished.

## Done when

- `pilot_places` returns terrestrial protected areas worldwide of at least 10 km².
- Existing South Africa places kept their ids and cropland facts.
- The map still draws from PMTiles, not from `pilot_place_map`.
- The list still shows at most 50, and filter charts still use database counts.
- Tests cover a non-South-Africa place in the list, a South Africa place that still has a cropland fact, and a checksum mismatch that refuses the import. The catalog tests still pass.
- The hosted import has been approved, or this pull request stops before that load and records how to run it.
- The work is on a branch from `develop`, in one pull request into `develop`. Report the pull request address. Do not merge it.

## How to work

Branch from `develop`. Do this task only. Do not start a hosted import or a production deploy until it is approved. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
