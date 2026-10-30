# Records

`sources`, `places`, and `facts` are the Sooty Earth place store. `places.geom` is not granted to `anon` or `authenticated`. The FastAPI service does not read these tables.

The map draws protected-area boundaries from the published PMTiles archive. `pilot_place_map` stays in the database as the South Africa copy. A trigger still copies only those South Africa rows from `places` and `sources`. Places from other countries stay out of that table. The app has no polygon download.

The October 2026 WDPCA row is pinned in `supabase/migrations/20261021120000_records.sql` and `supabase/migrations/20261029200000_global_protected_areas.sql`: release month `2026-10-01`, the global public zip, and the SHA-256 checksum of that zip. `import_wdpa.py` carries the same URL and checksum. It downloads that URL and stops if the file is missing or the checksum differs. It does not use a local geodatabase as the source. The download stays in a temporary directory and is not committed. The CloudFront `/current/` file is the South Africa extract. The global October file is the object named in the pin.

`site_id` is the Protected Planet id (`https://www.protectedplanet.net/<site_id>`).

The places page reads `protected_area_window`, 50 rows at a time, ordered by name. The Places list on the map reads `protected_area_window` (50 matching rows at a time, from an offset) and `protected_area_filter_stats` for the filter charts. Extent filtering uses `protected_areas_in_extent`, which accepts a bounding box and returns attributes only. Those reads return attributes, not `places.geom`. Filter charts use the database counts. The view behind those reads is `protected_areas`.

`places`, `sources`, `facts`, `fact_methods`, and `pilot_place_map` have row-level security on. `anon` and `authenticated` can select rows and cannot insert, update, or delete. `service_role` keeps select, insert, update, and delete on `sources`, `places`, `facts`, and `fact_methods`. On `pilot_place_map` it can select. `places.geom` stays ungranted.

`fact_methods` names the formula for a facts row. `facts.method_id` points at it. `facts.sprout_id` is the sprout id from the recipe, which is also the STAC collection id. The stored area, percent, and valid coverage are full precision. Square kilometres are shown to two decimal places, percent to one, and valid coverage to three.

## Local database

```bash
supabase start
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 \
  -f supabase/tests/records_fixture.sql
```

The fixture rolls back. It expects `places` to be empty, so run it before the import.

## Import

The script needs Python with the GDAL bindings (`osgeo`) and `psycopg`.

```bash
python3 -m venv --system-site-packages .venv
.venv/bin/pip install -r supabase/requirements.txt
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  .venv/bin/python supabase/import_wdpa.py
```

It downloads the pinned zip before it opens a database connection, then streams terrestrial polygons in batches of 200. A polygon whose `GIS_AREA` is under 1 km² and whose outline cannot reach 10 km² is left out of the database batch. Calculated `area_km2` still decides what is stored. The script prints the count of terrestrial polygons, the count with `GIS_AREA >= 10`, then the count stored with calculated `area_km2 >= 10`. Only the last set is stored. Rows are upserted on `(source_release_id, source_id)`, so a place already stored keeps its id and its cropland facts. A second run updates that October 2026 source in place.

```sql
select count(*) from protected_areas;
```

Check the checksum refusal locally, without a download of the real file:

```bash
python3 -m unittest supabase/tests/test_import_wdpa.py
```

## Hosted import

Do not run this against the hosted database until the row count and the database size are accepted.

The October 2026 global zip is 2,051,430,236 bytes. Reading that zip, without storing it, counts 490,511 terrestrial polygons in `WDPA_WDOECM_poly_Oct2026`. 51,001 of those have `GIS_AREA` of at least 10. The point layer and the source table are not stored. The stored count is the calculated `area_km2 >= 10` line, which can differ. Runs from a laptop rolled back when the network dropped, so the hosted store stays the South Africa rows until a remote run commits. Record `select count(*) from protected_areas` and `pg_size_pretty(pg_database_size(current_database()))` after that commit.

Do not run the hosted load from a laptop. The script holds one database session open for hours, and a dropped connection rolls the whole load back. Run it on Fly app `naturewatch-places-import` in London (`lhr`). That app is only this load. Do not deploy it as `naturewatch` or `naturewatch-demo`.

The machine is `performance-2x` with 4 GB of memory, about $0.10 an hour in London. A 12 GB volume named `places_import` is mounted at `/tmp` for the zip and the geodatabase. Destroy the machine, the volume, and the app when the load has committed. A stopped machine and a leftover volume keep billing.

Apply the migrations first. The app secret `SUPABASE_ACCESS_TOKEN` is a Supabase access token. The script uses it only after the zip is on disk, to mint a login role, then `set role postgres`. It also sets `statement_timeout` and `idle_in_transaction_session_timeout` to 0, and turns on TCP keepalives. Do not commit the token, a database URL, or the service-role key. Do not put the service-role key in the frontend.

```bash
fly apps create naturewatch-places-import
fly volumes create places_import \
  --app naturewatch-places-import \
  --region lhr \
  --size 12 \
  --yes
fly secrets set --stage --app naturewatch-places-import \
  SUPABASE_ACCESS_TOKEN="..."
fly deploy supabase \
  --config supabase/hosted-import/fly.toml \
  --dockerfile supabase/hosted-import/Dockerfile \
  --app naturewatch-places-import \
  --ha=false \
  --no-public-ips \
  --remote-only \
  --vm-size performance-2x \
  --vm-memory 4096 \
  --primary-region lhr \
  --yes
fly logs --app naturewatch-places-import
```

If the image push is unauthorized, run the same deploy with `--depot=false`.

Deploy starts the load. Leave that machine running. `fly machine update` stops the process, so do not update the machine during the load. The deploy restart policy is `on-fail`: a finished load stays stopped, and a failed load starts again. After the three counts are printed, destroy the app so it cannot start another run.

The log prints `download started`, then a progress line every 10,000 terrestrial polygons, then `checking geometry validity`, `upsert started`, and the three counts. A failed checksum or a database error rolls the load back.

```bash
fly apps destroy naturewatch-places-import --yes
```

That removes the machine, the volume, and the token. Confirm the hosted counts before destroying the app.
