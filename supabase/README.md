# Records

`sources`, `source_releases`, `licences`, `place_categories`, `place_types`, `places`, `place_boundaries`, `conservation_area_details`, `place_source_ids`, and `facts` are the Sooty Earth place store. A place is one WDPCA parcel. `place_boundaries` holds its boundary versions, and one at most is current. `places.geom` and `place_boundaries.geom` are not granted to `anon` or `authenticated`. `places.geom`, `places.area_km2`, and the bbox columns on `places` stay until Database Honing task 08, because the analysis scripts still read them. The reads below use the current boundary. The FastAPI service does not read these tables.

The map draws protected-area boundaries from the published PMTiles archive. The app has no polygon download.

The October 2026 WDPCA release is pinned in `supabase/migrations/20261021120000_records.sql` and `supabase/migrations/20261029200000_global_protected_areas.sql`: release date `2026-10-01`, the global public zip, and the SHA-256 checksum of that zip. Since `20261111100000_sources.sql` it is the `source_releases` row with `source_id` `wdpca` and `version_label` `October 2026`, and it carries the citation. `import_wdpa.py` carries the same source, version label, URL, and checksum. It downloads that URL and stops if the file is missing or the checksum differs. It does not use a local geodatabase as the source. The download stays in a work directory and is not committed. The CloudFront `/current/` file is the South Africa extract. The global October file is the object named in the pin.

`site_id` in `protected_areas` is the Protected Planet id (`https://www.protectedplanet.net/<site_id>`). It is stored as `conservation_area_details.source_record_id`. A place is matched to the source through `place_source_ids`: one confirmed `wdpa_site_pid` row per parcel, and one `wdpa_site_id` row per site, pointing at the place with the largest parcel. That row is `proposed` for a site with several parcels until a person decides whether to merge them (task 05a).

The generic reads take a place type (`20261116100000_generic_place_reads.sql`, task 05b). `place_summaries` is every published place with its current boundary's area and box, the boundary's source, and its conservation area details. `listed_places` is what the list and the map show: `place_summaries`, with a conservation area only when it is terrestrial and at least 10 km². `place_crops_percent` is the only place the crops sprout and method are written. The functions `place_window`, `place_window_count`, `place_rank`, `place_kept_ids`, `place_filter_stats`, `place_matched`, and `places_in_extent` read them, and `place_bounds` returns the box of any published place. The old names, `protected_areas` and the `protected_area*` functions, are wrappers over them for `conservation_area` until the frontend moves in task 08. The places page and the Places list on the map read those wrappers. None of these reads return geometry. `records_fixture.sql` checks that each wrapper returns what the read path before task 05b returned (`supabase/tests/reads_before_05b.sql`). The hosted migration ran on 11 November 2026. As `anon`, the first 50 ids for the size, name, cropland, search, and extent cases, the filter stats, and a place's rank were the same before and after. The default list read took about 0.5 s and the filter stats about 0.47 s, as before.

Every table here has row-level security on. `anon` and `authenticated` can select rows and cannot insert, update, or delete. They see only `published` places, the details and source ids of published places, and the current boundary of a published place, without its geometry. `service_role` keeps select, insert, update, and delete on every table here. `places.geom` stays ungranted.

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

## Boundaries

`backfill_boundaries.py` copied each site's geometry from `places.geom` into `place_boundaries` (Database Honing task 05). Apply `20261113100000_place_boundaries.sql` first. `run` calls `backfill_place_boundaries()` in committed batches of 500 sites and builds the GiST index. It continues after the last committed batch when started again. It stops on an invalid geometry and names the place, without repairing it. `verify` only reads. Apply `20261113110000_boundaries_readers.sql` after `verify` passes: it merges the parcels of each site with `merge_wdpa_site_parcels()` and moves the reads to the current boundary. `20261114100000_unmerge_wdpa_parcels.sql` undoes that merge with `unmerge_wdpa_site_parcels()` (task 05a). Each parcel gets its own current boundary, and the site unions stay as superseded versions. After it, `verify` no longer passes, because it checks the state task 05 left, and `merge_wdpa_site_parcels()` refuses to run. The hosted migration ran on 11 November 2026 on Micro compute, in 16 seconds. The database grew from 6,990 MB to 6,996 MB: 186 boundaries, 51,001 current, and 74 `proposed` site rows.

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  .venv/bin/python supabase/backfill_boundaries.py run
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  .venv/bin/python supabase/backfill_boundaries.py verify
```

With `SUPABASE_ACCESS_TOKEN` set instead of `DATABASE_URL`, it connects to the hosted database with a short-lived login role, as the import does.

The hosted backfill ran on 10 November 2026, on Micro compute (1 GB of memory) with a 16 GB disk. The switch to Large did not take effect, and Micro was enough. It called `backfill_place_boundaries()` through `supabase db query --linked`, one committed batch of 500 sites per call, then ran the `verify` queries the same way. 50,889 boundaries took 15 minutes (the slowest batch 26 s), and the GiST index 41 s. The database grew from 3,541 MB to 6,989 MB, of which `place_boundaries` is 3,447 MB. For 3 sites whose two parcels share an edge, the union is larger than the sum of the parcels by 11 to 27 m², about 3 × 10⁻⁹ of the area, from the vertices the union adds where edges meet. `verify` allows 10⁻⁶. The first list reads afterwards were slow while `places` came back into the cache, and one search hit the anon time limit once.

## Import

The script needs Python with the GDAL bindings (`osgeo`), `psycopg`, `shapely`, and `pyproj`.

```bash
python3 -m venv --system-site-packages .venv
.venv/bin/pip install -r supabase/requirements.txt
```

Follow this procedure for this release and for the next places import. It has five steps. Only `upload` changes the database.

1. `build` downloads the pinned zip, checks its checksum, and reads the geodatabase. It keeps terrestrial polygons whose area can reach 10 km², checks each one is valid, and writes `filtered.tsv.gz` and `manifest.json` to the work directory. It then removes the extracted geodatabase to free space. It makes no database connection. The manifest records the counts and a checksum of the file. Review those counts before anything is uploaded.
2. `probe` times a connection to the database for two minutes and tests one small `COPY`. Nothing stays in the database. Run it before a long upload, and run it alone to test a connection.
3. `reconcile` only reads. It copies the file in the same batches into temp tables and matches each record to a stored place on its SITE_PID, as record 4 of [decisions.md](../docs/database/decisions.md) says. Each record gets one class:
   - `unchanged`: a known SITE_PID whose current boundary is byte-identical.
   - `reshaped`: a known SITE_PID whose shape changed, with an intersection over union on the spheroid of at least 0.95 (`RESHAPED_MIN_IOU` in the script).
   - `very_different`: a known SITE_PID whose shape changed more than that.
   - `new_in_known_site`: an unknown SITE_PID whose SITE_ID is stored.
   - `new`: an unknown SITE_PID and SITE_ID.
   - `missing`: a stored SITE_PID that the file does not have, or that is now under 10 km². When `new` records overlap its current boundary, their SITE_PIDs are listed as split or join candidates.

   A record can also carry flags: `site_id_changed`, `merged_place` (its place holds several SITE_PIDs), `no_current_boundary`, `under_10_km2`, or `compare_failed` (PostGIS could not compare the shapes). An unknown SITE_PID under 10 km² is left out, as `upload` leaves it out. Only the geometries of new records are kept, for the split and join check. The report is `reconciliation.csv` (one row per record: SITE_PID, SITE_ID, class, place id, intersection over union, flags, candidates) and `reconciliation.json` (the counts, the release, the file checksum, and whether it is clean) in the work directory.
4. `upload` runs `reconcile` first. It writes nothing unless every record is `unchanged` or `reshaped` and none has a flag. The writes for the other classes (draft places, `proposed` boundaries and mappings) are not built yet. Then it copies the file in committed batches of 50 rows or 4 MB. For each record it updates the place's name, its `conservation_area_details`, and `last_seen_release_id` on its `wdpa_site_pid` row. A `reshaped` record gets the next boundary version in `place_boundaries`, `approved` and current, with the release, its SITE_PID, and the Protected Planet page. The old version is superseded in the same transaction. After the last batch, each site's `wdpa_site_id` row, `confirmed` or `proposed`, gets `last_seen_release_id`. It never adds one. It never inserts or deletes a place, and it never writes `places.geom`, which stays as it was until task 08 drops it. It stops if the file no longer matches its manifest. A dropped connection reconnects and continues, and the retry count resets whenever a batch committed. A second start skips the records already marked as seen for the release. If an older `places_load` exists, `upload` refuses to start. Its rows have the `places` columns from before task 04.
5. `merge` only reads. It compares the stored parcels with the file and prints the counts, the site count, any invalid current boundary, and the facts count. It also fails if a site has no `wdpa_site_id` row. It fails if a stored place is not in the file, is under 10 km², or is invalid, or if fewer places are stored than the file has with `GIS_AREA >= 10`.

`run`, the default, does `build`, a 30 second `probe`, and `upload`. Run `reconcile` on its own to see the report without writing. Run `merge` afterwards.

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

Check the checksum refusal, the area filter, and the reconciliation locally, without a download of the real file. `test_reconcile_local.py` needs the local database after `supabase db reset`, with no places. It runs in one transaction and rolls back. It is skipped when the database is not running.

```bash
.venv/bin/python -m unittest supabase/tests/test_import_wdpa.py supabase/tests/test_reconcile_local.py
```

## Hosted import

The global October 2026 load was run on 31 October 2026. It stored 51,001 places (`protected_areas`: 51,001, South Africa 941 with their 941 cropland facts) and the database grew from 0.8 GB to 3.5 GB. 25 polygons were measured under 10 km² and left out. The database was on Nano (0.5 GB of memory) when the load began. It crashed into recovery under the geometry inserts and the connection dropped repeatedly. A temporary move to Large (8 GB, about $0.15 an hour) finished the load, then it went back down. Before the next global load, check the compute size. Use Large or bigger for the load and keep the disk free for the new rows.

Do not run this against the hosted database until the row count, the database size, and the compute size are accepted.

The October 2026 global zip is 2,051,430,236 bytes. Reading that zip, without storing it, counts 490,511 terrestrial polygons in `WDPA_WDOECM_poly_Oct2026`. 51,001 of those have `GIS_AREA` of at least 10. The point layer and the source table are not stored. The stored count is the calculated `area_km2 >= 10` line, which can differ. Record `select count(*) from protected_areas` and `pg_size_pretty(pg_database_size(current_database()))` after the check passes.

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
