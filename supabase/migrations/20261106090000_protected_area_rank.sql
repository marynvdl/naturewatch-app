-- Position of one protected area in the Places list, for the same search,
-- filters, extent, and sort that protected_area_window uses. The map reads it
-- to load the rows around a place chosen on the map.

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
    ) as matched
  ) as ranked
  where ranked.id = p_id;

  return found_position;
end;
$$;

comment on function public.protected_area_rank(uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) is
  'Zero-based position of one protected area in the list order, or null when it does not match.';

revoke all on function public.protected_area_rank(uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) from public;
grant execute on function public.protected_area_rank(uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) to anon, authenticated, service_role;
