# Records

`sources`, `places`, and `facts` are the Sooty Earth place store. `places.geom` is not granted to `anon` or `authenticated`. The FastAPI service does not read these tables.

The map draws protected-area boundaries from the published PMTiles archive. `pilot_place_map` stays in the database as the South Africa copy. A trigger still copies only those South Africa rows from `places` and `sources`. Places from other countries stay out of that table. The app has no polygon download.

The October 2026 WDPCA row is pinned in `supabase/migrations/20261021120000_records.sql` and `supabase/migrations/20261029200000_global_protected_areas.sql`: release month `2026-10-01`, the global public zip, and the SHA-256 checksum of that zip. `import_wdpa.py` carries the same URL and checksum. It downloads that URL and stops if the file is missing or the checksum differs. It does not use a local geodatabase as the source. The download stays in a work directory and is not committed. The CloudFront `/current/` file is the South Africa extract. The global October file is the object named in the pin.

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

The script needs Python with the GDAL bindings (`osgeo`), `psycopg`, `shapely`, and `pyproj`.

```bash
python3 -m venv --system-site-packages .venv
.venv/bin/pip install -r supabase/requirements.txt
```

Follow this procedure for this release and for the next places import. It has four steps. Only `upload` changes `places`.

1. `build` downloads the pinned zip, checks its checksum, and reads the geodatabase. It keeps terrestrial polygons whose area can reach 10 km², checks each one is valid, and writes `filtered.tsv.gz` and `manifest.json` to the work directory. It then removes the extracted geodatabase to free space. It makes no database connection. The manifest records the counts and a checksum of the file. Review those counts before anything is uploaded.
2. `probe` times a connection to the database for two minutes and tests one small `COPY`. Nothing stays in the database. Run it before a long upload, and run it alone to test a connection.
3. `upload` copies `filtered.tsv.gz` into `places` in committed batches of 50 rows or 4 MB, on `(source_release_id, source_id)`. It leaves out a polygon whose calculated area is under 10 km². It stops if the file no longer matches its manifest, and refuses to start if a stored place is not in the file. A dropped connection reconnects and continues, and the retry count resets whenever a batch committed. A second start skips the places already stored, so a stored place keeps its id and its cropland facts. It never deletes a place. It writes the geometry once, with no stage table. A stage plus `places` holds the geometry twice, which does not fit a small database disk (8 GB when this was written, with the global load about 3.4 GB). If an older `places_load` exists, `upload` moves its rows into `places` and drops it.
4. `merge` only reads. It compares `places` with the file and prints the counts, any invalid geometry, and the facts count. It fails if a stored place is not in the file, is under 10 km², or is invalid, or if fewer places are stored than the file has with `GIS_AREA >= 10`.

`run`, the default, does `build`, a 30 second `probe`, and `upload`. Run `merge` afterwards. The map shows the places stored so far while `upload` runs.

```bash
export WDPA_WORK_DIR=/tmp/wdpa-work
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  .venv/bin/python supabase/import_wdpa.py run
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  .venv/bin/python supabase/import_wdpa.py merge
```

The script prints the count of terrestrial polygons, the count with `GIS_AREA >= 10`, then the count stored. Calculated `area_km2` from PostGIS decides what is stored. A polygon whose area the script cannot measure is kept and counted as `unmeasured` in the manifest, so a measuring fault cannot drop a place.

```sql
select count(*) from protected_areas;
```

Check the checksum refusal and the area filter locally, without a download of the real file:

```bash
.venv/bin/python -m unittest supabase/tests/test_import_wdpa.py
```

## Hosted import

Do not run this against the hosted database until the row count and the database size are accepted.

The October 2026 global zip is 2,051,430,236 bytes. Reading that zip, without storing it, counts 490,511 terrestrial polygons in `WDPA_WDOECM_poly_Oct2026`. 51,001 of those have `GIS_AREA` of at least 10. The point layer and the source table are not stored. The stored count is the calculated `area_km2 >= 10` line, which can differ. Record `select count(*) from protected_areas` and `pg_size_pretty(pg_database_size(current_database()))` after the merge commits.

Do not run the hosted load from a laptop, and do not hold the load in one transaction. A single long transaction rolls back the whole load when a connection drops. Do not send a bulk load through the Supabase pooler. Filter and validate the file first, then copy it in committed batches. Do not upload a polygon the database will reject. Check the free disk before loading: a stage table and `places` together can fill it.

Run it on Fly app `naturewatch-places-import` in London (`lhr`). That app is only this load. Do not deploy it as `naturewatch` or `naturewatch-demo`. The machine is `performance-2x` with 4 GB of memory, about $0.10 an hour in London. A 12 GB volume named `places_import` is mounted at `/tmp` for the zip, the geodatabase, and the filtered file. The work directory is on that volume, so a stopped machine does not download or filter again. The machine does not restart on its own. Destroy the app and the volume when the load has committed. A stopped machine and a leftover volume keep billing.

Apply the migrations first. The app secret `SUPABASE_ACCESS_TOKEN` is a Supabase access token. The script mints a short-lived login role each time it connects, connects directly to `db.fwfbmvwdbsutmalhszvi.supabase.co`, and runs `set role postgres`. A login or connection timeout is retried with a growing pause. The script sets `statement_timeout` and `idle_in_transaction_session_timeout` to 0 and turns on TCP keepalives. Do not commit the token, a database URL, or the service-role key. Do not put the service-role key in the frontend.

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
  --depot=false \
  --remote-only \
  --vm-size performance-2x \
  --vm-memory 4096 \
  --primary-region lhr \
  --yes
fly logs --app naturewatch-places-import
```

Use absolute paths for `--config` and `--dockerfile` if Fly reports the Dockerfile as not found. A machine that is stopped stays stopped after a deploy, so start it with `fly machine start MACHINE_ID --app naturewatch-places-import`.

Deploy starts `run`: `build`, a 30 second `probe`, then `upload`. To go step by step, deploy with `--env WDPA_STEP=build`, then run `probe`, then `upload`, one at a time. If a volume reports "insufficient resources", destroy it and create a new one. To test only the connection, deploy with `--env WDPA_STEP=probe --env WDPA_PROBE_SECONDS=900`. The log shows ping times. A step that fails stays stopped. Start it again with `fly machine start`. It continues from the files and rows already there.

The log prints, in order:

- `download started` and `geodatabase ready`.
- `terrestrial polygons read` with the number kept, every 10,000 polygons.
- The manifest counts, then `probe pings` and `probe copy`.
- `sent` with the count of the file, every 500 rows, then `stored`.

Before `upload`, check the free disk: `select pg_size_pretty(pg_database_size(current_database()));`. Then run the check on the same machine and volume:

```bash
fly machine list --app naturewatch-places-import
fly machine update MACHINE_ID --env WDPA_STEP=merge --yes \
  --app naturewatch-places-import
fly logs --app naturewatch-places-import
```

The check prints the counts and `check ok`. Then confirm the hosted counts and that a South Africa place still has its cropland fact, then destroy the app. That removes the machine, the volume, and the token.

```bash
fly apps destroy naturewatch-places-import --yes
```
