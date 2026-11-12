# Records

`sources`, `source_releases`, `licences`, `place_categories`, `place_types`, `places`, `place_boundaries`, `conservation_area_details`, `recognition_details`, `place_source_ids`, `place_relationship_types`, and `place_relationships` are the Sooty Earth place store, with the stats tables below. A place is one WDPCA parcel. `place_boundaries` holds its boundary versions, and one at most is current. `place_boundaries.geom` is not granted to `anon` or `authenticated`. `places` holds no geometry: Database Honing task 08 (`20261119100000_drop_old_reads.sql`) dropped `places.geom`, `places.area_km2`, the bbox columns on `places`, and their trigger and index. The reads below use the current boundary. The hosted migration ran on 12 November 2026, after the frontend that reads the generic functions had deployed, in about 5 seconds. `vacuum full public.places` then ran as `postgres` with `supabase db query --linked`, in about 3 seconds. The Supabase MCP connects as a read-only user, and a `vacuum` run there is skipped without an error. `places` went from 3,479 MB to 8.3 MB and the database from 7,000 MB to 3,529 MB. Afterwards there were 50,937 listed conservation areas, 2,823 rows in `place_stats_preferred`, and the same 941 cropland ids and percents, in the same order, as before. The disk stays at 16 GB on purpose: Supabase shrinks a disk only during a Postgres version upgrade, the extra 8 GB costs about $1 a month, and the coming places, boundary versions, and stats will use it. The FastAPI service does not read these tables.

The map draws protected-area boundaries from the published PMTiles archive. The app has no polygon download.

The October 2026 WDPCA release is pinned in `supabase/migrations/20261021120000_records.sql` and `supabase/migrations/20261029200000_global_protected_areas.sql`: release date `2026-10-01`, the global public zip, and the SHA-256 checksum of that zip. Since `20261111100000_sources.sql` it is the `source_releases` row with `source_id` `wdpca` and `version_label` `October 2026`, and it carries the citation. `import_wdpa.py` carries the same source, version label, URL, and checksum. It downloads that URL and stops if the file is missing or the checksum differs. It does not use a local geodatabase as the source. The download stays in a work directory and is not committed. The CloudFront `/current/` file is the South Africa extract. The global October file is the object named in the pin.

`site_id` in `place_summaries` is the Protected Planet id (`https://www.protectedplanet.net/<site_id>`). It is stored as `conservation_area_details.source_record_id`. A place is matched to the source through `place_source_ids`: one confirmed `wdpa_site_pid` row per parcel, and one `wdpa_site_id` row per site, pointing at the place with the largest parcel. That row was `proposed` for a site with several parcels until a person decided whether to merge them (task 05a). Task 06 confirmed all 74: 39 kept apart and 35 merged. A merged site's SITE_PIDs all point at the kept place, whose current boundary is the union of its parcels. The hosted migrations ran on 11 November 2026 in 13 seconds. Afterwards no site row was `proposed`, 64 places were `merged`, 50,937 were published with one current boundary each, and the 35 unions were valid. In the default list only Gobiin ikh, now one place of 63,885 km², entered the first 50.

The generic reads take a place type (`20261116100000_generic_place_reads.sql`, task 05b). `place_summaries` is every published place with its current boundary's area and box, the boundary's source, and its conservation area details. `listed_places` is what the list and the map show: `place_summaries`, with a conservation area only when it is terrestrial and at least 10 km². `place_crops_percent` reads the cropland percent from `place_stats_preferred`. The functions `place_window`, `place_window_count`, `place_rank`, `place_kept_ids`, `place_filter_stats`, `place_matched`, and `places_in_extent` read them, and `place_bounds` returns the box of any published place. The places page and the Places list on the map read them for `conservation_area`, and a place profile reads `place_summaries` and `place_stats_preferred`. None of these reads return geometry. Until task 08 the old names, `protected_areas` and the `protected_area*` functions, were wrappers over them, checked against the read path before task 05b. Task 08 dropped them. The hosted migration ran on 11 November 2026. As `anon`, the first 50 ids for the size, name, cropland, search, and extent cases, the filter stats, and a place's rank were the same before and after. The default list read took about 0.5 s and the filter stats about 0.47 s, as before.

Every table here has row-level security on. `anon` and `authenticated` can select rows and cannot insert, update, or delete. They see only `published` places, the details and source ids of published places, and the current boundary of a published place, without its geometry. `service_role` keeps select, insert, update, and delete on every table here, except `place_stats`.

`stat_methods` (`fact_methods` until task 07) names a formula. A sprout id is the sprout id from the recipe, which is also the STAC collection id. Since task 07 (`20261118100000_stats.sql`, `20261118110000_stats_backfill.sql`) the cropland numbers are `place_stats` rows: `crops_area`, `crops_percent`, and `valid_coverage` for each of the 941 South Africa places, from one `stat_runs` row for the 22 October 2026 Batch job, on each place's version 1 boundary. They were copied from the `facts` table, which task 08 dropped after checking every value was stored. `place_stats` is append-only: `service_role` can select and insert, not update or delete. `stat_selections` chooses `cropland-2024-v1` and `area-weighted-spheroid-v1` for 2024, and `place_stats_preferred` applies the choice to each current boundary. The hosted migrations ran on 11 November 2026 in about 7 seconds, and the database went from 6,999 MB to 7,000 MB. After them there were 2,823 `place_stats` rows, all on a current version 1 boundary, and one `succeeded` run. `place_stats_preferred` returned 2,823 rows. The 941 cropland percents in `place_crops_percent` were identical to those before the migrations: same count, same hash of every id and value. Reading `place_crops_percent` took 12 ms. The stored area, percent, and valid coverage are full precision. Square kilometres are shown to two decimal places, percent to one, and valid coverage to three.

## Recognitions

Since Database Honing task 09 (`20261120100000_recognitions.sql`, `20261120110000_recognition_places.sql`) a place is a conservation area or a recognition. The recognition types are `world_heritage_site`, `ramsar_site`, `biosphere_reserve`, `natura_2000_site`, `emerald_site`, and `other_recognition`, in category `recognition`. Which designations are recognitions is record 21 of [decisions.md](../docs/database/decisions.md), written once in `recognition_type_for_designation()`. `move_recognition_places()` gave those places their type, moved their details to `recognition_details`, and kept their ids, boundaries, source ids, and stats. A rerun moves nothing. `place_summaries` reads either details table.

`place_relationships` holds typed links between places. `anon` and `authenticated` see only `confirmed`, unretired links between published places. `place_overlaps(place_id)` returns the published places whose current boundary overlaps a place's, with the shared km² and both coverages. Only `service_role` can run it. Nothing it returns is stored, except what `derive_recognises.py` writes:

```bash
WDPA_WORK_DIR=/tmp/wdpa-work DATABASE_URL=... .venv/bin/python supabase/derive_recognises.py derive
WDPA_WORK_DIR=/tmp/wdpa-work DATABASE_URL=... .venv/bin/python supabase/derive_recognises.py compute
WDPA_WORK_DIR=/tmp/wdpa-work DATABASE_URL=... .venv/bin/python supabase/derive_recognises.py load
DATABASE_URL=... .venv/bin/python supabase/derive_recognises.py counts
DATABASE_URL=... .venv/bin/python supabase/derive_recognises.py confirm 0.5
```

`derive` inserts a `derived`, `proposed` `recognises` row from each published recognition to each published conservation area it overlaps, when the shared area is at least 1% of either place. It commits every 25 recognitions and keeps a progress file in the work directory, so a second start continues. `counts` prints, per recognition type, how many links cover at least 25%, 50%, 75%, and 90% of the park. `confirm` sets `confirmed` on derived links at or above the share given, and changes nothing else.

`derive` runs `place_overlaps()` in the database. On Micro compute it ran the hosted database out of memory, and Postgres restarted, on a Natura 2000 site of 862,145 vertices whose box overlaps 53 parks (12 November 2026). For the hosted database use `compute` and `load`. `compute` only reads the database: the published places, their current boundary ids, and their SITE_PIDs. It takes each place's shape from the filtered file of the import (a merged place is the union of its parcels), projects it to EPSG:6933, which is equal area, and writes the same links to `derive_recognises_links.tsv` in the work directory, one recognition at a time. A second start continues. It also writes a 3.5 GB shapes file there, which can be deleted after the run. `load` inserts the file in one transaction, and skips a link whose boundary is no longer current or whose pair already has an active row. Coverages from `compute` can differ from `place_overlaps()` by a fraction of a percent.

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

Database Honing task 05 copied each site's geometry from `places.geom` into `place_boundaries` in committed batches, with a runner script and `backfill_place_boundaries()`, then merged each site's parcels with `merge_wdpa_site_parcels()`. Task 05a undid the merge with `unmerge_wdpa_site_parcels()`: each parcel has its own current boundary, and the site unions stay as superseded versions. The hosted migration ran on 11 November 2026 on Micro compute, in 16 seconds. The database grew from 6,990 MB to 6,996 MB: 186 boundaries, 51,001 current, and 74 `proposed` site rows. Task 08 removed the runner and the three functions with `places.geom`.

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

   A record can also carry flags: `site_id_changed`, `merged_place` (its place holds several SITE_PIDs: each parcel is compared with the merged union, so it is `very_different` and `upload` stops; the comparison with the union of the parcels comes with the next import), `no_current_boundary`, `under_10_km2`, or `compare_failed` (PostGIS could not compare the shapes). An unknown SITE_PID under 10 km² is left out, as `upload` leaves it out. Only the geometries of new records are kept, for the split and join check. The report is `reconciliation.csv` (one row per record: SITE_PID, SITE_ID, class, place id, intersection over union, flags, candidates) and `reconciliation.json` (the counts, the release, the file checksum, and whether it is clean) in the work directory.
4. `upload` runs `reconcile` first. It writes nothing unless every record is `unchanged` or `reshaped` and none has a flag. The writes for the other classes (draft places, `proposed` boundaries and mappings) are not built yet. Then it copies the file in committed batches of 50 rows or 4 MB. For each record it updates the place's name, its `conservation_area_details`, and `last_seen_release_id` on its `wdpa_site_pid` row. A `reshaped` record gets the next boundary version in `place_boundaries`, `approved` and current, with the release, its SITE_PID, and the Protected Planet page. The old version is superseded in the same transaction. After the last batch, each site's `wdpa_site_id` row, `confirmed` or `proposed`, gets `last_seen_release_id`. It never adds one. It never inserts or deletes a place. It stops if the file no longer matches its manifest. A dropped connection reconnects and continues, and the retry count resets whenever a batch committed. A second start skips the records already marked as seen for the release. If an older `places_load` exists, `upload` refuses to start. Its rows have the `places` columns from before task 04.
5. `merge` only reads. It compares the stored parcels with the file and prints the counts, the site count, any invalid current boundary, and the `place_stats` count. It also fails if a site has no `wdpa_site_id` row. It fails if a stored place is not in the file, is under 10 km², or is invalid, or if fewer places are stored than the file has with `GIS_AREA >= 10`.

`attributes` builds the filtered file if needed, then sets `designation_type` (WDPCA `DESIG_TYPE`) on both details tables, and `criteria` (`INT_CRIT`) on `recognition_details`, for places already stored. A merged place takes the values of its lowest SITE_PID. It writes nothing else, commits every 5,000 records, and reports the rows it changed and the stored places the file does not have. Since task 09 the filtered file has the columns `designation_type` and `criteria`, and the manifest lists its columns. A file built before then is built again. `upload` also writes `designation_type`, and updates `recognition_details` for a recognition.

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
select count(*) from listed_places where place_type_id = 'conservation_area';
```

Check the checksum refusal, the area filter, and the reconciliation locally, without a download of the real file. `test_reconcile_local.py` needs the local database after `supabase db reset`, with no places. It runs in one transaction and rolls back. It is skipped when the database is not running.

```bash
.venv/bin/python -m unittest supabase/tests/test_import_wdpa.py supabase/tests/test_reconcile_local.py \
  supabase/tests/test_derive_recognises_local.py
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
