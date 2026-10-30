-- Fixture for the records migrations. Rolls back, so places stays empty.
-- Run it after supabase db reset and before supabase/import_wdpa.py.

\set ON_ERROR_STOP on
begin;

do $$
begin
  if (select count(*) from public.places) <> 0 then
    raise exception 'expected places to be empty before the fixture';
  end if;
  if (select count(*) from public.facts) <> 0 then
    raise exception 'expected facts to be empty';
  end if;
  if not exists (
    select 1
    from public.sources
    where name = 'WDPCA'
      and release_month = date '2026-10-01'
      and download_url = 'https://pp-import-production.s3.eu-west-1.amazonaws.com/WDPA_WDOECM_Oct2026_Public.zip'
      and checksum = 'f5f5e50f230923619ad60faf8296e4f39a4d8c1b14bb6ea80e82ea6db6292b1c'
  ) then
    raise exception 'WDPCA October 2026 source row does not match the pin';
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'places'
      and column_name in ('gis_area', 'reported_area_km2', 'value', 'unit')
  ) then
    raise exception 'places stores a column this step does not use';
  end if;
  if (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'facts'
      and column_name in ('area_km2', 'percent', 'valid_coverage', 'method_id', 'sprout_id')
  ) <> 5 then
    raise exception 'facts is missing area_km2, percent, valid_coverage, method_id, or sprout_id';
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'facts'
      and column_name in ('layer', 'layer_version')
  ) then
    raise exception 'facts still has layer or layer_version';
  end if;
  if not exists (
    select 1
    from public.fact_methods
    where id = 'area-weighted-spheroid-v1'
      and summary like '%WGS84%'
      and summary like '%kept in both%'
  ) then
    raise exception 'area-weighted-spheroid-v1 summary is missing';
  end if;
end $$;

insert into public.places (
  source_release_id,
  source_id,
  site_id,
  name,
  place_type,
  designation,
  iucn_category,
  iso3,
  realm,
  geom
)
select
  id,
  'fixture-pilot',
  'fixture-pilot-site',
  'Pilot Park',
  'protected_area',
  'National Park',
  'II',
  'ZAF',
  'Terrestrial',
  extensions.ST_GeomFromText(
    'MULTIPOLYGON(((27 -26, 27.2 -26, 27.2 -25.8, 27 -25.8, 27 -26)))',
    4326
  )::extensions.geometry(MultiPolygon, 4326)
from public.sources
where name = 'WDPCA' and release_month = date '2026-10-01';

insert into public.places (
  source_release_id,
  source_id,
  site_id,
  name,
  place_type,
  designation,
  iucn_category,
  iso3,
  realm,
  geom
)
select
  id,
  'fixture-small',
  'fixture-small-site',
  'Small Park',
  'protected_area',
  'National Park',
  'IV',
  'ZAF',
  'Terrestrial',
  extensions.ST_GeomFromText(
    'MULTIPOLYGON(((27.5 -26, 27.502 -26, 27.502 -25.998, 27.5 -25.998, 27.5 -26)))',
    4326
  )::extensions.geometry(MultiPolygon, 4326)
from public.sources
where name = 'WDPCA' and release_month = date '2026-10-01';

insert into public.places (
  source_release_id,
  source_id,
  site_id,
  name,
  place_type,
  designation,
  iucn_category,
  iso3,
  realm,
  geom
)
select
  id,
  'fixture-abroad',
  'fixture-abroad-site',
  'Chobe Fixture',
  'protected_area',
  'National Park',
  'II',
  'BWA',
  'Terrestrial',
  extensions.ST_GeomFromText(
    'MULTIPOLYGON(((24 -21, 24.2 -21, 24.2 -20.8, 24 -20.8, 24 -21)))',
    4326
  )::extensions.geometry(MultiPolygon, 4326)
from public.sources
where name = 'WDPCA' and release_month = date '2026-10-01';

do $$
declare
  pilot_count int;
  release date;
  pilot_area double precision;
  pilot_expected double precision;
  small_area double precision;
  small_expected double precision;
  generated text;
  expression text;
begin
  select count(*) into pilot_count from public.protected_areas;
  if pilot_count <> 2 then
    raise exception 'protected_areas returned % rows, expected 2', pilot_count;
  end if;
  if not exists (
    select 1 from public.protected_areas where source_id = 'fixture-pilot' and iso3 = 'ZAF'
  ) then
    raise exception 'protected_areas omitted the South Africa place';
  end if;
  if not exists (
    select 1 from public.protected_areas where source_id = 'fixture-abroad' and iso3 = 'BWA'
  ) then
    raise exception 'protected_areas omitted the place outside South Africa';
  end if;

  select release_month, area_km2
    into release, pilot_area
  from public.protected_areas
  where source_id = 'fixture-pilot';

  if release <> date '2026-10-01'
    or extract(year from release)::int <> 2026
    or extract(month from release)::int <> 10 then
    raise exception 'release month is not October 2026: %', release;
  end if;
  if exists (
    select 1 from public.protected_areas where source_name is distinct from 'WDPCA'
  ) then
    raise exception 'protected_areas is not joined to the WDPCA source';
  end if;

  select
    area_km2,
    extensions.ST_Area(geom::extensions.geography, true) / 1e6
  into pilot_area, pilot_expected
  from public.places
  where source_id = 'fixture-pilot';

  if pilot_area is distinct from pilot_expected then
    raise exception 'pilot area_km2 % does not match the geography calculation %',
      pilot_area, pilot_expected;
  end if;
  if pilot_area < 10 then
    raise exception 'pilot area_km2 % is below 10', pilot_area;
  end if;

  select
    area_km2,
    extensions.ST_Area(geom::extensions.geography, true) / 1e6
  into small_area, small_expected
  from public.places
  where source_id = 'fixture-small';

  if small_area is distinct from small_expected then
    raise exception 'small area_km2 % does not match the geography calculation %',
      small_area, small_expected;
  end if;
  if small_area >= 10 then
    raise exception 'filter fixture area_km2 % should be under 10', small_area;
  end if;
  if exists (select 1 from public.protected_areas where source_id = 'fixture-small') then
    raise exception 'the place below 10 km2 was returned by protected_areas';
  end if;

  select is_generated, generation_expression
    into generated, expression
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'places'
    and column_name = 'area_km2';
  if generated is distinct from 'ALWAYS' then
    raise exception 'area_km2 is not a stored generated column';
  end if;
  if expression is not null and (
    expression not ilike '%st_area%'
    or expression not ilike '%geography%'
    or expression ilike '%transform%'
    or expression ilike '%3857%'
  ) then
    raise exception 'area_km2 expression is %', expression;
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.places'::regclass
      and relrowsecurity
  ) then
    raise exception 'row level security is not enabled on places';
  end if;

  if exists (
    select 1
    from pg_class
    where oid in (
      'public.sources'::regclass,
      'public.facts'::regclass,
      'public.fact_methods'::regclass
    )
      and not relrowsecurity
  ) then
    raise exception 'row level security is not enabled on sources, facts, or fact_methods';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.pilot_place_map'::regclass
      and relkind = 'r'
      and relrowsecurity
  ) then
    raise exception 'pilot_place_map is not a table with row level security';
  end if;

  if exists (
    select 1
    from public.pilot_place_map as mapped
    join public.places on places.id = mapped.id
    where not extensions.st_equals(mapped.geom, places.geom)
  ) then
    raise exception 'pilot_place_map does not return the stored boundary';
  end if;

  if exists (
    select 1
    from public.pilot_place_map
    where name = 'Small Park'
  ) then
    raise exception 'the place below 10 km2 was copied to pilot_place_map';
  end if;

  update public.places
  set name = 'Pilot Park Renamed'
  where source_id = 'fixture-pilot';
  if (
    select name
    from public.pilot_place_map
    where name = 'Pilot Park Renamed'
  ) is null then
    raise exception 'pilot_place_map did not follow the place name';
  end if;
  update public.places
  set name = 'Pilot Park'
  where source_id = 'fixture-pilot';

  update public.sources
  set name = 'WDPCA check'
  where name = 'WDPCA'
    and release_month = date '2026-10-01';
  if (
    select source_name
    from public.pilot_place_map
    where source_name = 'WDPCA check'
  ) is null then
    raise exception 'pilot_place_map did not follow the source name';
  end if;
  update public.sources
  set name = 'WDPCA'
  where name = 'WDPCA check'
    and release_month = date '2026-10-01';

  if has_function_privilege('anon', 'public.sync_pilot_place_map()', 'execute')
    or has_function_privilege('authenticated', 'public.sync_pilot_place_map()', 'execute') then
    raise exception 'anon or authenticated can execute sync_pilot_place_map';
  end if;

  if has_column_privilege('anon', 'public.places', 'geom', 'SELECT')
    or has_column_privilege('authenticated', 'public.places', 'geom', 'SELECT') then
    raise exception 'anon or authenticated can select places.geom';
  end if;
  if not has_column_privilege('anon', 'public.places', 'name', 'SELECT')
    or not has_column_privilege('anon', 'public.places', 'area_km2', 'SELECT')
    or not has_column_privilege('authenticated', 'public.places', 'name', 'SELECT') then
    raise exception 'anon or authenticated cannot select place attributes';
  end if;
  if has_table_privilege('anon', 'public.places', 'INSERT')
    or has_table_privilege('authenticated', 'public.places', 'INSERT') then
    raise exception 'anon or authenticated can insert places';
  end if;
  if has_table_privilege('anon', 'public.sources', 'INSERT')
    or has_table_privilege('anon', 'public.facts', 'INSERT')
    or has_table_privilege('anon', 'public.fact_methods', 'INSERT')
    or has_table_privilege('anon', 'public.pilot_place_map', 'INSERT')
    or has_table_privilege('authenticated', 'public.sources', 'INSERT')
    or has_table_privilege('authenticated', 'public.facts', 'INSERT')
    or has_table_privilege('authenticated', 'public.fact_methods', 'INSERT')
    or has_table_privilege('authenticated', 'public.pilot_place_map', 'INSERT') then
    raise exception 'anon or authenticated can insert sources, facts, fact_methods, or pilot_place_map';
  end if;

  insert into public.facts (
    place_id, sprout_id, method_id, area_km2, percent, valid_coverage
  )
  select id, 'cropland-2024-v1', 'area-weighted-spheroid-v1', 1.5, 100.0 / 3.0, 0.98
  from public.places
  where source_id = 'fixture-pilot';

  begin
    insert into public.facts (
      place_id, sprout_id, method_id, area_km2, percent, valid_coverage
    )
    select id, 'cropland-2024-v1', 'area-weighted-spheroid-v1', 2, 20, 1
    from public.places
    where source_id = 'fixture-pilot';
    raise exception 'duplicate fact was inserted';
  exception
    when unique_violation then
      null;
  end;

  begin
    insert into public.facts (
      place_id, sprout_id, method_id, area_km2, percent, valid_coverage
    )
    select id, 'cropland-2024-v1', 'missing-method', 1, 1, 1
    from public.places
    where source_id = 'fixture-pilot';
    raise exception 'fact with an unknown method was inserted';
  exception
    when foreign_key_violation then
      null;
  end;

  declare
    kept_id uuid;
  begin
    select id into kept_id
    from public.places
    where source_id = 'fixture-pilot';

    insert into public.places (
      source_release_id,
      source_id,
      site_id,
      name,
      place_type,
      designation,
      iucn_category,
      iso3,
      realm,
      geom
    )
    select
      source_release_id,
      source_id,
      site_id,
      name,
      place_type,
      designation,
      iucn_category,
      iso3,
      realm,
      geom
    from public.places
    where source_id = 'fixture-pilot'
    on conflict (source_release_id, source_id) do update
    set
      site_id = excluded.site_id,
      name = excluded.name,
      place_type = excluded.place_type,
      designation = excluded.designation,
      iucn_category = excluded.iucn_category,
      iso3 = excluded.iso3,
      realm = excluded.realm,
      geom = excluded.geom;

    if (
      select id from public.places where source_id = 'fixture-pilot'
    ) is distinct from kept_id then
      raise exception 'upsert changed the South Africa place id';
    end if;
    if (
      select count(*)
      from public.facts
      where place_id = kept_id
        and sprout_id = 'cropland-2024-v1'
        and method_id = 'area-weighted-spheroid-v1'
    ) <> 1 then
      raise exception 'South Africa place lost its cropland fact';
    end if;
  end;
end $$;

do $$
declare
  role_name text;
  readable int;
  pilot_count int;
begin
  foreach role_name in array array['anon', 'authenticated']
  loop
    perform set_config('role', role_name, true);
    begin
      execute 'select geom from public.places';
      raise exception '% read places.geom', role_name;
    exception
      when insufficient_privilege then
        null;
    end;

    select count(*) into readable from (
      select source_id from public.places
    ) as attribute_rows;
    if readable <> 3 then
      raise exception '% saw % place rows, expected 3', role_name, readable;
    end if;

    select count(*) into pilot_count
    from public.protected_areas
    where release_month = date '2026-10-01';
    if pilot_count <> 2 then
      raise exception '% saw % October 2026 pilot rows, expected 2', role_name, pilot_count;
    end if;
    if exists (
      select 1 from public.pilot_place_map where name = 'Chobe Fixture'
    ) then
      raise exception '% copied a place outside South Africa onto pilot_place_map', role_name;
    end if;

    select count(*) into pilot_count
    from public.pilot_place_map
    where name = 'Pilot Park';
    if pilot_count <> 1 then
      raise exception '% saw % map boundaries, expected 1', role_name, pilot_count;
    end if;

    if (
      select method_id
      from public.facts
    ) <> 'area-weighted-spheroid-v1' then
      raise exception '% could not read the fact method', role_name;
    end if;
    if (
      select id
      from public.fact_methods
    ) <> 'area-weighted-spheroid-v1' then
      raise exception '% could not read fact_methods', role_name;
    end if;

    begin
      insert into public.facts (
        place_id, sprout_id, method_id, area_km2, percent, valid_coverage
      )
      values (
        '00000000-0000-0000-0000-000000000000',
        'cropland-2024-v1',
        'area-weighted-spheroid-v1',
        1,
        1,
        1
      );
      raise exception '% inserted a fact', role_name;
    exception
      when insufficient_privilege then
        null;
    end;
  end loop;
end $$;

do $$
declare
  window_count int;
  window_total bigint;
  extent_count int;
  stats_count bigint;
  kept uuid[];
  window_row record;
begin
  perform set_config('role', 'anon', true);

  select count(*), min(total_count)
    into window_count, window_total
  from public.protected_area_window(
    '', false, 'size-desc', null, null, 0, 100, null, null, null, null, 50
  );
  if window_count <> 2 or window_total <> 2 then
    raise exception 'protected_area_window returned % of %, expected 2 of 2',
      window_count, window_total;
  end if;

  select * into window_row
  from public.protected_area_window(
    '', false, 'size-desc', null, null, 0, 100, null, null, null, null, 50
  ) as listed
  where listed.name = 'Pilot Park';
  if to_jsonb(window_row) ? 'geom' then
    raise exception 'protected_area_window returned geom';
  end if;
  if window_row.cropland_percent is null then
    raise exception 'protected_area_window did not join the South Africa cropland fact';
  end if;

  select * into window_row
  from public.protected_area_window(
    '', false, 'size-desc', null, null, 0, 100, null, null, null, null, 50
  ) as listed
  where listed.name = 'Chobe Fixture';
  if window_row.iso3 is distinct from 'BWA' then
    raise exception 'the list omitted the place outside South Africa';
  end if;
  if window_row.cropland_percent is not null then
    raise exception 'the place outside South Africa has a cropland fact';
  end if;

  select count(*) into extent_count
  from public.protected_areas_in_extent(26, -27, 28, -25);
  if extent_count <> 1 then
    raise exception 'extent that covers the park returned %', extent_count;
  end if;
  select count(*) into extent_count
  from public.protected_areas_in_extent(23.5, -21.5, 24.5, -20.5);
  if extent_count <> 1 then
    raise exception 'extent that covers the place outside South Africa returned %', extent_count;
  end if;
  select count(*) into extent_count
  from public.protected_areas_in_extent(0, -10, 1, -9);
  if extent_count <> 0 then
    raise exception 'extent that misses the park returned %', extent_count;
  end if;

  if public.protected_area_window_count(
    'Pilot', false, null, null, 0, 100, null, null, null, null
  ) <> 1 then
    raise exception 'name search did not match Pilot Park';
  end if;
  if public.protected_area_window_count(
    'zzz', false, null, null, 0, 100, null, null, null, null
  ) <> 0 then
    raise exception 'missing name search was not empty';
  end if;

  select place_count into stats_count from public.protected_area_filter_stats();
  if stats_count <> 2 then
    raise exception 'filter stats counted % places, expected 2', stats_count;
  end if;
  if (
    select array_length(size_bins, 1)
    from public.protected_area_filter_stats()
  ) <> 40 then
    raise exception 'filter stats did not return histogram bins';
  end if;

  kept := public.protected_area_kept_ids(null, null, 0, 100);
  if array_length(kept, 1) <> 2 then
    raise exception 'kept ids returned %', kept;
  end if;

  perform set_config('role', 'postgres', true);

  insert into public.places (
    source_release_id, source_id, site_id, name, place_type, designation,
    iucn_category, iso3, realm, geom
  )
  select
    sources.id,
    'fixture-cap-' || extra.n,
    'fixture-cap-site-' || extra.n,
    'Cap Park ' || extra.n,
    'protected_area',
    'National Park',
    'II',
    'ZAF',
    'Terrestrial',
    extensions.ST_GeomFromText(
      'MULTIPOLYGON((('
      || (27 + extra.n)::text || ' -24, '
      || (27.2 + extra.n)::text || ' -24, '
      || (27.2 + extra.n)::text || ' -23.8, '
      || (27 + extra.n)::text || ' -23.8, '
      || (27 + extra.n)::text || ' -24)))',
      4326
    )::extensions.geometry(MultiPolygon, 4326)
  from public.sources
  cross join generate_series(1, 51) as extra(n)
  where sources.name = 'WDPCA' and sources.release_month = date '2026-10-01';

  perform set_config('role', 'anon', true);
  select count(*), min(total_count)
    into window_count, window_total
  from public.protected_area_window(
    '', false, 'size-desc', null, null, 0, 100, null, null, null, null, 50
  );
  if window_count <> 50 or window_total <> 53 then
    raise exception 'capped window returned % of %, expected 50 of 53',
      window_count, window_total;
  end if;

  select count(*), min(total_count)
    into window_count, window_total
  from public.protected_area_window(
    '', false, 'size-desc', null, null, 0, 100, null, null, null, null, 50, 50
  );
  if window_count <> 3 or window_total <> 53 then
    raise exception 'offset window returned % of %, expected 3 of 53',
      window_count, window_total;
  end if;
end $$;

\echo records fixture ok
rollback;
