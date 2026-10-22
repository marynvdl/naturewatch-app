-- Simplified boundaries for the public map.
-- places.geom stays ungranted. This view is the shape the map draws.
-- It is not a download of the source polygons.

create view public.pilot_place_map
with (security_invoker = false) as
select
  places.id,
  places.name,
  places.site_id,
  sources.name as source_name,
  sources.release_month,
  extensions.st_multi(
    extensions.st_simplifypreservetopology(places.geom, 0.001)
  )::extensions.geometry(MultiPolygon, 4326) as geom
from public.places
join public.sources on sources.id = places.source_release_id
where places.place_type = 'protected_area'
  and places.realm = 'Terrestrial'
  and places.iso3 = 'ZAF'
  and places.area_km2 >= 10;

comment on view public.pilot_place_map is
  'Simplified pilot boundaries for drawing on the map. The precise places.geom column stays ungranted, and the app does not offer a polygon download.';

revoke all on table public.pilot_place_map from public, anon, authenticated;
grant select on table public.pilot_place_map to anon, authenticated, service_role;
