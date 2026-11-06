-- The list's "In view" option timed out. Each place boundary is a large
-- geometry, and st_intersects read the whole boundary of every place whose box
-- touched the view (about 8 seconds on a cold cache, against a limit of a few
-- seconds for the anon role). Matching the boundary's bounding box uses the
-- spatial index alone. A place counts as in view when its box meets the view,
-- the same extent place_bounds gives the map.

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
    and (
      case
        when west <= east then
          places.geom operator(extensions.&&)
            extensions.st_makeenvelope(west, south, east, north, 4326)
        else
          places.geom operator(extensions.&&)
            extensions.st_makeenvelope(-180, south, east, north, 4326)
          or places.geom operator(extensions.&&)
            extensions.st_makeenvelope(west, south, 180, north, 4326)
      end
    );
$$;

comment on function public.protected_areas_in_extent(double precision, double precision, double precision, double precision) is
  'Place attributes whose bounding box meets a map view. Does not return geometry.';
