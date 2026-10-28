# Records

`sources`, `places`, and `facts` are the Sooty Earth place store. `places.geom` is not granted to `anon` or `authenticated`. The FastAPI service does not read these tables.

The map draws `pilot_place_map`, the stored boundary for the pilot places. The app has no polygon download.

The October 2026 WDPCA row is pinned in the migration: release month `2026-10-01`, the CloudFront download URL, and the SHA-256 checksum of that zip. `import_wdpa.py` downloads that URL and stops if the file is missing or the checksum differs. It does not use a local geodatabase as the source. The download stays in a temporary directory and is not committed.

`site_id` is the Protected Planet id (`https://www.protectedplanet.net/<site_id>`).

The places page reads `pilot_places` and `facts` in the browser with the anon key. It does not read `places.geom`. The map reads `pilot_place_map`, which returns that stored boundary.

`places`, `sources`, `facts`, and `fact_methods` have row-level security on. `anon` and `authenticated` can select rows and cannot insert, update, or delete. `service_role` keeps select, insert, update, and delete.

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

It prints the count of terrestrial South Africa polygons with `GIS_AREA >= 10`, then the count stored with calculated `area_km2 >= 10`. Only the second set is stored. A second run replaces that October 2026 source in place.

```sql
select * from pilot_places;
```

A hosted import is the same script with `DATABASE_URL` set in the environment. Do not commit that URL, the database password, or the service-role key. Do not put the service-role key in the frontend.
