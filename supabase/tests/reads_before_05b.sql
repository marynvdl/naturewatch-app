-- The read path as it was before task 05b (20261113110000_boundaries_readers.sql,
-- 20261030100000_protected_areas.sql, 20261106090000_protected_area_rank.sql), as
-- temp objects named old_*. records_fixture.sql compares them with the wrappers.
-- Remove this file with the wrappers in task 08.

create temp view old_protected_areas
with (security_invoker = true)
as
select
  places.id,
  (
    select min(ids.source_record_id)
    from public.place_source_ids as ids
    where ids.place_id = places.id
      and ids.id_kind = 'wdpa_site_pid'
      and ids.match_status = 'confirmed'
  ) as source_id,
  details.source_record_id as site_id,
  places.name,
  places.place_type_id as place_type,
  details.designation,
  details.iucn_category,
  array_to_string(details.iso3, ';') as iso3,
  details.realm,
  boundary.area_km2,
  sources.title as source_name,
  source_releases.released_on as release_month,
  source_releases.citation
from public.places
join public.place_boundaries as boundary
  on boundary.place_id = places.id
  and boundary.is_current
join public.conservation_area_details as details on details.place_id = places.id
join public.source_releases on source_releases.id = details.source_release_id
join public.sources on sources.id = source_releases.source_id
where places.place_type_id = 'conservation_area'
  and places.publication_status = 'published'
  and details.realm = 'Terrestrial'
  and boundary.area_km2 >= 10;

create function pg_temp.old_protected_areas_in_extent(
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
  select
    places.id,
    places.name,
    details.designation,
    array_to_string(details.iso3, ';'),
    boundary.area_km2
  from public.places
  join public.place_boundaries as boundary
    on boundary.place_id = places.id
    and boundary.is_current
  join public.conservation_area_details as details on details.place_id = places.id
  where places.place_type_id = 'conservation_area'
    and places.publication_status = 'published'
    and details.realm = 'Terrestrial'
    and boundary.area_km2 >= 10
    and boundary.bbox_south <= north
    and boundary.bbox_north >= south
    and (
      case
        when west <= east then
          boundary.bbox_west <= east and boundary.bbox_east >= west
        else
          boundary.bbox_west <= east or boundary.bbox_east >= west
      end
    );
$$;

create function pg_temp.old_place_bounds(p_id uuid)
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
    and places.place_type_id = 'conservation_area'
    and places.publication_status = 'published';
$$;

create function pg_temp.old_protected_area_matched(
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
      facts.percent
    from pg_temp.old_protected_areas_in_extent(p_west, p_south, p_east, p_north) as extent
    left join public.facts
      on facts.place_id = extent.id
      and facts.sprout_id = 'cropland-2024-v1'
      and facts.method_id = 'area-weighted-spheroid-v1'
    where (needle is null or extent.name ilike needle escape '\')
      and (p_size_min is null or extent.area_km2 >= p_size_min)
      and (p_size_max is null or extent.area_km2 <= p_size_max)
      and (
        crop_whole
        or (
          facts.percent is not null
          and facts.percent >= coalesce(p_crop_min, 0)
          and facts.percent <= coalesce(p_crop_max, 100)
        )
      );
  else
    return query
    select
      places.id,
      places.name,
      places.designation,
      places.iso3,
      places.area_km2,
      facts.percent
    from pg_temp.old_protected_areas as places
    left join public.facts
      on facts.place_id = places.id
      and facts.sprout_id = 'cropland-2024-v1'
      and facts.method_id = 'area-weighted-spheroid-v1'
    where (needle is null or places.name ilike needle escape '\')
      and (p_size_min is null or places.area_km2 >= p_size_min)
      and (p_size_max is null or places.area_km2 <= p_size_max)
      and (
        crop_whole
        or (
          facts.percent is not null
          and facts.percent >= coalesce(p_crop_min, 0)
          and facts.percent <= coalesce(p_crop_max, 100)
        )
      );
  end if;
end;
$$;
create function pg_temp.old_protected_area_window(
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
    from pg_temp.old_protected_area_matched(
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
create function pg_temp.old_protected_area_window_count(
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
  from pg_temp.old_protected_area_matched(
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
create function pg_temp.old_protected_area_kept_ids(
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
  from pg_temp.old_protected_area_matched(
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
create function pg_temp.old_protected_area_filter_stats()
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
      places.area_km2,
      facts.percent as cropland_percent
    from pg_temp.old_protected_areas as places
    left join public.facts
      on facts.place_id = places.id
      and facts.sprout_id = 'cropland-2024-v1'
      and facts.method_id = 'area-weighted-spheroid-v1'
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

create function pg_temp.old_protected_area_rank(
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
    from pg_temp.old_protected_area_matched(
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
