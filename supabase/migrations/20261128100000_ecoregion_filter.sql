-- Ecoregions task 05: the list reads take the chosen ecoregions. A place is kept when it
-- has a confirmed located_in link to one of them. Null or empty keeps every place.

drop function public.place_window(text[], text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer);
drop function public.place_window_count(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision);
drop function public.place_rank(text[], uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision);
drop function public.place_kept_ids(text[], double precision, double precision, double precision, double precision);
drop function public.place_filter_stats(text[]);
drop function public.place_matched(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision);

create function public.place_matched(
  p_place_types text[],
  p_search text,
  p_search_prefix boolean,
  p_size_min double precision,
  p_size_max double precision,
  p_crop_min double precision,
  p_crop_max double precision,
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision,
  p_ecoregion_ids uuid[]
)
returns table (
  id uuid,
  name text,
  place_type_id text,
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
  ecoregions_whole boolean;
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
  ecoregions_whole := coalesce(cardinality(p_ecoregion_ids), 0) = 0;

  if has_extent then
    return query
    select
      extent.id,
      extent.name,
      extent.place_type_id,
      extent.designation,
      extent.iso3,
      extent.area_km2,
      crops.percent
    from public.places_in_extent(p_place_types, p_west, p_south, p_east, p_north) as extent
    left join public.place_crops_percent as crops on crops.place_id = extent.id
    where (
        needle is null
        or extent.name ilike needle escape '\'
        or extent.source_place_name ilike needle escape '\'
      )
      and (p_size_min is null or extent.area_km2 >= p_size_min)
      and (p_size_max is null or extent.area_km2 <= p_size_max)
      and (
        crop_whole
        or (
          crops.percent is not null
          and crops.percent >= coalesce(p_crop_min, 0)
          and crops.percent <= coalesce(p_crop_max, 100)
        )
      )
      and (
        ecoregions_whole
        or exists (
          select 1
          from public.place_relationships as link
          where link.subject_place_id = extent.id
            and link.relationship_type_id = 'located_in'
            and link.status = 'confirmed'
            and link.retired_at is null
            and link.object_place_id = any (p_ecoregion_ids)
        )
      );
  else
    return query
    select
      listed.id,
      listed.name,
      listed.place_type_id,
      listed.designation,
      listed.iso3,
      listed.area_km2,
      crops.percent
    from public.listed_places as listed
    left join public.place_crops_percent as crops on crops.place_id = listed.id
    where listed.place_type_id = any (p_place_types)
      and (
        needle is null
        or listed.name ilike needle escape '\'
        or listed.source_place_name ilike needle escape '\'
      )
      and (p_size_min is null or listed.area_km2 >= p_size_min)
      and (p_size_max is null or listed.area_km2 <= p_size_max)
      and (
        crop_whole
        or (
          crops.percent is not null
          and crops.percent >= coalesce(p_crop_min, 0)
          and crops.percent <= coalesce(p_crop_max, 100)
        )
      )
      and (
        ecoregions_whole
        or exists (
          select 1
          from public.place_relationships as link
          where link.subject_place_id = listed.id
            and link.relationship_type_id = 'located_in'
            and link.status = 'confirmed'
            and link.retired_at is null
            and link.object_place_id = any (p_ecoregion_ids)
        )
      );
  end if;
end;
$$;

comment on function public.place_matched(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[]) is
  'Listed places of the given types that match the list search, size, cropland, optional extent, and optional ecoregions. A place matches an ecoregion through a confirmed located_in link.';

create function public.place_window(
  p_place_types text[],
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
  p_offset integer default 0,
  p_ecoregion_ids uuid[] default null
)
returns table (
  id uuid,
  name text,
  place_type_id text,
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
      p_place_types,
      p_search,
      p_search_prefix,
      p_size_min,
      p_size_max,
      p_crop_min,
      p_crop_max,
      p_west,
      p_south,
      p_east,
      p_north,
      p_ecoregion_ids
    )
  ),
  counted as (
    select count(*)::bigint as n from matched
  )
  select
    matched.id,
    matched.name,
    matched.place_type_id,
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

comment on function public.place_window(text[], text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer, uuid[]) is
  'Up to 50 matching listed places of the given types from an offset, with the number that match.';

create function public.place_window_count(
  p_place_types text[],
  p_search text default '',
  p_search_prefix boolean default false,
  p_size_min double precision default null,
  p_size_max double precision default null,
  p_crop_min double precision default 0,
  p_crop_max double precision default 100,
  p_west double precision default null,
  p_south double precision default null,
  p_east double precision default null,
  p_north double precision default null,
  p_ecoregion_ids uuid[] default null
)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::bigint
  from public.place_matched(
    p_place_types,
    p_search,
    p_search_prefix,
    p_size_min,
    p_size_max,
    p_crop_min,
    p_crop_max,
    p_west,
    p_south,
    p_east,
    p_north,
    p_ecoregion_ids
  );
$$;

comment on function public.place_window_count(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[]) is
  'How many listed places of the given types match the list query.';

create function public.place_rank(
  p_place_types text[],
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
  p_north double precision default null,
  p_ecoregion_ids uuid[] default null
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
      p_place_types,
      p_search,
      p_search_prefix,
      p_size_min,
      p_size_max,
      p_crop_min,
      p_crop_max,
      p_west,
      p_south,
      p_east,
      p_north,
      p_ecoregion_ids
    ) as matched
  ) as ranked
  where ranked.id = p_id;

  return found_position;
end;
$$;

comment on function public.place_rank(text[], uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[]) is
  'Zero-based position of one place in the list order of the given types, or null when it does not match.';

create function public.place_kept_ids(
  p_place_types text[],
  p_size_min double precision default null,
  p_size_max double precision default null,
  p_crop_min double precision default 0,
  p_crop_max double precision default 100,
  p_ecoregion_ids uuid[] default null
)
returns uuid[]
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(array_agg(matched.id), '{}'::uuid[])
  from public.place_matched(
    p_place_types,
    '',
    false,
    p_size_min,
    p_size_max,
    p_crop_min,
    p_crop_max,
    null,
    null,
    null,
    null,
    p_ecoregion_ids
  ) as matched;
$$;

comment on function public.place_kept_ids(text[], double precision, double precision, double precision, double precision, uuid[]) is
  'Ids of the given types the size, cropland, and ecoregion filter keeps on the map. Search and extent do not apply.';

create function public.place_filter_stats(
  p_place_types text[],
  p_ecoregion_ids uuid[] default null
)
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
    where listed.place_type_id = any (p_place_types)
      and (
        coalesce(cardinality(p_ecoregion_ids), 0) = 0
        or exists (
          select 1
          from public.place_relationships as link
          where link.subject_place_id = listed.id
            and link.relationship_type_id = 'located_in'
            and link.status = 'confirmed'
            and link.retired_at is null
            and link.object_place_id = any (p_ecoregion_ids)
        )
      )
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

comment on function public.place_filter_stats(text[], uuid[]) is
  'Size range and histogram counts of the listed places of the given types, for the filter charts.';

revoke all on function public.place_matched(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[]) from public;
grant execute on function public.place_matched(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[]) to anon, authenticated, service_role;
revoke all on function public.place_window(text[], text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer, uuid[]) from public;
grant execute on function public.place_window(text[], text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer, uuid[]) to anon, authenticated, service_role;
revoke all on function public.place_window_count(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[]) from public;
grant execute on function public.place_window_count(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[]) to anon, authenticated, service_role;
revoke all on function public.place_rank(text[], uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[]) from public;
grant execute on function public.place_rank(text[], uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[]) to anon, authenticated, service_role;
revoke all on function public.place_kept_ids(text[], double precision, double precision, double precision, double precision, uuid[]) from public;
grant execute on function public.place_kept_ids(text[], double precision, double precision, double precision, double precision, uuid[]) to anon, authenticated, service_role;
revoke all on function public.place_filter_stats(text[], uuid[]) from public;
grant execute on function public.place_filter_stats(text[], uuid[]) to anon, authenticated, service_role;
