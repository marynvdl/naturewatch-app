-- Ecoregions task 01: the ecology category, the ecoregion type, ecoregion details,
-- and the RESOLVE Ecoregions 2017 source. supabase/import_ecoregions.py loads the
-- places.

-- Category and type ---------------------------------------------------------------------

insert into public.place_categories (id, title)
values ('ecology', 'Ecology');

alter table public.place_types
  drop constraint place_types_details_kind_check,
  add constraint place_types_details_kind_check
    check (details_kind in ('conservation_area', 'recognition', 'ecoregion', 'old_growth'));

insert into public.place_types (id, place_category_id, details_kind, title)
values ('ecoregion', 'ecology', 'ecoregion', 'Ecoregion');

-- Source and release ---------------------------------------------------------------------

insert into public.sources (id, source_kind, title, publisher, url, licence_id)
values (
  'resolve-ecoregions',
  'dataset',
  'RESOLVE Ecoregions 2017',
  'RESOLVE',
  'https://ecoregions.appspot.com/',
  'cc-by-4.0'
);

-- released_on is the zip's Last-Modified date. RESOLVE gives no other release date.
insert into public.source_releases (
  id, source_id, version_label, released_on, accessed_on, download_url, checksum, citation
) values (
  gen_random_uuid(),
  'resolve-ecoregions',
  '2017',
  date '2019-05-07',
  date '2026-11-21',
  'https://storage.googleapis.com/teow2016/Ecoregions2017.zip',
  'be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60',
  'Dinerstein, E., Olson, D., Joshi, A., et al. (2017). An Ecoregion-Based Approach to Protecting Half the Terrestrial Realm. BioScience 67(6): 534–545. https://doi.org/10.1093/biosci/bix014. Data: RESOLVE Ecoregions 2017, CC BY 4.0.'
);

-- Ecoregion details ----------------------------------------------------------------------

create table public.ecoregion_details (
  place_id uuid primary key references public.places (id),
  biome text not null,
  realm text not null,
  source_id text not null references public.sources (id),
  source_release_id uuid,
  source_record_id text,
  source_url text,
  source_attributes jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ecoregion_details_source_release_fkey
    foreign key (source_release_id, source_id)
    references public.source_releases (id, source_id)
);

comment on table public.ecoregion_details is
  'One row per ecoregion. From RESOLVE Ecoregions 2017.';
comment on column public.ecoregion_details.biome is
  'RESOLVE BIOME_NAME.';
comment on column public.ecoregion_details.realm is
  'RESOLVE REALM, the biogeographic realm, for example Afrotropic.';
comment on column public.ecoregion_details.source_record_id is
  'RESOLVE ECO_ID.';
comment on column public.ecoregion_details.source_attributes is
  'The raw source row without its geometry, unvalidated.';

create trigger ecoregion_details_set_updated_at
  before update on public.ecoregion_details
  for each row execute function public.set_updated_at();

create function public.ecoregion_details_check_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.places
    join public.place_types on place_types.id = places.place_type_id
    where places.id = new.place_id
      and place_types.details_kind = 'ecoregion'
  ) then
    raise exception 'place % is not of a type with ecoregion details', new.place_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.ecoregion_details_check_type() from public, anon, authenticated;

create trigger ecoregion_details_check_type
  after insert or update of place_id on public.ecoregion_details
  for each row execute function public.ecoregion_details_check_type();

-- Reads -----------------------------------------------------------------------------------
-- Only realm changes: it is read from ecoregion_details too.

create or replace view public.place_summaries
with (security_invoker = true)
as
select
  places.id,
  coalesce(curation.display_name, places.name) as name,
  places.place_type_id,
  boundary.area_km2,
  boundary.bbox_west,
  boundary.bbox_south,
  boundary.bbox_east,
  boundary.bbox_north,
  (
    select min(ids.source_record_id)
    from public.place_source_ids as ids
    where ids.place_id = places.id
      and ids.id_kind = 'wdpa_site_pid'
      and ids.match_status = 'confirmed'
  ) as site_pid,
  coalesce(details.source_record_id, recognition.source_record_id) as site_id,
  coalesce(curation.designation, details.designation, recognition.designation) as designation,
  details.iucn_category,
  array_to_string(coalesce(curation.iso3, details.iso3, recognition.iso3), ';') as iso3,
  coalesce(details.realm, recognition.realm, ecoregion.realm) as realm,
  sources.title as source_name,
  source_releases.released_on as release_month,
  source_releases.citation,
  curation.tagline,
  curation.description,
  places.name as source_place_name,
  coalesce(details.designation, recognition.designation) as source_designation,
  array_to_string(coalesce(details.iso3, recognition.iso3), ';') as source_iso3,
  places.publication_status
from public.places
join public.place_boundaries as boundary
  on boundary.place_id = places.id
  and boundary.is_current
left join public.conservation_area_details as details on details.place_id = places.id
left join public.recognition_details as recognition on recognition.place_id = places.id
left join public.ecoregion_details as ecoregion on ecoregion.place_id = places.id
left join public.place_curations as curation on curation.place_id = places.id
left join public.sources on sources.id = boundary.source_id
left join public.source_releases on source_releases.id = boundary.source_release_id
where places.publication_status in ('published', 'withdrawn');

comment on view public.place_summaries is
  'Published and withdrawn places with their current boundary''s area and box, its source, their conservation area, recognition, or ecoregion details, and curated values over the source values. Visitors see published places only. No geometry.';

-- Access ----------------------------------------------------------------------------------

alter table public.ecoregion_details enable row level security;

create policy ecoregion_details_select
  on public.ecoregion_details
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.places
      where places.id = ecoregion_details.place_id
        and places.publication_status = 'published'
    )
  );

create policy ecoregion_details_select_admin
  on public.ecoregion_details for select to authenticated
  using ((select public.has_role('admin')));

revoke all on table public.ecoregion_details from public, anon, authenticated;
grant select on table public.ecoregion_details to anon, authenticated;
grant select, insert, update, delete on table public.ecoregion_details to service_role;
