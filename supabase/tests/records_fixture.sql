-- Two-feature check for the records migration. Rolls back, so places stays empty.
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
      and download_url = 'https://d1gam3xoknrgr2.cloudfront.net/current/WDPA_WDOECM_Oct2026_Public_ZAF.zip'
      and checksum = '5e55ad223986b4d9e2afdb1fad5d9ec0591e18e2ebb0e5bf71dfa344f0f93447'
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
  select count(*) into pilot_count from public.pilot_places;
  if pilot_count <> 1 then
    raise exception 'pilot_places returned % rows, expected 1', pilot_count;
  end if;
  if (select source_id from public.pilot_places) <> 'fixture-pilot' then
    raise exception 'pilot_places returned %', (select source_id from public.pilot_places);
  end if;

  select release_month, area_km2
    into release, pilot_area
  from public.pilot_places;

  if release <> date '2026-10-01'
    or extract(year from release)::int <> 2026
    or extract(month from release)::int <> 10 then
    raise exception 'release month is not October 2026: %', release;
  end if;
  if (select source_name from public.pilot_places) <> 'WDPCA' then
    raise exception 'pilot_places is not joined to the WDPCA source';
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
  if exists (select 1 from public.pilot_places where source_id = 'fixture-small') then
    raise exception 'the place below 10 km2 was returned by pilot_places';
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
    if readable <> 2 then
      raise exception '% saw % place rows, expected 2', role_name, readable;
    end if;

    select count(*) into pilot_count
    from public.pilot_places
    where release_month = date '2026-10-01';
    if pilot_count <> 1 then
      raise exception '% saw % October 2026 pilot rows, expected 1', role_name, pilot_count;
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

\echo records fixture ok
rollback;
