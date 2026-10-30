-- October 2026 WDPCA is the global public zip.
-- pilot_places and the list extent cover every country.
-- pilot_place_map stays the South Africa copy. places.geom stays ungranted.

update public.sources
set
  download_url = 'https://pp-import-production.s3.eu-west-1.amazonaws.com/WDPA_WDOECM_Oct2026_Public.zip',
  checksum = 'f5f5e50f230923619ad60faf8296e4f39a4d8c1b14bb6ea80e82ea6db6292b1c'
where name = 'WDPCA'
  and release_month = date '2026-10-01';

create or replace view public.pilot_places
with (security_invoker = true) as
select
  places.id,
  places.source_id,
  places.site_id,
  places.name,
  places.place_type,
  places.designation,
  places.iucn_category,
  places.iso3,
  places.realm,
  places.area_km2,
  sources.name as source_name,
  sources.release_month
from public.places
join public.sources on sources.id = places.source_release_id
where places.place_type = 'protected_area'
  and places.realm = 'Terrestrial'
  and places.area_km2 >= 10;

comment on view public.pilot_places is
  'Terrestrial protected areas of at least 10 km2, with the source release month.';

revoke all on table public.pilot_places from public, anon, authenticated;
grant select on table public.pilot_places to anon, authenticated, service_role;

create or replace function public.pilot_places_in_extent(
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

comment on function public.pilot_places_in_extent(double precision, double precision, double precision, double precision) is
  'Place attributes whose boundary meets a map view. Does not return geometry.';
