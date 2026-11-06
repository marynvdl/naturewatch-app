-- Match the map view against the stored boxes. Apply only after every row's
-- box is filled, or places without one drop out of the "In view" list.

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
    and places.bbox_south <= north
    and places.bbox_north >= south
    and (
      case
        when west <= east then
          places.bbox_west <= east and places.bbox_east >= west
        else
          places.bbox_west <= east or places.bbox_east >= west
      end
    );
$$;

comment on function public.protected_areas_in_extent(double precision, double precision, double precision, double precision) is
  'Place attributes whose boundary box meets a map view. Does not read or return geometry.';
