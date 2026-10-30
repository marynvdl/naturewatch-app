-- The worldwide read model is protected_areas.
-- pilot_place_map stays the South Africa copy. places.geom stays ungranted.

alter view public.pilot_places rename to protected_areas;

comment on view public.protected_areas is
  'Terrestrial protected areas of at least 10 km2, with the source release month.';

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
set search_path = public, extensions
as $$
  select
    places.id,
    places.name,
    places.designation,
    places.iso3,
    places.area_km2
  from public.places
  where places.place_type = 'protected_area'
    and places.realm = 'Terrestrial'
    and places.area_km2 >= 10
    and extensions.st_intersects(
      places.geom,
      case
        when west <= east then
          extensions.st_makeenvelope(west, south, east, north, 4326)
        else
          extensions.st_union(
            extensions.st_makeenvelope(-180, south, east, north, 4326),
            extensions.st_makeenvelope(west, south, 180, north, 4326)
          )
      end
    );
$$;

comment on function public.protected_areas_in_extent(double precision, double precision, double precision, double precision) is
  'Place attributes whose boundary meets a map view. Does not return geometry.';

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
    from public.protected_areas_in_extent(p_west, p_south, p_east, p_north) as extent
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
    from public.protected_areas as places
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

comment on function public.protected_area_matched(text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) is
  'Protected area attributes that match the list search, size, cropland, and optional extent.';

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
    from public.protected_area_matched(
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

comment on function public.protected_area_window(text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer) is
  'Up to 50 matching protected areas from an offset, with the number that match.';

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
  select count(*)::bigint
  from public.protected_area_matched(
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

comment on function public.protected_area_window_count(text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) is
  'How many stored protected areas match the list query.';

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
  select coalesce(array_agg(matched.id), '{}'::uuid[])
  from public.protected_area_matched(
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

comment on function public.protected_area_kept_ids(double precision, double precision, double precision, double precision) is
  'Ids the size and cropland filter keeps on the map. Search and extent do not apply.';

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
  with figured as (
    select
      places.area_km2,
      facts.percent as cropland_percent
    from public.protected_areas as places
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

comment on function public.protected_area_filter_stats() is
  'Stored size range and histogram counts for the filter charts. Does not return each place.';

revoke all on function public.protected_areas_in_extent(double precision, double precision, double precision, double precision) from public;
revoke all on function public.protected_area_matched(text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) from public;
revoke all on function public.protected_area_window(text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer) from public;
revoke all on function public.protected_area_window_count(text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) from public;
revoke all on function public.protected_area_kept_ids(double precision, double precision, double precision, double precision) from public;
revoke all on function public.protected_area_filter_stats() from public;

grant execute on function public.protected_areas_in_extent(double precision, double precision, double precision, double precision) to anon, authenticated, service_role;
grant execute on function public.protected_area_matched(text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) to anon, authenticated, service_role;
grant execute on function public.protected_area_window(text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer) to anon, authenticated, service_role;
grant execute on function public.protected_area_window_count(text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) to anon, authenticated, service_role;
grant execute on function public.protected_area_kept_ids(double precision, double precision, double precision, double precision) to anon, authenticated, service_role;
grant execute on function public.protected_area_filter_stats() to anon, authenticated, service_role;

drop function public.pilot_place_window(text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer);
drop function public.pilot_place_window_count(text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision);
drop function public.pilot_place_kept_ids(double precision, double precision, double precision, double precision);
drop function public.pilot_place_filter_stats();
drop function public.pilot_place_matched(text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision);
drop function public.pilot_places_in_extent(double precision, double precision, double precision, double precision);
