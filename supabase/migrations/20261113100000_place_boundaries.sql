-- Database Honing task 05, step 1: expand.
-- place_boundaries holds every boundary version of a place, with new ids.
-- Nothing reads it yet. supabase/backfill_boundaries.py fills it in committed
-- batches through backfill_place_boundaries(), then builds the GiST index.
-- 20261113110000_boundaries_readers.sql merges the parcels of each site and
-- moves the readers. places.geom, area_km2, and the bbox columns stay until
-- task 08.

create table public.place_boundaries (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id),
  version_number integer not null,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  area_km2 double precision generated always as (
    extensions.st_area(geom::extensions.geography, true) / 1e6
  ) stored,
  bbox_west double precision,
  bbox_south double precision,
  bbox_east double precision,
  bbox_north double precision,
  source_id text not null references public.sources (id),
  source_release_id uuid,
  source_record_id text,
  source_url text,
  derived_from_boundary_id uuid references public.place_boundaries (id),
  review_status text not null,
  reviewed_at timestamptz,
  review_note text,
  is_current boolean not null default false,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint place_boundaries_place_id_version_number_key
    unique (place_id, version_number),
  constraint place_boundaries_source_release_fkey
    foreign key (source_release_id, source_id)
    references public.source_releases (id, source_id),
  constraint place_boundaries_version_number_check check (version_number > 0),
  constraint place_boundaries_review_status_check
    check (review_status in ('proposed', 'approved', 'rejected', 'withdrawn')),
  constraint place_boundaries_current_check
    check (not is_current or review_status = 'approved'),
  constraint place_boundaries_approved_valid_check
    check (
      review_status <> 'approved'
      or (extensions.st_isvalid(geom) and not extensions.st_isempty(geom))
    )
);

comment on table public.place_boundaries is
  'Every boundary version of a place. At most one is current. Old versions are kept.';
comment on column public.place_boundaries.geom is
  'The boundary. Never granted to anon or authenticated. Map shapes come from PMTiles.';
comment on column public.place_boundaries.area_km2 is
  'Area on the WGS84 spheroid, in square kilometres.';
comment on column public.place_boundaries.source_record_id is
  'For WDPCA this is SITE_ID: a boundary covers the whole site.';
comment on column public.place_boundaries.is_current is
  'The boundary in use. Only an approved boundary can be current.';

-- At most one current boundary per place. It also serves joins on the current boundary.
create unique index place_boundaries_current_key
  on public.place_boundaries (place_id)
  where is_current;

create trigger place_boundaries_set_updated_at
  before update on public.place_boundaries
  for each row execute function public.set_updated_at();

create function public.place_boundaries_set_bbox()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.bbox_west := extensions.st_xmin(new.geom);
  new.bbox_south := extensions.st_ymin(new.geom);
  new.bbox_east := extensions.st_xmax(new.geom);
  new.bbox_north := extensions.st_ymax(new.geom);
  return new;
end;
$$;

revoke all on function public.place_boundaries_set_bbox() from public;

create trigger place_boundaries_set_bbox
  before insert or update of geom on public.place_boundaries
  for each row execute function public.place_boundaries_set_bbox();

-- Finds the parcels of one site. The backfill, the merge, and the importer use it.
create index conservation_area_details_source_record_idx
  on public.conservation_area_details (source_id, source_record_id);

-- Backfill ------------------------------------------------------------------------
-- One version 1 boundary per WDPCA site, on the place its wdpa_site_id row points
-- at. A site with one parcel copies places.geom. A site with several gets the
-- union of its parcels: collecting them gives an invalid MultiPolygon where
-- parcels touch or overlap. created_at is the global import, 31 October 2026.
-- Returns the last place id of the batch, or null when nothing is left.
-- A rerun skips places that already have version 1.

create function public.backfill_place_boundaries(p_after uuid, p_limit integer)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  last_id uuid;
begin
  create temp table if not exists boundary_batch (
    place_id uuid primary key,
    site_id text not null,
    parcel_count integer not null
  ) on commit drop;
  truncate boundary_batch;

  insert into boundary_batch (place_id, site_id, parcel_count)
  select kept.place_id, kept.source_record_id, parcels.n
  from public.place_source_ids as kept
  cross join lateral (
    select count(*)::integer as n
    from public.conservation_area_details as details
    where details.source_id = kept.source_id
      and details.source_record_id = kept.source_record_id
  ) as parcels
  where kept.source_id = 'wdpca'
    and kept.id_kind = 'wdpa_site_id'
    and kept.match_status = 'confirmed'
    and (p_after is null or kept.place_id > p_after)
  order by kept.place_id
  limit p_limit;

  select place_id into last_id from boundary_batch order by place_id desc limit 1;
  if last_id is null then
    return null;
  end if;

  insert into public.place_boundaries (
    place_id, version_number, geom,
    source_id, source_release_id, source_record_id, source_url,
    review_status, is_current, review_note, created_at, updated_at
  )
  select
    batch.place_id,
    1,
    places.geom,
    'wdpca',
    details.source_release_id,
    batch.site_id,
    'https://www.protectedplanet.net/' || batch.site_id,
    'approved',
    true,
    'Version 1, copied from places.geom (Database Honing task 05).',
    timestamptz '2026-10-31 00:00:00+00',
    timestamptz '2026-10-31 00:00:00+00'
  from boundary_batch as batch
  join public.places on places.id = batch.place_id
  join public.conservation_area_details as details on details.place_id = batch.place_id
  where batch.parcel_count = 1
  on conflict (place_id, version_number) do nothing;

  insert into public.place_boundaries (
    place_id, version_number, geom,
    source_id, source_release_id, source_record_id, source_url,
    review_status, is_current, review_note, created_at, updated_at
  )
  select
    batch.place_id,
    1,
    extensions.st_multi(
      extensions.st_collectionextract(extensions.st_union(places.geom), 3)
    )::extensions.geometry(MultiPolygon, 4326),
    'wdpca',
    kept_details.source_release_id,
    batch.site_id,
    'https://www.protectedplanet.net/' || batch.site_id,
    'approved',
    true,
    'Version 1, the union of the site''s parcels in places.geom (Database Honing task 05).',
    timestamptz '2026-10-31 00:00:00+00',
    timestamptz '2026-10-31 00:00:00+00'
  from boundary_batch as batch
  join public.conservation_area_details as kept_details
    on kept_details.place_id = batch.place_id
  join public.conservation_area_details as parcel
    on parcel.source_id = 'wdpca'
    and parcel.source_record_id = batch.site_id
  join public.places on places.id = parcel.place_id
  where batch.parcel_count > 1
  group by batch.place_id, batch.site_id, kept_details.source_release_id
  on conflict (place_id, version_number) do nothing;

  return last_id;
end;
$$;

comment on function public.backfill_place_boundaries(uuid, integer) is
  'Task 05 backfill: version 1 boundaries for up to p_limit sites after p_after. Dropped with places.geom in task 08.';

revoke all on function public.backfill_place_boundaries(uuid, integer)
  from public, anon, authenticated;

-- Access ------------------------------------------------------------------------------

alter table public.place_boundaries enable row level security;

create policy place_boundaries_select
  on public.place_boundaries
  for select
  to anon, authenticated
  using (
    is_current
    and exists (
      select 1 from public.places
      where places.id = place_boundaries.place_id
        and places.publication_status = 'published'
    )
  );

revoke all on table public.place_boundaries from public, anon, authenticated;
grant select (
  id,
  place_id,
  version_number,
  area_km2,
  bbox_west,
  bbox_south,
  bbox_east,
  bbox_north,
  source_id,
  source_release_id,
  source_record_id,
  source_url,
  derived_from_boundary_id,
  review_status,
  reviewed_at,
  review_note,
  is_current,
  superseded_at,
  created_at,
  updated_at
) on public.place_boundaries to anon, authenticated;
grant select, insert, update, delete on table public.place_boundaries to service_role;
