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
    from public.source_releases
    join public.sources on sources.id = source_releases.source_id
    where source_releases.source_id = 'wdpca'
      and source_releases.version_label = 'October 2026'
      and source_releases.released_on = date '2026-10-01'
      and source_releases.citation like 'UNEP-WCMC and IUCN (2026), Protected Planet: The World Database on Protected and Conserved Areas (WDPCA) [On-line], October 2026, %'
      and sources.source_kind = 'dataset'
      and sources.licence_id = 'wdpa-terms'
      and download_url = 'https://pp-import-production.s3.eu-west-1.amazonaws.com/WDPA_WDOECM_Oct2026_Public.zip'
      and checksum = 'f5f5e50f230923619ad60faf8296e4f39a4d8c1b14bb6ea80e82ea6db6292b1c'
  ) then
    raise exception 'WDPCA October 2026 release does not match the pin';
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

-- A place in the task 04 shape: the place, its details, and its parcel id.
create function pg_temp.fixture_place(
  p_pid text,
  p_site text,
  p_name text,
  p_iucn text,
  p_iso3 text,
  p_wkt text,
  p_status text default 'published'
)
returns uuid
language plpgsql
as $$
declare
  new_id uuid;
  release uuid;
begin
  select id into release
  from public.source_releases
  where source_id = 'wdpca' and version_label = 'October 2026';

  insert into public.places (name, place_type_id, publication_status, geom)
  values (
    p_name,
    'conservation_area',
    p_status,
    extensions.ST_GeomFromText(p_wkt, 4326)::extensions.geometry(MultiPolygon, 4326)
  )
  returning id into new_id;

  insert into public.conservation_area_details (
    place_id, designation, iucn_category, iso3, realm,
    source_id, source_release_id, source_record_id, source_url
  ) values (
    new_id, 'National Park', p_iucn, string_to_array(p_iso3, ';'), 'Terrestrial',
    'wdpca', release, p_site, 'https://www.protectedplanet.net/' || p_site
  );

  insert into public.place_source_ids (
    place_id, source_id, id_kind, source_record_id, match_status,
    first_seen_release_id, last_seen_release_id
  ) values (
    new_id, 'wdpca', 'wdpa_site_pid', p_pid, 'confirmed', release, release
  );
  return new_id;
end;
$$;

-- The place a confirmed SITE_PID points at.
create function pg_temp.fixture_id(p_pid text)
returns uuid
language sql
stable
as $$
  select place_id
  from public.place_source_ids
  where source_id = 'wdpca'
    and id_kind = 'wdpa_site_pid'
    and match_status = 'confirmed'
    and source_record_id = p_pid;
$$;

select pg_temp.fixture_place(
  'fixture-pilot', 'fixture-pilot-site', 'Pilot Park', 'II', 'ZAF',
  'MULTIPOLYGON(((27 -26, 27.2 -26, 27.2 -25.8, 27 -25.8, 27 -26)))'
);
select pg_temp.fixture_place(
  'fixture-small', 'fixture-small-site', 'Small Park', 'IV', 'ZAF',
  'MULTIPOLYGON(((27.5 -26, 27.502 -26, 27.502 -25.998, 27.5 -25.998, 27.5 -26)))'
);
select pg_temp.fixture_place(
  'fixture-abroad', 'fixture-abroad-site', 'Chobe Fixture', 'II', 'BWA',
  'MULTIPOLYGON(((24 -21, 24.2 -21, 24.2 -20.8, 24 -20.8, 24 -21)))'
);

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
    select 1 from public.protected_areas
    where source_name is distinct from 'World Database on Protected and Conserved Areas'
      or citation not like 'UNEP-WCMC and IUCN (2026), Protected Planet:%'
  ) then
    raise exception 'protected_areas is not joined to the WDPCA source and its citation';
  end if;

  select
    area_km2,
    extensions.ST_Area(geom::extensions.geography, true) / 1e6
  into pilot_area, pilot_expected
  from public.places
  where id = pg_temp.fixture_id('fixture-pilot');

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
  where id = pg_temp.fixture_id('fixture-small');

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
      'public.source_releases'::regclass,
      'public.licences'::regclass,
      'public.facts'::regclass,
      'public.fact_methods'::regclass
    )
      and not relrowsecurity
  ) then
    raise exception 'row level security is not enabled on sources, source_releases, licences, facts, or fact_methods';
  end if;

  if to_regclass('public.source_releases') is null
    or (select count(*) from public.sources) <> 1
    or (select count(*) from public.licences) <> 1
    or not exists (
      select 1 from public.licences
      where id = 'wdpa-terms'
        and requires_attribution
        and not share_alike
        and not allows_commercial
    ) then
    raise exception 'sources, source_releases, or licences does not hold the WDPCA rows';
  end if;

  begin
    insert into public.source_releases (
      id, source_id, version_label, released_on, download_url, checksum, citation
    ) values (
      gen_random_uuid(), 'no-such-source', 'v1', date '2026-01-01', 'x', 'x', 'x'
    );
    raise exception 'a release was stored for a missing source';
  exception
    when foreign_key_violation then
      null;
  end;

  if to_regclass('public.pilot_place_map') is not null
    or to_regprocedure('public.sync_pilot_place_map()') is not null then
    raise exception 'pilot_place_map or sync_pilot_place_map still exists';
  end if;

  if (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'sources', 'source_releases', 'licences', 'places', 'facts', 'fact_methods',
        'place_categories', 'place_types', 'conservation_area_details', 'place_source_ids'
      )
      and column_name in ('created_at', 'updated_at')
      and data_type = 'timestamp with time zone'
      and is_nullable = 'NO'
      and column_default = 'now()'
  ) <> 20 then
    raise exception 'a table is missing created_at or updated_at with default now()';
  end if;

  if (
    select count(*)
    from pg_trigger
    where not tgisinternal
      and tgfoid = 'public.set_updated_at()'::regprocedure
      and tgrelid in (
        'public.sources'::regclass,
        'public.source_releases'::regclass,
        'public.licences'::regclass,
        'public.places'::regclass,
        'public.facts'::regclass,
        'public.fact_methods'::regclass,
        'public.place_categories'::regclass,
        'public.place_types'::regclass,
        'public.conservation_area_details'::regclass,
        'public.place_source_ids'::regclass
      )
  ) <> 10 then
    raise exception 'set_updated_at() is not the update trigger on all ten tables';
  end if;

  if exists (
    select 1
    from public.places
    where id = pg_temp.fixture_id('fixture-pilot')
      and (created_at <> now() or updated_at <> now())
  ) then
    raise exception 'a new place did not get created_at and updated_at now()';
  end if;

  update public.places
  set
    created_at = timestamptz '2000-01-01 00:00:00+00',
    updated_at = timestamptz '2000-01-01 00:00:00+00'
  where id = pg_temp.fixture_id('fixture-pilot');
  update public.places
  set name = 'Pilot Park Renamed'
  where id = pg_temp.fixture_id('fixture-pilot');
  if not exists (
    select 1
    from public.places
    where id = pg_temp.fixture_id('fixture-pilot')
      and name = 'Pilot Park Renamed'
      and created_at = timestamptz '2000-01-01 00:00:00+00'
      and updated_at = now()
  ) then
    raise exception 'an update did not set updated_at, or it changed created_at';
  end if;
  update public.places
  set name = 'Pilot Park'
  where id = pg_temp.fixture_id('fixture-pilot');

  if has_function_privilege('anon', 'public.set_updated_at()', 'execute')
    or has_function_privilege('authenticated', 'public.set_updated_at()', 'execute') then
    raise exception 'anon or authenticated can execute set_updated_at';
  end if;

  if not has_column_privilege('anon', 'public.places', 'created_at', 'SELECT')
    or not has_column_privilege('anon', 'public.places', 'updated_at', 'SELECT')
    or not has_column_privilege('authenticated', 'public.places', 'updated_at', 'SELECT') then
    raise exception 'anon or authenticated cannot select places.created_at or updated_at';
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
    or has_table_privilege('anon', 'public.source_releases', 'INSERT')
    or has_table_privilege('anon', 'public.licences', 'INSERT')
    or has_table_privilege('authenticated', 'public.source_releases', 'UPDATE')
    or has_table_privilege('authenticated', 'public.licences', 'UPDATE')
    or has_table_privilege('anon', 'public.facts', 'INSERT')
    or has_table_privilege('anon', 'public.fact_methods', 'INSERT')
    or has_table_privilege('authenticated', 'public.sources', 'INSERT')
    or has_table_privilege('authenticated', 'public.facts', 'INSERT')
    or has_table_privilege('authenticated', 'public.fact_methods', 'INSERT') then
    raise exception 'anon or authenticated can write sources, source_releases, licences, facts, or fact_methods';
  end if;

  insert into public.facts (
    place_id, sprout_id, method_id, area_km2, percent, valid_coverage
  )
  select id, 'cropland-2024-v1', 'area-weighted-spheroid-v1', 1.5, 100.0 / 3.0, 0.98
  from public.places
  where id = pg_temp.fixture_id('fixture-pilot');

  begin
    insert into public.facts (
      place_id, sprout_id, method_id, area_km2, percent, valid_coverage
    )
    select id, 'cropland-2024-v1', 'area-weighted-spheroid-v1', 2, 20, 1
    from public.places
    where id = pg_temp.fixture_id('fixture-pilot');
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
    where id = pg_temp.fixture_id('fixture-pilot');
    raise exception 'fact with an unknown method was inserted';
  exception
    when foreign_key_violation then
      null;
  end;

  -- Task 04: types, details, and source ids ----------------------------------

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'places'
      and column_name in (
        'place_type', 'source_release_id', 'source_id', 'site_id',
        'designation', 'iucn_category', 'iso3', 'realm'
      )
  ) or to_regtype('public.place_type') is not null then
    raise exception 'places still has the place_type enum or an old WDPCA column';
  end if;

  if exists (
    select 1
    from pg_class
    where oid in (
      'public.place_categories'::regclass,
      'public.place_types'::regclass,
      'public.conservation_area_details'::regclass,
      'public.place_source_ids'::regclass
    )
      and not relrowsecurity
  ) then
    raise exception 'row level security is not enabled on a task 04 table';
  end if;

  if (select count(*) from public.place_types) <> 1
    or not exists (
      select 1 from public.place_types
      where id = 'conservation_area'
        and place_category_id = 'conservation_area'
        and details_kind = 'conservation_area'
    ) then
    raise exception 'place_types does not hold only conservation_area';
  end if;

  if exists (
    select 1 from public.places
    where place_type_id <> 'conservation_area' or publication_status <> 'published'
  ) then
    raise exception 'a fixture place is not a published conservation area';
  end if;

  if (
    select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'protected_areas' and column_name = 'iso3'
  ) <> 'text' then
    raise exception 'protected_areas.iso3 is not text';
  end if;

  update public.conservation_area_details
  set iso3 = array['BWA', 'ZWE']
  where place_id = pg_temp.fixture_id('fixture-abroad');
  if (
    select iso3 from public.protected_areas where source_id = 'fixture-abroad'
  ) is distinct from 'BWA;ZWE' then
    raise exception 'protected_areas did not join a two-country iso3 with ;';
  end if;
  update public.conservation_area_details
  set iso3 = array['BWA']
  where place_id = pg_temp.fixture_id('fixture-abroad');

  if (
    select site_id from public.protected_areas where source_id = 'fixture-pilot'
  ) is distinct from 'fixture-pilot-site' then
    raise exception 'protected_areas.site_id does not read the details source record';
  end if;

  begin
    insert into public.place_source_ids (
      place_id, source_id, id_kind, source_record_id, match_status
    ) values (
      pg_temp.fixture_id('fixture-abroad'), 'wdpca', 'wdpa_site_pid', 'fixture-pilot', 'confirmed'
    );
    raise exception 'a second confirmed row for one SITE_PID was stored';
  exception
    when unique_violation then
      null;
  end;

  insert into public.place_source_ids (
    place_id, source_id, id_kind, source_record_id, match_status
  ) values (
    pg_temp.fixture_id('fixture-abroad'), 'wdpca', 'wdpa_site_pid', 'fixture-pilot', 'proposed'
  );
  delete from public.place_source_ids
  where match_status = 'proposed' and source_record_id = 'fixture-pilot';

  begin
    update public.places
    set merged_into_place_id = pg_temp.fixture_id('fixture-abroad')
    where id = pg_temp.fixture_id('fixture-pilot');
    raise exception 'merged_into_place_id was set on a published place';
  exception
    when check_violation then
      null;
  end;

  begin
    update public.places
    set publication_status = 'merged', merged_into_place_id = id
    where id = pg_temp.fixture_id('fixture-pilot');
    raise exception 'a place was merged into itself';
  exception
    when check_violation then
      null;
  end;

  begin
    update public.places
    set publication_status = 'hidden'
    where id = pg_temp.fixture_id('fixture-pilot');
    raise exception 'an unknown publication status was stored';
  exception
    when check_violation then
      null;
  end;

  declare
    other_id uuid;
  begin
    insert into public.place_categories (id, title) values ('fixture_category', 'Fixture');
    insert into public.place_types (id, place_category_id, title)
    values ('fixture_type', 'fixture_category', 'Fixture type');
    insert into public.places (name, place_type_id, publication_status, geom)
    values (
      'Not a conservation area',
      'fixture_type',
      'published',
      extensions.ST_GeomFromText(
        'MULTIPOLYGON(((10 10, 10.2 10, 10.2 10.2, 10 10.2, 10 10)))', 4326
      )::extensions.geometry(MultiPolygon, 4326)
    )
    returning id into other_id;
    begin
      insert into public.conservation_area_details (place_id, iso3, source_id)
      values (other_id, array['ZAF'], 'wdpca');
      raise exception 'conservation area details were stored for another type';
    exception
      when check_violation then
        null;
    end;
    delete from public.places where id = other_id;
    delete from public.place_types where id = 'fixture_type';
    delete from public.place_categories where id = 'fixture_category';
  end;

  begin
    insert into public.conservation_area_details (place_id, iso3, source_id, source_release_id)
    values (pg_temp.fixture_id('fixture-pilot'), array['ZAF'], 'wdpca', gen_random_uuid());
    raise exception 'details were stored twice, or with a release of another source';
  exception
    when unique_violation or foreign_key_violation then
      null;
  end;

  perform pg_temp.fixture_place(
    'fixture-draft', 'fixture-draft-site', 'Draft Park', 'II', 'ZAF',
    'MULTIPOLYGON(((29 -26, 29.2 -26, 29.2 -25.8, 29 -25.8, 29 -26)))',
    'draft'
  );
  if exists (select 1 from public.protected_areas where source_id = 'fixture-draft')
    or exists (
      select 1 from public.protected_areas_in_extent(28.5, -27, 29.5, -25)
    )
    or exists (select 1 from public.place_bounds(pg_temp.fixture_id('fixture-draft'))) then
    raise exception 'a draft place was returned by protected_areas, the extent, or place_bounds';
  end if;
  if not exists (select 1 from public.place_bounds(pg_temp.fixture_id('fixture-pilot'))) then
    raise exception 'place_bounds did not return the published pilot place';
  end if;

  if (
    select count(*) from public.facts
    where place_id = pg_temp.fixture_id('fixture-pilot')
      and sprout_id = 'cropland-2024-v1'
      and method_id = 'area-weighted-spheroid-v1'
  ) <> 1 then
    raise exception 'South Africa place lost its cropland fact';
  end if;
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
      select id, place_type_id, publication_status, merged_into_place_id from public.places
    ) as attribute_rows;
    if readable <> 3 then
      raise exception '% saw % place rows, expected the 3 published ones', role_name, readable;
    end if;

    if (select count(*) from public.place_categories) <> 1
      or (select count(*) from public.place_types) <> 1
      or (select count(*) from public.conservation_area_details) <> 3
      or (select count(*) from public.place_source_ids) <> 3 then
      raise exception '% cannot read the task 04 tables, or read a draft place''s rows', role_name;
    end if;

    begin
      insert into public.place_types (id, place_category_id, title)
      values ('fixture_type', 'conservation_area', 'x');
      raise exception '% inserted a place type', role_name;
    exception
      when insufficient_privilege then
        null;
    end;
    begin
      update public.conservation_area_details set designation = 'x';
      raise exception '% updated conservation area details', role_name;
    exception
      when insufficient_privilege then
        null;
    end;
    begin
      delete from public.place_source_ids;
      raise exception '% deleted place source ids', role_name;
    exception
      when insufficient_privilege then
        null;
    end;

    if (select count(*) from public.sources) <> 1
      or (select count(*) from public.source_releases) <> 1
      or (select count(*) from public.licences) <> 1 then
      raise exception '% cannot read sources, source_releases, and licences', role_name;
    end if;
    if exists (
      select 1 from public.protected_areas where citation is null
    ) then
      raise exception '% read protected_areas without a citation', role_name;
    end if;

    select count(*) into pilot_count
    from public.protected_areas
    where release_month = date '2026-10-01';
    if pilot_count <> 2 then
      raise exception '% saw % October 2026 pilot rows, expected 2', role_name, pilot_count;
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

  perform pg_temp.fixture_place(
    'fixture-cap-' || extra.n,
    'fixture-cap-site-' || extra.n,
    'Cap Park ' || extra.n,
    'II',
    'ZAF',
    'MULTIPOLYGON((('
      || (27 + extra.n)::text || ' -24, '
      || (27.2 + extra.n)::text || ' -24, '
      || (27.2 + extra.n)::text || ' -23.8, '
      || (27 + extra.n)::text || ' -23.8, '
      || (27 + extra.n)::text || ' -24)))'
  )
  from generate_series(1, 51) as extra(n);

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
