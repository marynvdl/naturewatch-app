-- Wayfinding task 03: after a filter is applied, the map fits the places it keeps.
-- Reads the stored boundary boxes. Does not return geometry.

create function public.place_extent(
  p_place_types text[],
  p_size_min double precision default null,
  p_size_max double precision default null,
  p_ecoregion_ids uuid[] default null
)
returns table (
  west double precision,
  south double precision,
  east double precision,
  north double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    min(listed.bbox_west),
    min(listed.bbox_south),
    max(listed.bbox_east),
    max(listed.bbox_north)
  from public.place_matched(
    p_place_types,
    '',
    false,
    p_size_min,
    p_size_max,
    0,
    100,
    null,
    null,
    null,
    null,
    p_ecoregion_ids
  ) as matched
  join public.listed_places as listed on listed.id = matched.id
  having count(*) > 0;
$$;

comment on function public.place_extent(text[], double precision, double precision, uuid[]) is
  'West, south, east, north around the listed places of the given types that the size and ecoregion filter keeps. No row when none is kept.';

revoke all on function public.place_extent(text[], double precision, double precision, uuid[]) from public;
grant execute on function public.place_extent(text[], double precision, double precision, uuid[]) to anon, authenticated, service_role;
