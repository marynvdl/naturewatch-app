-- Database Honing task 02: hygiene.
-- Drops the unused South Africa map copy and adds created_at and updated_at
-- to every table. No existing row is rewritten.

-- The app stopped reading pilot_place_map. Its trigger still fired on every
-- places insert or update. The policy pilot_place_map_select goes with the table.
drop trigger places_sync_pilot_place_map on public.places;
drop trigger sources_sync_pilot_place_map on public.sources;
drop function public.sync_pilot_place_map();
drop table public.pilot_place_map;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Sets updated_at to the transaction time. Trigger only, before update.';

revoke all on function public.set_updated_at() from public, anon, authenticated;

-- Each column is added with a constant default, so existing rows read that
-- constant and no row is rewritten. The default then becomes now() for new rows.
--
-- places: 31 October 2026, the day of the global load. For a place, it is when
-- the row was loaded or last overwritten. The time of day is not known.
-- facts and fact_methods: 22 October 2026, the day of the facts run, Batch job
-- facts-cropland-2024-v1-20261022180517. The time of day is not known.
-- sources: the time of this migration. The row's own dates are not recorded.

alter table public.places
  add column created_at timestamptz not null default '2026-10-31 00:00:00+00',
  add column updated_at timestamptz not null default '2026-10-31 00:00:00+00';
alter table public.places
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.facts
  add column created_at timestamptz not null default '2026-10-22 00:00:00+00',
  add column updated_at timestamptz not null default '2026-10-22 00:00:00+00';
alter table public.facts
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.fact_methods
  add column created_at timestamptz not null default '2026-10-22 00:00:00+00',
  add column updated_at timestamptz not null default '2026-10-22 00:00:00+00';
alter table public.fact_methods
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.sources
  add column created_at timestamptz not null default '2026-11-10 12:00:00+00',
  add column updated_at timestamptz not null default '2026-11-10 12:00:00+00';
alter table public.sources
  alter column created_at set default now(),
  alter column updated_at set default now();

create trigger places_set_updated_at
  before update on public.places
  for each row execute function public.set_updated_at();

create trigger facts_set_updated_at
  before update on public.facts
  for each row execute function public.set_updated_at();

create trigger fact_methods_set_updated_at
  before update on public.fact_methods
  for each row execute function public.set_updated_at();

create trigger sources_set_updated_at
  before update on public.sources
  for each row execute function public.set_updated_at();

-- places grants select by column, so places.geom stays hidden.
grant select (created_at, updated_at) on table public.places to anon, authenticated;
