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

-- A place in the task 05 shape: the place, its details, its parcel id, its
-- site id when the site is new, and, unless p_backfill is false, its version 1
-- boundary through the backfill.
create function pg_temp.fixture_place(
  p_pid text,
  p_site text,
  p_name text,
  p_iucn text,
  p_iso3 text,
  p_wkt text,
  p_status text default 'published',
  p_backfill boolean default true
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

  insert into public.place_source_ids (
    place_id, source_id, id_kind, source_record_id, match_status,
    first_seen_release_id, last_seen_release_id
  ) values (
    new_id, 'wdpca', 'wdpa_site_id', p_site, 'confirmed', release, release
  )
  on conflict (source_id, id_kind, source_record_id) where match_status = 'confirmed'
  do nothing;

  if p_backfill then
    perform public.backfill_place_boundaries(null, 100000);
  end if;
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
      or (select count(*) from public.place_source_ids) <> 6 then
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

-- Task 05: boundaries and the site merge ---------------------------------------

do $$
declare
  pilot uuid := pg_temp.fixture_id('fixture-pilot');
  north_id uuid;
  south_id uuid;
  largest double precision;
  total double precision;
  site_area double precision;
  bounds record;
begin
  perform set_config('role', 'postgres', true);

  if not exists (
    select 1 from pg_class where oid = 'public.place_boundaries'::regclass and relrowsecurity
  ) then
    raise exception 'row level security is not enabled on place_boundaries';
  end if;
  if has_column_privilege('anon', 'public.place_boundaries', 'geom', 'SELECT')
    or has_column_privilege('authenticated', 'public.place_boundaries', 'geom', 'SELECT') then
    raise exception 'anon or authenticated can select place_boundaries.geom';
  end if;
  if has_table_privilege('anon', 'public.place_boundaries', 'INSERT')
    or has_table_privilege('authenticated', 'public.place_boundaries', 'UPDATE') then
    raise exception 'anon or authenticated can write place_boundaries';
  end if;
  if has_function_privilege('anon', 'public.backfill_place_boundaries(uuid, integer)', 'execute')
    or has_function_privilege('authenticated', 'public.merge_wdpa_site_parcels()', 'execute') then
    raise exception 'anon or authenticated can run the backfill or the merge';
  end if;
  if to_regclass('public.place_boundaries_geom_idx') is null then
    raise exception 'place_boundaries_geom_idx is missing';
  end if;

  if exists (
    select 1
    from public.places
    where not exists (
      select 1 from public.place_boundaries as b
      where b.place_id = places.id and b.is_current and b.version_number = 1
        and b.review_status = 'approved' and b.source_id = 'wdpca'
        and b.area_km2 = places.area_km2
        and b.bbox_west = extensions.st_xmin(places.geom)
        and b.bbox_north = extensions.st_ymax(places.geom)
    )
  ) then
    raise exception 'a fixture place has no version 1 boundary equal to its geometry';
  end if;
  if (
    select count(*) from public.place_boundaries
  ) <> (select count(*) from public.places) then
    raise exception 'the backfill wrote a second boundary for a place';
  end if;

  begin
    insert into public.place_boundaries (
      place_id, version_number, geom, source_id, review_status, is_current
    )
    select place_id, 2, geom, source_id, 'approved', true
    from public.place_boundaries where place_id = pilot;
    raise exception 'a second current boundary was stored';
  exception
    when unique_violation then
      null;
  end;
  begin
    insert into public.place_boundaries (
      place_id, version_number, geom, source_id, review_status, is_current
    )
    select place_id, 2, geom, source_id, 'proposed', true
    from public.place_boundaries where place_id = pilot;
    raise exception 'a current boundary that is not approved was stored';
  exception
    when check_violation then
      null;
  end;
  begin
    insert into public.place_boundaries (
      place_id, version_number, geom, source_id, review_status
    ) values (
      pilot, 2,
      extensions.ST_GeomFromText(
        'MULTIPOLYGON(((27 -26, 27.2 -25.8, 27.2 -26, 27 -25.8, 27 -26)))', 4326
      )::extensions.geometry(MultiPolygon, 4326),
      'wdpca', 'approved'
    );
    raise exception 'an approved invalid boundary was stored';
  exception
    when check_violation then
      null;
  end;
  insert into public.place_boundaries (
    place_id, version_number, geom, source_id, review_status
  ) values (
    pilot, 2,
    extensions.ST_GeomFromText(
      'MULTIPOLYGON(((27 -26, 27.2 -25.8, 27.2 -26, 27 -25.8, 27 -26)))', 4326
    )::extensions.geometry(MultiPolygon, 4326),
    'wdpca', 'proposed'
  );

  -- A site of two parcels that overlap. The larger one is created first, so
  -- the site's wdpa_site_id row points at it.
  north_id := pg_temp.fixture_place(
    'fixture-twin-north', 'fixture-twin-site', 'Twin Park North', 'II', 'ZAF',
    'MULTIPOLYGON(((30 -26, 30.3 -26, 30.3 -25.7, 30 -25.7, 30 -26)))',
    'published', false
  );
  south_id := pg_temp.fixture_place(
    'fixture-twin-south', 'fixture-twin-site', 'Twin Park South', 'IV', 'ZAF',
    'MULTIPOLYGON(((30.1 -26.2, 30.3 -26.2, 30.3 -25.9, 30.1 -25.9, 30.1 -26.2)))',
    'published', false
  );
  update public.conservation_area_details
  set designation = 'Buffer Zone'
  where place_id = south_id;

  begin
    perform public.merge_wdpa_site_parcels();
    raise exception 'the merge ran before every site had a boundary';
  exception
    when check_violation then
      null;
  end;

  perform public.backfill_place_boundaries(null, 2);
  perform public.backfill_place_boundaries(null, 100000);
  if exists (select 1 from public.place_boundaries where place_id = south_id) then
    raise exception 'the parcel that is not kept got a boundary';
  end if;

  select max(area_km2), sum(area_km2) into largest, total
  from public.places where id in (north_id, south_id);
  select area_km2 into site_area
  from public.place_boundaries where place_id = north_id and is_current;
  if site_area is null or site_area <= largest or site_area >= total then
    raise exception 'the site boundary area % is not the union of parcels % and %',
      site_area, largest, total;
  end if;

  if public.merge_wdpa_site_parcels() <> 1 then
    raise exception 'the merge did not merge exactly one place';
  end if;
  if public.merge_wdpa_site_parcels() <> 0 then
    raise exception 'a second merge changed a place';
  end if;
  if not exists (
    select 1 from public.places
    where id = south_id and publication_status = 'merged' and merged_into_place_id = north_id
  ) or exists (
    select 1 from public.places
    where publication_status = 'merged' and id <> south_id
  ) then
    raise exception 'the smaller parcel was not merged into the kept place, or another was';
  end if;
  if pg_temp.fixture_id('fixture-twin-south') <> north_id then
    raise exception 'the merged SITE_PID does not point at the kept place';
  end if;
  if (
    select jsonb_array_length(source_attributes -> 'parcels')
    from public.conservation_area_details where place_id = north_id
  ) <> 2
    or (
      select source_attributes -> 'designations_differ'
      from public.conservation_area_details where place_id = north_id
    ) is distinct from 'true'::jsonb
    or (
      select source_attributes -> 'parcels' -> 1 ->> 'site_pid'
      from public.conservation_area_details where place_id = north_id
    ) is distinct from 'fixture-twin-south' then
    raise exception 'the kept place does not record both parcels and their designations';
  end if;

  if (select area_km2 from public.protected_areas where id = north_id)
      is distinct from site_area
    or exists (select 1 from public.protected_areas where id = south_id) then
    raise exception 'protected_areas does not read the site boundary, or lists the merged parcel';
  end if;
  if not exists (
    select 1 from public.protected_areas_in_extent(30.15, -26.15, 30.25, -26.1)
    where id = north_id and area_km2 = site_area
  ) then
    raise exception 'the extent does not match the site boundary box';
  end if;
  select * into bounds from public.place_bounds(north_id);
  if bounds.west <> 30 or bounds.south <> -26.2 or bounds.east <> 30.3 or bounds.north <> -25.7 then
    raise exception 'place_bounds did not return the site box: %', bounds;
  end if;
  if exists (select 1 from public.place_bounds(south_id)) then
    raise exception 'place_bounds returned a merged place';
  end if;

  perform set_config('role', 'anon', true);
  begin
    execute 'select geom from public.place_boundaries';
    raise exception 'anon read place_boundaries.geom';
  exception
    when insufficient_privilege then
      null;
  end;
  if exists (
    select 1 from public.place_boundaries
    where not is_current
      or place_id = pg_temp.fixture_id('fixture-draft')
  ) then
    raise exception 'anon read a boundary that is not current, or a draft place''s';
  end if;
  if (select area_km2 from public.place_boundaries where place_id = north_id) <> site_area then
    raise exception 'anon cannot read the current boundary''s area';
  end if;
  if exists (select 1 from public.places where id = south_id) then
    raise exception 'anon read a merged place';
  end if;
  perform set_config('role', 'postgres', true);
end $$;

-- Task 05a: every parcel is its own place again -------------------------------------

do $$
declare
  north_id uuid := pg_temp.fixture_id('fixture-twin-north');
  south_id uuid;
  union_id uuid;
begin
  select id into south_id from public.places where name = 'Twin Park South';
  select id into union_id
  from public.place_boundaries where place_id = north_id and is_current;

  if has_function_privilege('anon', 'public.unmerge_wdpa_site_parcels()', 'execute')
    or has_function_privilege('authenticated', 'public.unmerge_wdpa_site_parcels()', 'execute') then
    raise exception 'anon or authenticated can run the un-merge';
  end if;

  if public.unmerge_wdpa_site_parcels() <> 1 then
    raise exception 'the un-merge did not publish exactly one place again';
  end if;
  if public.unmerge_wdpa_site_parcels() <> 0 then
    raise exception 'a second un-merge changed a place';
  end if;

  if exists (select 1 from public.places where publication_status = 'merged')
    or exists (select 1 from public.places where id = south_id and merged_into_place_id is not null) then
    raise exception 'a place is still merged';
  end if;
  if pg_temp.fixture_id('fixture-twin-south') is distinct from south_id
    or pg_temp.fixture_id('fixture-twin-north') is distinct from north_id then
    raise exception 'a SITE_PID does not point at its own parcel';
  end if;
  if (
    select match_status from public.place_source_ids
    where id_kind = 'wdpa_site_id' and source_record_id = 'fixture-twin-site'
  ) is distinct from 'proposed'
    or (
      select match_status from public.place_source_ids
      where id_kind = 'wdpa_site_id' and source_record_id = 'fixture-pilot-site'
    ) is distinct from 'confirmed' then
    raise exception 'only the multi-parcel site should be proposed';
  end if;

  if exists (
    select 1 from public.places
    where publication_status = 'published'
      and (
        select count(*) from public.place_boundaries as b
        where b.place_id = places.id and b.is_current
      ) <> 1
  ) then
    raise exception 'a published place does not have exactly one current boundary';
  end if;
  if not exists (
    select 1 from public.place_boundaries as b
    join public.places on places.id = b.place_id
    where b.place_id = north_id and b.is_current and b.version_number = 2
      and b.source_record_id = 'fixture-twin-north'
      and extensions.st_equals(b.geom, places.geom)
  ) or not exists (
    select 1 from public.place_boundaries as b
    join public.places on places.id = b.place_id
    where b.place_id = south_id and b.is_current and b.version_number = 1
      and b.source_record_id = 'fixture-twin-south'
      and extensions.st_equals(b.geom, places.geom)
  ) then
    raise exception 'a parcel''s current boundary is not its own shape';
  end if;
  if not exists (
    select 1 from public.place_boundaries
    where id = union_id and not is_current and superseded_at is not null
      and review_status = 'approved'
  ) then
    raise exception 'the site union was not kept as a superseded version';
  end if;
  if exists (
    select 1 from public.conservation_area_details
    where place_id = north_id
      and (source_attributes ? 'parcels' or source_attributes ? 'designations_differ')
  ) then
    raise exception 'the kept place still lists the parcels';
  end if;

  begin
    perform public.merge_wdpa_site_parcels();
    raise exception 'the task 05 merge ran again after the un-merge';
  exception
    when check_violation then
      null;
  end;

  if (select count(*) from public.protected_areas where id in (north_id, south_id)) <> 2
    or (select area_km2 from public.protected_areas where id = south_id)
      is distinct from (select area_km2 from public.places where id = south_id) then
    raise exception 'protected_areas does not list both parcels with their own area';
  end if;
  if not exists (select 1 from public.place_bounds(south_id)) then
    raise exception 'place_bounds does not return the published parcel';
  end if;

  perform set_config('role', 'anon', true);
  if not exists (select 1 from public.places where id = south_id) then
    raise exception 'anon cannot read the published parcel';
  end if;
  if exists (select 1 from public.place_boundaries where id = union_id) then
    raise exception 'anon read the superseded site union';
  end if;
  perform set_config('role', 'postgres', true);
end $$;

-- Task 05b: generic reads, and wrappers that return what they did before -------------

\ir reads_before_05b.sql

do $$
declare
  sorts text[] := array['size-desc', 'size-asc', 'name', 'cropland-desc', 'cropland-asc'];
  sort_id text;
  q record;
  place record;
  south_id uuid;
  new_rows text[];
  old_rows text[];
begin
  -- Each query: search, prefix, size range, crop range, extent.
  for q in
    select * from (values
      ('', false, null::float8, null::float8, 0::float8, 100::float8, null::float8, null::float8, null::float8, null::float8),
      ('park', false, null, null, 0, 100, null, null, null, null),
      ('Twin', true, null, null, 0, 100, null, null, null, null),
      ('', false, 20, 5000, 0, 100, null, null, null, null),
      ('', false, null, null, 0, 50, null, null, null, null),
      ('', false, null, null, 0, 100, 20, -35, 35, -15),
      ('', false, null, null, 0, 100, 170, -60, -170, 60),
      ('', false, null, null, 1, 100, 20, -35, 35, -15)
    ) as v(search, prefix, size_min, size_max, crop_min, crop_max, w, s, e, n)
  loop
    foreach sort_id in array sorts loop
      new_rows := array(
        select row(r.*)::text from public.protected_area_window(
          q.search, q.prefix, sort_id, q.size_min, q.size_max, q.crop_min, q.crop_max,
          q.w, q.s, q.e, q.n, 50, 0) as r);
      old_rows := array(
        select row(r.*)::text from pg_temp.old_protected_area_window(
          q.search, q.prefix, sort_id, q.size_min, q.size_max, q.crop_min, q.crop_max,
          q.w, q.s, q.e, q.n, 50, 0) as r);
      if new_rows is distinct from old_rows then
        raise exception 'protected_area_window changed for % sorted %: % instead of %',
          q, sort_id, new_rows, old_rows;
      end if;
      if new_rows is distinct from array(
        select row(r.*)::text from public.place_window(
          'conservation_area', q.search, q.prefix, sort_id, q.size_min, q.size_max,
          q.crop_min, q.crop_max, q.w, q.s, q.e, q.n, 50, 0) as r) then
        raise exception 'place_window differs from its wrapper for %', q;
      end if;
      for place in select id from public.places loop
        if public.protected_area_rank(place.id, q.search, q.prefix, sort_id, q.size_min,
            q.size_max, q.crop_min, q.crop_max, q.w, q.s, q.e, q.n)
          is distinct from pg_temp.old_protected_area_rank(place.id, q.search, q.prefix,
            sort_id, q.size_min, q.size_max, q.crop_min, q.crop_max, q.w, q.s, q.e, q.n) then
          raise exception 'protected_area_rank changed for % in % sorted %', place.id, q, sort_id;
        end if;
      end loop;
    end loop;
    if public.protected_area_window_count(q.search, q.prefix, q.size_min, q.size_max,
        q.crop_min, q.crop_max, q.w, q.s, q.e, q.n)
      <> pg_temp.old_protected_area_window_count(q.search, q.prefix, q.size_min, q.size_max,
        q.crop_min, q.crop_max, q.w, q.s, q.e, q.n) then
      raise exception 'protected_area_window_count changed for %', q;
    end if;
    if q.w is not null and array(
        select row(r.*)::text from public.protected_areas_in_extent(q.w, q.s, q.e, q.n) as r order by r.id)
      is distinct from array(
        select row(r.*)::text from pg_temp.old_protected_areas_in_extent(q.w, q.s, q.e, q.n) as r order by r.id) then
      raise exception 'protected_areas_in_extent changed for %', q;
    end if;
    if (select array_agg(x order by x) from unnest(public.protected_area_kept_ids(
          q.size_min, q.size_max, q.crop_min, q.crop_max)) as x)
      is distinct from (select array_agg(x order by x) from unnest(pg_temp.old_protected_area_kept_ids(
          q.size_min, q.size_max, q.crop_min, q.crop_max)) as x) then
      raise exception 'protected_area_kept_ids changed for %', q;
    end if;
  end loop;

  if exists (
    (select * from public.protected_areas except all select * from pg_temp.old_protected_areas)
    union all
    (select * from pg_temp.old_protected_areas except all select * from public.protected_areas)
  ) then
    raise exception 'protected_areas changed';
  end if;
  if (select row(r.*)::text from public.protected_area_filter_stats() as r)
    is distinct from (select row(r.*)::text from pg_temp.old_protected_area_filter_stats() as r) then
    raise exception 'protected_area_filter_stats changed';
  end if;
  for place in select id from public.places loop
    if (select row(r.*)::text from public.place_bounds(place.id) as r)
      is distinct from (select row(r.*)::text from pg_temp.old_place_bounds(place.id) as r) then
      raise exception 'place_bounds changed for %', place.id;
    end if;
  end loop;

  -- place_summaries has every published place, also those the list leaves out.
  if not exists (
    select 1 from public.place_summaries
    where site_pid = 'fixture-small' and area_km2 < 10
  ) or exists (select 1 from public.listed_places where site_pid = 'fixture-small') then
    raise exception 'place_summaries should hold the small place, and listed_places should not';
  end if;
  if exists (select 1 from public.place_summaries where site_pid = 'fixture-draft') then
    raise exception 'place_summaries returned a draft place';
  end if;
  if exists (select 1 from public.place_window('ecoregion')) then
    raise exception 'place_window returned a place of another type';
  end if;
  if (select place_count from public.place_filter_stats('ecoregion')) <> 0 then
    raise exception 'place_filter_stats counted a place of another type';
  end if;

  -- A merged place has no summary and no bounds.
  select id into south_id from public.places where name = 'Twin Park South';
  update public.places
  set publication_status = 'merged',
    merged_into_place_id = pg_temp.fixture_id('fixture-twin-north')
  where id = south_id;
  if exists (select 1 from public.place_summaries where id = south_id)
    or exists (select 1 from public.place_bounds(south_id)) then
    raise exception 'place_summaries or place_bounds returned a merged place';
  end if;
  update public.places
  set publication_status = 'published', merged_into_place_id = null
  where id = south_id;

  -- anon reads the generic functions and views, and never geometry.
  perform set_config('role', 'anon', true);
  if (select max(total_count) from public.place_window('conservation_area'))
    <> (select count(*) from public.protected_areas) then
    raise exception 'anon cannot read place_window';
  end if;
  perform public.place_filter_stats('conservation_area');
  perform public.place_rank('conservation_area', south_id);
  perform public.place_window_count('conservation_area');
  perform public.place_kept_ids('conservation_area');
  perform 1 from public.place_summaries;
  perform 1 from public.place_crops_percent;
  perform set_config('role', 'postgres', true);
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('place_summaries', 'listed_places', 'place_crops_percent')
      and udt_name = 'geometry'
  ) then
    raise exception 'a generic read view returns geometry';
  end if;
end $$;

-- Task 06: keep a site's parcels apart, or merge them ------------------------------

select pg_temp.fixture_place(
  'fixture-zone-core', 'fixture-zone-site', 'Zoned Park Core', 'Ia', 'MEX',
  'MULTIPOLYGON(((-100 20, -99.9 20, -99.9 20.1, -100 20.1, -100 20)))'
);
select pg_temp.fixture_place(
  'fixture-zone-buffer', 'fixture-zone-site', 'Zoned Park', 'VI', 'MEX',
  'MULTIPOLYGON(((-99.9 20, -99.7 20, -99.7 20.2, -99.9 20.2, -99.9 20)))',
  p_backfill => false
);
-- The backfill gives a boundary per site row. The second parcel gets its own shape,
-- as task 05a gave each parcel.
insert into public.place_boundaries (
  place_id, version_number, geom, source_id, source_release_id, source_record_id,
  source_url, review_status, is_current
)
select places.id, 1, places.geom, 'wdpca', details.source_release_id, 'fixture-zone-buffer',
  'https://www.protectedplanet.net/fixture-zone-site', 'approved', true
from public.places
join public.conservation_area_details as details on details.place_id = places.id
where places.id = pg_temp.fixture_id('fixture-zone-buffer');

do $$
declare
  north_id uuid := pg_temp.fixture_id('fixture-twin-north');
  south_id uuid;
  core_id uuid := pg_temp.fixture_id('fixture-zone-core');
  buffer_id uuid := pg_temp.fixture_id('fixture-zone-buffer');
  union_geom extensions.geometry;
begin
  select id into south_id from public.places where name = 'Twin Park South';

  if has_function_privilege('anon', 'public.merge_wdpa_site(text, text)', 'execute')
    or has_function_privilege('authenticated', 'public.merge_wdpa_site(text, text)', 'execute')
    or has_function_privilege('anon', 'public.keep_wdpa_site_apart(text)', 'execute')
    or has_function_privilege('authenticated', 'public.keep_wdpa_site_apart(text)', 'execute') then
    raise exception 'anon or authenticated can decide a site';
  end if;
  if not has_function_privilege('anon', 'public.place_merged_into(uuid)', 'execute') then
    raise exception 'anon cannot ask where a place was merged';
  end if;

  -- The zoned site's row is on its larger parcel and proposed, as task 05a left it.
  update public.place_source_ids
  set place_id = buffer_id, match_status = 'proposed'
  where id_kind = 'wdpa_site_id' and source_record_id = 'fixture-zone-site';

  -- Refusals: one parcel, and a row that is not proposed.
  begin
    perform public.keep_wdpa_site_apart('fixture-pilot-site');
    raise exception 'a single-parcel site was kept apart';
  exception when check_violation then null;
  end;
  begin
    perform public.merge_wdpa_site('fixture-pilot-site');
    raise exception 'a single-parcel site was merged';
  exception when check_violation then null;
  end;
  update public.place_source_ids set match_status = 'retired'
  where id_kind = 'wdpa_site_id' and source_record_id = 'fixture-zone-site';
  begin
    perform public.merge_wdpa_site('fixture-zone-site');
    raise exception 'a site with a retired row was merged';
  exception when check_violation then null;
  end;
  begin
    perform public.keep_wdpa_site_apart('fixture-zone-site');
    raise exception 'a site with a retired row was kept apart';
  exception when check_violation then null;
  end;
  update public.place_source_ids set match_status = 'proposed'
  where id_kind = 'wdpa_site_id' and source_record_id = 'fixture-zone-site';

  -- Keep apart.
  perform public.keep_wdpa_site_apart('fixture-zone-site');
  if (
    select match_status from public.place_source_ids
    where id_kind = 'wdpa_site_id' and source_record_id = 'fixture-zone-site'
      and place_id = buffer_id
  ) is distinct from 'confirmed' then
    raise exception 'keeping apart did not confirm the site row on its place';
  end if;
  if (select count(*) from public.protected_areas where id in (core_id, buffer_id)) <> 2 then
    raise exception 'a kept-apart parcel is not listed';
  end if;
  begin
    perform public.keep_wdpa_site_apart('fixture-zone-site');
    raise exception 'a confirmed site was kept apart twice';
  exception when check_violation then null;
  end;

  -- Merge.
  select extensions.st_union(geom) into union_geom
  from public.place_boundaries
  where place_id in (north_id, south_id) and is_current;
  if public.merge_wdpa_site('fixture-twin-site', 'Twin Park') <> 1 then
    raise exception 'the merge did not merge exactly one place';
  end if;
  if (select name from public.places where id = north_id) is distinct from 'Twin Park' then
    raise exception 'the kept place was not renamed';
  end if;
  if not exists (
    select 1 from public.place_boundaries
    where place_id = north_id and is_current and review_status = 'approved'
      and source_record_id = 'fixture-twin-site'
      and version_number = 3
      and extensions.st_equals(geom, union_geom)
  ) then
    raise exception 'the kept place''s current boundary is not the union';
  end if;
  if exists (select 1 from public.place_boundaries where place_id = south_id and is_current)
    or not exists (
      select 1 from public.place_boundaries
      where place_id = south_id and not is_current and superseded_at is not null
        and source_record_id = 'fixture-twin-south'
    ) then
    raise exception 'the merged parcel kept a current boundary, or lost its own';
  end if;
  if (select publication_status from public.places where id = south_id) is distinct from 'merged'
    or (select merged_into_place_id from public.places where id = south_id) is distinct from north_id then
    raise exception 'the parcel was not merged into the kept place';
  end if;
  if pg_temp.fixture_id('fixture-twin-south') is distinct from north_id then
    raise exception 'the merged SITE_PID does not point at the kept place';
  end if;
  if (
    select match_status from public.place_source_ids
    where id_kind = 'wdpa_site_id' and source_record_id = 'fixture-twin-site'
  ) is distinct from 'confirmed' then
    raise exception 'the merged site row is not confirmed';
  end if;
  if exists (
    select 1 from public.places
    where publication_status = 'published'
      and (select count(*) from public.place_boundaries as b
           where b.place_id = places.id and b.is_current) <> 1
  ) then
    raise exception 'a published place does not have exactly one current boundary';
  end if;

  if exists (select 1 from public.protected_areas where id = south_id)
    or exists (select 1 from public.place_bounds(south_id))
    or abs(
      (select area_km2 from public.protected_areas where id = north_id)
      - extensions.st_area(union_geom::extensions.geography, true) / 1e6
    ) > 1e-6 then
    raise exception 'the reads still list the merged parcel, or not the union';
  end if;

  perform set_config('role', 'anon', true);
  if public.place_merged_into(south_id) is distinct from north_id
    or public.place_merged_into(north_id) is not null
    or public.place_merged_into(gen_random_uuid()) is not null then
    raise exception 'place_merged_into does not resolve a merged place, and only that';
  end if;
  perform set_config('role', 'postgres', true);
end $$;

\echo records fixture ok
rollback;
