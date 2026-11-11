-- Database Honing task 05b: generic place reads with a place type parameter.
-- The protected_area* functions and the protected_areas view become wrappers over
-- them, with the same names, signatures, columns, and grants, until the frontend
-- moves in task 08. Functions and views only. No table, column, or data changes.

-- Views ------------------------------------------------------------------------------

-- Every published place with its current boundary's area and box, the boundary's
-- source, and its conservation area details when it has them. No geometry.
create view public.place_summaries
with (security_invoker = true)
as
select
  places.id,
  places.name,
  places.place_type_id,
  boundary.area_km2,
  boundary.bbox_west,
  boundary.bbox_south,
  boundary.bbox_east,
  boundary.bbox_north,
  (
    select min(ids.source_record_id)
    from public.place_source_ids as ids
    where ids.place_id = places.id
      and ids.id_kind = 'wdpa_site_pid'
      and ids.match_status = 'confirmed'
  ) as site_pid,
  details.source_record_id as site_id,
  details.designation,
  details.iucn_category,
  array_to_string(details.iso3, ';') as iso3,
  details.realm,
  sources.title as source_name,
  source_releases.released_on as release_month,
  source_releases.citation
from public.places
join public.place_boundaries as boundary
  on boundary.place_id = places.id
  and boundary.is_current
left join public.conservation_area_details as details on details.place_id = places.id
left join public.sources on sources.id = boundary.source_id
left join public.source_releases on source_releases.id = boundary.source_release_id
where places.publication_status = 'published';

comment on view public.place_summaries is
  'Published places with their current boundary''s area and box, its source, and conservation area details. No geometry.';

-- The places the list, the map filter, and the filter charts show. A conservation
-- area is listed when it is terrestrial and at least 10 km². This is the only place
-- that rule is written.
create view public.listed_places
with (security_invoker = true)
as
select *
from public.place_summaries
where place_summaries.place_type_id <> 'conservation_area'
  or (place_summaries.realm = 'Terrestrial' and place_summaries.area_km2 >= 10);

comment on view public.listed_places is
  'Places the list and the map show: place_summaries, with conservation areas only when terrestrial and at least 10 km2.';

-- The cropland percent of each place. The only place the crops sprout and method
-- are written. Task 07 replaces it with stat_selections.
create view public.place_crops_percent
with (security_invoker = true)
as
select facts.place_id, facts.percent
from public.facts
where facts.sprout_id = 'cropland-2024-v1'
  and facts.method_id = 'area-weighted-spheroid-v1';

comment on view public.place_crops_percent is
  'Cropland percent per place, from sprout cropland-2024-v1 and method area-weighted-spheroid-v1. Replaced by stat_selections in task 07.';

-- Generic functions -------------------------------------------------------------------

create function public.places_in_extent(
  p_place_type text,
  west double precision,
  south double precision,
  east double precision,
  north double precision
)
returns table (
  id uuid,
  name text,
  designation text,
  iso3 text,
  area_km2 double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select listed.id, listed.name, listed.designation, listed.iso3, listed.area_km2
  from public.listed_places as listed
  where listed.place_type_id = p_place_type
    and listed.bbox_south <= north
    and listed.bbox_north >= south
    and (
      case
        when west <= east then
          listed.bbox_west <= east and listed.bbox_east >= west
        else
          listed.bbox_west <= east or listed.bbox_east >= west
      end
    );
$$;

comment on function public.places_in_extent(text, double precision, double precision, double precision, double precision) is
  'Listed places of one type whose current boundary box meets a map view. Does not return geometry.';

create function public.place_matched(
  p_place_type text,
  p_search text,
  p_search_prefix boolean,
  p_size_min double precision,
  p_size_max double precision,
  p_crop_min double precision,
  p_crop_max double precision,
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision
)
returns table (
  id uuid,
  name text,
  designation text,
  iso3 text,
  area_km2 double precision,
  cropland_percent double precision
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  needle text;
  crop_whole boolean;
  has_extent boolean;
begin
  needle := nullif(btrim(coalesce(p_search, '')), '');
  if needle is not null then
    needle := replace(replace(replace(needle, '\', '\\'), '%', '\%'), '_', '\_');
    needle := case when p_search_prefix then needle || '%' else '%' || needle || '%' end;
  end if;
  crop_whole := coalesce(p_crop_min, 0) <= 0 and coalesce(p_crop_max, 100) >= 100;
  has_extent :=
    p_west is not null
    and p_south is not null
    and p_east is not null
    and p_north is not null;

  if has_extent then
    return query
    select
      extent.id,
      extent.name,
      extent.designation,
      extent.iso3,
      extent.area_km2,
      crops.percent
    from public.places_in_extent(p_place_type, p_west, p_south, p_east, p_north) as extent
    left join public.place_crops_percent as crops on crops.place_id = extent.id
    where (needle is null or extent.name ilike needle escape '\')
      and (p_size_min is null or extent.area_km2 >= p_size_min)
      and (p_size_max is null or extent.area_km2 <= p_size_max)
      and (
        crop_whole
        or (
          crops.percent is not null
          and crops.percent >= coalesce(p_crop_min, 0)
          and crops.percent <= coalesce(p_crop_max, 100)
        )
      );
  else
    return query
    select
      listed.id,
      listed.name,
      listed.designation,
      listed.iso3,
      listed.area_km2,
      crops.percent
    from public.listed_places as listed
    left join public.place_crops_percent as crops on crops.place_id = listed.id
    where listed.place_type_id = p_place_type
      and (needle is null or listed.name ilike needle escape '\')
      and (p_size_min is null or listed.area_km2 >= p_size_min)
      and (p_size_max is null or listed.area_km2 <= p_size_max)
      and (
        crop_whole
        or (
          crops.percent is not null
          and crops.percent >= coalesce(p_crop_min, 0)
          and crops.percent <= coalesce(p_crop_max, 100)
        )
      );
  end if;
end;
$$;

comment on function public.place_matched(text, text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) is
  'Listed places of one type that match the list search, size, cropland, and optional extent.';

create function public.place_window(
  p_place_type text,
  p_search text default '',
  p_search_prefix boolean default false,
  p_sort text default 'size-desc',
  p_size_min double precision default null,
  p_size_max double precision default null,
  p_crop_min double precision default 0,
  p_crop_max double precision default 100,
  p_west double precision default null,
  p_south double precision default null,
  p_east double precision default null,
  p_north double precision default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  name text,
  designation text,
  iso3 text,
  area_km2 double precision,
  cropland_percent double precision,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  sort_id text;
  page_limit integer;
  page_offset integer;
begin
  sort_id := case p_sort
    when 'name' then 'name'
    when 'size-asc' then 'size-asc'
    when 'cropland-desc' then 'cropland-desc'
    when 'cropland-asc' then 'cropland-asc'
    else 'size-desc'
  end;
  page_limit := least(greatest(coalesce(p_limit, 50), 1), 50);
  page_offset := greatest(coalesce(p_offset, 0), 0);

  return query
  with matched as (
    select *
    from public.place_matched(
      p_place_type,
      p_search,
      p_search_prefix,
      p_size_min,
      p_size_max,
      p_crop_min,
      p_crop_max,
      p_west,
      p_south,
      p_east,
      p_north
    )
  ),
  counted as (
    select count(*)::bigint as n from matched
  )
  select
    matched.id,
    matched.name,
    matched.designation,
    matched.iso3,
    matched.area_km2,
    matched.cropland_percent,
    counted.n
  from matched
  cross join counted
  order by
    case
      when sort_id in ('size-desc', 'size-asc') and matched.area_km2 is null then 1
      when sort_id in ('cropland-desc', 'cropland-asc') and matched.cropland_percent is null then 1
      else 0
    end,
    case sort_id when 'name' then matched.name end,
    case sort_id
      when 'size-desc' then -matched.area_km2
      when 'size-asc' then matched.area_km2
      when 'cropland-desc' then -matched.cropland_percent
      when 'cropland-asc' then matched.cropland_percent
    end,
    matched.name,
    matched.id
  limit page_limit offset page_offset;
end;
$$;

comment on function public.place_window(text, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer) is
  'Up to 50 matching listed places of one type from an offset, with the number that match.';

create function public.place_window_count(
  p_place_type text,
  p_search text default '',
  p_search_prefix boolean default false,
  p_size_min double precision default null,
  p_size_max double precision default null,
  p_crop_min double precision default 0,
  p_crop_max double precision default 100,
  p_west double precision default null,
  p_south double precision default null,
  p_east double precision default null,
  p_north double precision default null
)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::bigint
  from public.place_matched(
    p_place_type,
    p_search,
    p_search_prefix,
    p_size_min,
    p_size_max,
    p_crop_min,
    p_crop_max,
    p_west,
    p_south,
    p_east,
    p_north
  );
$$;

comment on function public.place_window_count(text, text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) is
  'How many listed places of one type match the list query.';

create function public.place_rank(
  p_place_type text,
  p_id uuid,
  p_search text default '',
  p_search_prefix boolean default false,
  p_sort text default 'size-desc',
  p_size_min double precision default null,
  p_size_max double precision default null,
  p_crop_min double precision default 0,
  p_crop_max double precision default 100,
  p_west double precision default null,
  p_south double precision default null,
  p_east double precision default null,
  p_north double precision default null
)
returns bigint
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  sort_id text;
  found_position bigint;
begin
  sort_id := case p_sort
    when 'name' then 'name'
    when 'size-asc' then 'size-asc'
    when 'cropland-desc' then 'cropland-desc'
    when 'cropland-asc' then 'cropland-asc'
    else 'size-desc'
  end;

  select ranked.list_position
  into found_position
  from (
    select
      matched.id,
      row_number() over (
        order by
          case
            when sort_id in ('size-desc', 'size-asc') and matched.area_km2 is null then 1
            when sort_id in ('cropland-desc', 'cropland-asc') and matched.cropland_percent is null then 1
            else 0
          end,
          case sort_id when 'name' then matched.name end,
          case sort_id
            when 'size-desc' then -matched.area_km2
            when 'size-asc' then matched.area_km2
            when 'cropland-desc' then -matched.cropland_percent
            when 'cropland-asc' then matched.cropland_percent
          end,
          matched.name,
          matched.id
      ) - 1 as list_position
    from public.place_matched(
      p_place_type,
      p_search,
      p_search_prefix,
      p_size_min,
      p_size_max,
      p_crop_min,
      p_crop_max,
      p_west,
      p_south,
      p_east,
      p_north
    ) as matched
  ) as ranked
  where ranked.id = p_id;

  return found_position;
end;
$$;

comment on function public.place_rank(text, uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) is
  'Zero-based position of one place in the list order of its type, or null when it does not match.';

create function public.place_kept_ids(
  p_place_type text,
  p_size_min double precision default null,
  p_size_max double precision default null,
  p_crop_min double precision default 0,
  p_crop_max double precision default 100
)
returns uuid[]
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(array_agg(matched.id), '{}'::uuid[])
  from public.place_matched(
    p_place_type,
    '',
    false,
    p_size_min,
    p_size_max,
    p_crop_min,
    p_crop_max,
    null,
    null,
    null,
    null
  ) as matched;
$$;

comment on function public.place_kept_ids(text, double precision, double precision, double precision, double precision) is
  'Ids of one type the size and cropland filter keeps on the map. Search and extent do not apply.';

create function public.place_filter_stats(p_place_type text)
returns table (
  place_count bigint,
  size_min double precision,
  size_max double precision,
  size_bins integer[],
  cropland_bins integer[]
)
language sql
stable
security invoker
set search_path = public
as $$
  with figured as (
    select
      listed.area_km2,
      crops.percent as cropland_percent
    from public.listed_places as listed
    left join public.place_crops_percent as crops on crops.place_id = listed.id
    where listed.place_type_id = p_place_type
  ),
  ends as (
    select
      count(*)::bigint as place_count,
      min(area_km2) as size_min,
      max(area_km2) as size_max
    from figured
  ),
  size_binned as (
    select
      case
        when ends.size_min is null or ends.size_max is null or ends.size_max <= ends.size_min then 0
        else least(
          39,
          greatest(
            0,
            floor(
              (ln(figured.area_km2) - ln(ends.size_min))
              / (ln(ends.size_max) - ln(ends.size_min))
              * 40
            )::integer
          )
        )
      end as bin
    from figured
    cross join ends
    where figured.area_km2 is not null
  ),
  crop_binned as (
    select
      least(
        39,
        greatest(0, floor(figured.cropland_percent / 100.0 * 40)::integer)
      ) as bin
    from figured
    where figured.cropland_percent is not null
  )
  select
    ends.place_count,
    ends.size_min,
    ends.size_max,
    (
      select array_agg(coalesce(counts.n, 0) order by bins.bin)
      from generate_series(0, 39) as bins(bin)
      left join (
        select size_binned.bin, count(*)::integer as n
        from size_binned
        group by size_binned.bin
      ) as counts on counts.bin = bins.bin
    ) as size_bins,
    (
      select array_agg(coalesce(counts.n, 0) order by bins.bin)
      from generate_series(0, 39) as bins(bin)
      left join (
        select crop_binned.bin, count(*)::integer as n
        from crop_binned
        group by crop_binned.bin
      ) as counts on counts.bin = bins.bin
    ) as cropland_bins
  from ends;
$$;

comment on function public.place_filter_stats(text) is
  'Size range and histogram counts of the listed places of one type, for the filter charts.';

-- place_bounds reads any published place, not only conservation areas.
create or replace function public.place_bounds(p_id uuid)
returns table (
  west double precision,
  south double precision,
  east double precision,
  north double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    boundary.bbox_west,
    boundary.bbox_south,
    boundary.bbox_east,
    boundary.bbox_north
  from public.places
  join public.place_boundaries as boundary
    on boundary.place_id = places.id
    and boundary.is_current
  where places.id = p_id
    and places.publication_status = 'published';
$$;

comment on function public.place_bounds(uuid) is
  'West, south, east, north of the current boundary of one published place. Does not return geometry.';

-- Wrappers -----------------------------------------------------------------------------
-- Same names, signatures, columns, defaults, and grants as before. Task 08 drops them.

create or replace view public.protected_areas
with (security_invoker = true)
as
select
  listed.id,
  listed.site_pid as source_id,
  listed.site_id,
  listed.name,
  listed.place_type_id as place_type,
  listed.designation,
  listed.iucn_category,
  listed.iso3,
  listed.realm,
  listed.area_km2,
  listed.source_name,
  listed.release_month,
  listed.citation
from public.listed_places as listed
where listed.place_type_id = 'conservation_area';

comment on view public.protected_areas is
  'Wrapper: listed_places of type conservation_area, with the old column names. Task 08 drops it.';

create or replace function public.protected_areas_in_extent(
  west double precision,
  south double precision,
  east double precision,
  north double precision
)
returns table (
  id uuid,
  name text,
  designation text,
  iso3 text,
  area_km2 double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select * from public.places_in_extent('conservation_area', west, south, east, north);
$$;

create or replace function public.protected_area_matched(
  p_search text,
  p_search_prefix boolean,
  p_size_min double precision,
  p_size_max double precision,
  p_crop_min double precision,
  p_crop_max double precision,
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision
)
returns table (
  id uuid,
  name text,
  designation text,
  iso3 text,
  area_km2 double precision,
  cropland_percent double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select * from public.place_matched(
    'conservation_area', p_search, p_search_prefix, p_size_min, p_size_max,
    p_crop_min, p_crop_max, p_west, p_south, p_east, p_north
  );
$$;

create or replace function public.protected_area_window(
  p_search text default '',
  p_search_prefix boolean default false,
  p_sort text default 'size-desc',
  p_size_min double precision default null,
  p_size_max double precision default null,
  p_crop_min double precision default 0,
  p_crop_max double precision default 100,
  p_west double precision default null,
  p_south double precision default null,
  p_east double precision default null,
  p_north double precision default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  name text,
  designation text,
  iso3 text,
  area_km2 double precision,
  cropland_percent double precision,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select * from public.place_window(
    'conservation_area', p_search, p_search_prefix, p_sort, p_size_min, p_size_max,
    p_crop_min, p_crop_max, p_west, p_south, p_east, p_north, p_limit, p_offset
  );
$$;

create or replace function public.protected_area_window_count(
  p_search text default '',
  p_search_prefix boolean default false,
  p_size_min double precision default null,
  p_size_max double precision default null,
  p_crop_min double precision default 0,
  p_crop_max double precision default 100,
  p_west double precision default null,
  p_south double precision default null,
  p_east double precision default null,
  p_north double precision default null
)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select public.place_window_count(
    'conservation_area', p_search, p_search_prefix, p_size_min, p_size_max,
    p_crop_min, p_crop_max, p_west, p_south, p_east, p_north
  );
$$;

create or replace function public.protected_area_rank(
  p_id uuid,
  p_search text default '',
  p_search_prefix boolean default false,
  p_sort text default 'size-desc',
  p_size_min double precision default null,
  p_size_max double precision default null,
  p_crop_min double precision default 0,
  p_crop_max double precision default 100,
  p_west double precision default null,
  p_south double precision default null,
  p_east double precision default null,
  p_north double precision default null
)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select public.place_rank(
    'conservation_area', p_id, p_search, p_search_prefix, p_sort, p_size_min,
    p_size_max, p_crop_min, p_crop_max, p_west, p_south, p_east, p_north
  );
$$;

create or replace function public.protected_area_kept_ids(
  p_size_min double precision default null,
  p_size_max double precision default null,
  p_crop_min double precision default 0,
  p_crop_max double precision default 100
)
returns uuid[]
language sql
stable
security invoker
set search_path = public
as $$
  select public.place_kept_ids('conservation_area', p_size_min, p_size_max, p_crop_min, p_crop_max);
$$;

create or replace function public.protected_area_filter_stats()
returns table (
  place_count bigint,
  size_min double precision,
  size_max double precision,
  size_bins integer[],
  cropland_bins integer[]
)
language sql
stable
security invoker
set search_path = public
as $$
  select * from public.place_filter_stats('conservation_area');
$$;

comment on function public.protected_areas_in_extent(double precision, double precision, double precision, double precision) is
  'Wrapper over places_in_extent for conservation areas. Task 08 drops it.';
comment on function public.protected_area_matched(text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) is
  'Wrapper over place_matched for conservation areas. Task 08 drops it.';
comment on function public.protected_area_window(text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer) is
  'Wrapper over place_window for conservation areas. Task 08 drops it.';
comment on function public.protected_area_window_count(text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) is
  'Wrapper over place_window_count for conservation areas. Task 08 drops it.';
comment on function public.protected_area_rank(uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) is
  'Wrapper over place_rank for conservation areas. Task 08 drops it.';
comment on function public.protected_area_kept_ids(double precision, double precision, double precision, double precision) is
  'Wrapper over place_kept_ids for conservation areas. Task 08 drops it.';
comment on function public.protected_area_filter_stats() is
  'Wrapper over place_filter_stats for conservation areas. Task 08 drops it.';

-- Grants ---------------------------------------------------------------------------------
-- The wrappers keep their grants: create or replace does not change them.

revoke all on table public.place_summaries from public, anon, authenticated;
revoke all on table public.listed_places from public, anon, authenticated;
revoke all on table public.place_crops_percent from public, anon, authenticated;
grant select on table public.place_summaries to anon, authenticated, service_role;
grant select on table public.listed_places to anon, authenticated, service_role;
grant select on table public.place_crops_percent to anon, authenticated, service_role;

revoke all on function public.places_in_extent(text, double precision, double precision, double precision, double precision) from public;
revoke all on function public.place_matched(text, text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) from public;
revoke all on function public.place_window(text, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer) from public;
revoke all on function public.place_window_count(text, text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) from public;
revoke all on function public.place_rank(text, uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) from public;
revoke all on function public.place_kept_ids(text, double precision, double precision, double precision, double precision) from public;
revoke all on function public.place_filter_stats(text) from public;

grant execute on function public.places_in_extent(text, double precision, double precision, double precision, double precision) to anon, authenticated, service_role;
grant execute on function public.place_matched(text, text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) to anon, authenticated, service_role;
grant execute on function public.place_window(text, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer) to anon, authenticated, service_role;
grant execute on function public.place_window_count(text, text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) to anon, authenticated, service_role;
grant execute on function public.place_rank(text, uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) to anon, authenticated, service_role;
grant execute on function public.place_kept_ids(text, double precision, double precision, double precision, double precision) to anon, authenticated, service_role;
grant execute on function public.place_filter_stats(text) to anon, authenticated, service_role;
