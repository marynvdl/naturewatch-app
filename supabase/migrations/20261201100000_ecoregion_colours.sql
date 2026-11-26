-- Wayfinding task 04: the map fills ecoregions in RESOLVE's colours when zoomed out.
-- Returns each published ecoregion's RESOLVE COLOR. Does not return geometry.

create function public.ecoregion_colours()
returns table (id uuid, colour text)
language sql
stable
security definer
set search_path = ''
as $$
  select places.id, details.source_attributes->>'COLOR'
  from public.places
  join public.ecoregion_details as details on details.place_id = places.id
  where places.place_type_id = 'ecoregion'
    and places.publication_status = 'published'
    and details.source_attributes->>'COLOR' ~ '^#[0-9A-Fa-f]{6}$';
$$;

comment on function public.ecoregion_colours() is
  'RESOLVE COLOR of each published ecoregion, which the map paints its fill with.';

revoke all on function public.ecoregion_colours() from public;
grant execute on function public.ecoregion_colours() to anon, authenticated, service_role;
