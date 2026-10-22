-- The public map draws the stored boundary. Do not simplify it.
-- places.geom stays ungranted. The app does not offer a polygon download.

create or replace view public.pilot_place_map
with (security_invoker = false) as
select
  places.id,
  places.name,
  places.site_id,
  sources.name as source_name,
  sources.release_month,
  places.geom
from public.places
join public.sources on sources.id = places.source_release_id
where places.place_type = 'protected_area'
  and places.realm = 'Terrestrial'
  and places.iso3 = 'ZAF'
  and places.area_km2 >= 10;

comment on view public.pilot_place_map is
  'Stored pilot boundaries for drawing on the map. The places.geom column stays ungranted, and the app does not offer a polygon download.';

revoke all on table public.pilot_place_map from public, anon, authenticated;
grant select on table public.pilot_place_map to anon, authenticated, service_role;
