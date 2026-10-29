-- Extent of one place, so the map can move to a place drawn from tiles.
-- places.geom stays ungranted. The function returns four numbers, not the shape.

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
set search_path = public, extensions
as $$
  select
    extensions.st_xmin(box),
    extensions.st_ymin(box),
    extensions.st_xmax(box),
    extensions.st_ymax(box)
  from (
    select extensions.st_extent(places.geom)::extensions.box2d as box
    from public.places
    where places.id = p_id
      and places.place_type = 'protected_area'
      and places.geom is not null
  ) as extent
  where box is not null;
$$;

comment on function public.place_bounds(uuid) is
  'West, south, east, north of one protected area. Does not return geometry.';

revoke all on function public.place_bounds(uuid) from public;
grant execute on function public.place_bounds(uuid) to anon, authenticated, service_role;
