-- The map reads a table, so row-level security applies.
-- places.geom stays ungranted. The trigger copies the pilot boundaries.

drop view public.pilot_place_map;

create table public.pilot_place_map (
  id uuid primary key references public.places (id) on delete cascade,
  name text not null,
  site_id text,
  source_name text not null,
  release_month date not null,
  geom extensions.geometry(MultiPolygon, 4326) not null
);

comment on table public.pilot_place_map is
  'Stored pilot boundaries for drawing on the map. The places.geom column stays ungranted, and the app does not offer a polygon download.';

insert into public.pilot_place_map (
  id,
  name,
  site_id,
  source_name,
  release_month,
  geom
)
select
  places.id,
  places.name,
  places.site_id,
  sources.name,
  sources.release_month,
  places.geom
from public.places
join public.sources on sources.id = places.source_release_id
where places.place_type = 'protected_area'
  and places.realm = 'Terrestrial'
  and places.iso3 = 'ZAF'
  and places.area_km2 >= 10;

alter table public.pilot_place_map enable row level security;

create policy pilot_place_map_select
  on public.pilot_place_map
  for select
  to anon, authenticated
  using (true);

revoke all on table public.pilot_place_map from public, anon, authenticated, service_role;
grant select on table public.pilot_place_map to anon, authenticated, service_role;

create or replace function public.sync_pilot_place_map()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if tg_table_name is null then
    raise exception 'sync_pilot_place_map runs only as a trigger';
  end if;

  if tg_table_name = 'sources' then
    update public.pilot_place_map as mapped
    set
      source_name = new.name,
      release_month = new.release_month
    from public.places
    where places.id = mapped.id
      and places.source_release_id = new.id;
    return new;
  end if;

  if new.place_type = 'protected_area'
    and new.realm = 'Terrestrial'
    and new.iso3 = 'ZAF'
    and new.area_km2 >= 10
  then
    insert into public.pilot_place_map (
      id,
      name,
      site_id,
      source_name,
      release_month,
      geom
    )
    select
      new.id,
      new.name,
      new.site_id,
      sources.name,
      sources.release_month,
      new.geom
    from public.sources
    where sources.id = new.source_release_id
    on conflict (id) do update
    set
      name = excluded.name,
      site_id = excluded.site_id,
      source_name = excluded.source_name,
      release_month = excluded.release_month,
      geom = excluded.geom;
  else
    delete from public.pilot_place_map where id = new.id;
  end if;

  return new;
end;
$$;

comment on function public.sync_pilot_place_map() is
  'Copies a pilot place into pilot_place_map. Trigger only.';

revoke all on function public.sync_pilot_place_map() from public, anon, authenticated;
grant execute on function public.sync_pilot_place_map() to service_role;

create trigger places_sync_pilot_place_map
after insert or update on public.places
for each row
execute function public.sync_pilot_place_map();

create trigger sources_sync_pilot_place_map
after update of name, release_month on public.sources
for each row
execute function public.sync_pilot_place_map();
