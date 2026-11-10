-- Database Honing task 04: place types, conservation area details, and source ids.
-- places keeps its ids. The place_type enum and the WDPCA columns move out of
-- places into place_types, conservation_area_details, and place_source_ids.
-- No geometry is written. Adding a column with a constant default and dropping
-- a column change only the catalog, so the places table is not rewritten.
-- Every place stays published. Task 05 merges the parcels of one site.

-- Categories and types -----------------------------------------------------------

create table public.place_categories (
  id text primary key,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.place_categories is
  'The top level of the place hierarchy. Code and policies do not depend on these ids.';

create table public.place_types (
  id text primary key,
  place_category_id text not null
    references public.place_categories (id) on update cascade,
  details_kind text,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint place_types_details_kind_check
    check (details_kind in ('conservation_area', 'recognition', 'old_growth'))
);

comment on table public.place_types is
  'What kind of thing a place is. A new type is one row.';
comment on column public.place_types.details_kind is
  'Which details table applies to places of this type, or null for none.';

insert into public.place_categories (id, title)
values ('conservation_area', 'Conservation area');

insert into public.place_types (id, place_category_id, details_kind, title)
values ('conservation_area', 'conservation_area', 'conservation_area', 'Conservation area');

create trigger place_categories_set_updated_at
  before update on public.place_categories
  for each row execute function public.set_updated_at();

create trigger place_types_set_updated_at
  before update on public.place_types
  for each row execute function public.set_updated_at();

-- places: type, publication status, merge ---------------------------------------------

alter table public.places
  add column place_type_id text not null default 'conservation_area'
    references public.place_types (id) on update cascade,
  add column publication_status text not null default 'published',
  add column merged_into_place_id uuid references public.places (id);

alter table public.places
  alter column place_type_id drop default,
  alter column publication_status set default 'draft',
  add constraint places_publication_status_check
    check (publication_status in ('draft', 'published', 'withdrawn', 'merged')),
  add constraint places_merged_into_check
    check (
      (publication_status = 'merged') = (merged_into_place_id is not null)
      and merged_into_place_id is distinct from id
    );

comment on column public.places.publication_status is
  'Whether people can see the place: draft, published, withdrawn, or merged.';
comment on column public.places.merged_into_place_id is
  'The place this one was merged into. Set only when publication_status is merged.';

create index places_place_type_id_publication_status_idx
  on public.places (place_type_id, publication_status);

-- Conservation area details --------------------------------------------------------

create table public.conservation_area_details (
  place_id uuid primary key references public.places (id),
  protection_kind text,
  designation text,
  designation_type text,
  legal_status text,
  status_year integer,
  iucn_category text,
  governance_type text,
  iso3 text[] not null,
  realm text,
  source_id text not null references public.sources (id),
  source_release_id uuid,
  source_record_id text,
  source_url text,
  source_attributes jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conservation_area_details_source_release_fkey
    foreign key (source_release_id, source_id)
    references public.source_releases (id, source_id),
  constraint conservation_area_details_protection_kind_check
    check (protection_kind in ('protected_area', 'oecm')),
  constraint conservation_area_details_designation_type_check
    check (designation_type in ('national', 'regional', 'international', 'not_applicable')),
  constraint conservation_area_details_iucn_category_check
    check (
      iucn_category in (
        'Ia',
        'Ib',
        'II',
        'III',
        'IV',
        'V',
        'VI',
        'Not Applicable',
        'Not Assigned',
        'Not Reported'
      )
    ),
  constraint conservation_area_details_iso3_check check (cardinality(iso3) > 0)
);

comment on table public.conservation_area_details is
  'One row per conservation area: WDPCA protected areas and OECMs.';
comment on column public.conservation_area_details.protection_kind is
  'From WDPCA PA_DEF. Null until an import stores it.';
comment on column public.conservation_area_details.designation is
  'English designation. For WDPCA this is DESIG_ENG.';
comment on column public.conservation_area_details.iucn_category is
  'IUCN management category. Closed WDPA set, or null when the source has none.';
comment on column public.conservation_area_details.iso3 is
  'Country codes. WDPCA lists several for some sites.';
comment on column public.conservation_area_details.source_record_id is
  'For WDPCA this is SITE_ID, used for the Protected Planet link.';
comment on column public.conservation_area_details.source_attributes is
  'The raw source row, unvalidated. Null until an import stores it.';

create trigger conservation_area_details_set_updated_at
  before update on public.conservation_area_details
  for each row execute function public.set_updated_at();

create function public.conservation_area_details_check_type()
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
      and place_types.details_kind = 'conservation_area'
  ) then
    raise exception 'place % is not of a type with conservation area details', new.place_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.conservation_area_details_check_type() from public;

create trigger conservation_area_details_check_type
  after insert or update of place_id on public.conservation_area_details
  for each row execute function public.conservation_area_details_check_type();

-- Source ids ----------------------------------------------------------------------

create table public.place_source_ids (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id),
  source_id text not null references public.sources (id),
  id_kind text not null,
  source_record_id text not null,
  match_status text not null,
  first_seen_release_id uuid references public.source_releases (id),
  last_seen_release_id uuid references public.source_releases (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint place_source_ids_match_status_check
    check (match_status in ('confirmed', 'proposed', 'retired'))
);

comment on table public.place_source_ids is
  'A place''s ids in other datasets, keyed on the source, not the release.';
comment on column public.place_source_ids.id_kind is
  'For WDPCA: wdpa_site_id (the site) or wdpa_site_pid (one parcel).';

create unique index place_source_ids_confirmed_key
  on public.place_source_ids (source_id, id_kind, source_record_id)
  where match_status = 'confirmed';

create index place_source_ids_place_id_idx on public.place_source_ids (place_id);

create trigger place_source_ids_set_updated_at
  before update on public.place_source_ids
  for each row execute function public.set_updated_at();

-- Backfill ------------------------------------------------------------------------
-- created_at keeps the time of this migration: the old columns carried no dates.

insert into public.conservation_area_details (
  place_id,
  designation,
  iucn_category,
  iso3,
  realm,
  source_id,
  source_release_id,
  source_record_id,
  source_url
)
select
  places.id,
  places.designation,
  places.iucn_category,
  string_to_array(places.iso3, ';'),
  places.realm,
  source_releases.source_id,
  places.source_release_id,
  places.site_id,
  'https://www.protectedplanet.net/' || places.site_id
from public.places
join public.source_releases on source_releases.id = places.source_release_id;

-- One row per parcel, pointing at its own place.
insert into public.place_source_ids (
  place_id, source_id, id_kind, source_record_id, match_status,
  first_seen_release_id, last_seen_release_id
)
select
  places.id,
  source_releases.source_id,
  'wdpa_site_pid',
  places.source_id,
  'confirmed',
  places.source_release_id,
  places.source_release_id
from public.places
join public.source_releases on source_releases.id = places.source_release_id;

-- One row per site, pointing at the place with the largest parcel, which task 05 keeps.
insert into public.place_source_ids (
  place_id, source_id, id_kind, source_record_id, match_status,
  first_seen_release_id, last_seen_release_id
)
select distinct on (places.site_id)
  places.id,
  source_releases.source_id,
  'wdpa_site_id',
  places.site_id,
  'confirmed',
  places.source_release_id,
  places.source_release_id
from public.places
join public.source_releases on source_releases.id = places.source_release_id
order by places.site_id, places.area_km2 desc, places.id;

do $$
begin
  if (select count(*) from public.conservation_area_details)
      <> (select count(*) from public.places)
    or (select count(*) from public.place_source_ids where id_kind = 'wdpa_site_pid')
      <> (select count(*) from public.places)
    or (select count(*) from public.place_source_ids where id_kind = 'wdpa_site_id')
      <> (select count(distinct site_id) from public.places) then
    raise exception 'the backfill did not give every place its details and source ids';
  end if;
end;
$$;

-- Readers ---------------------------------------------------------------------------
-- protected_areas keeps every column name in its order. place_type is now text.
-- iso3 stays text, joined with ';' as WDPCA writes it.

drop view public.protected_areas;

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
    details.designation,
    array_to_string(details.iso3, ';'),
    places.area_km2
  from public.places
  join public.conservation_area_details as details on details.place_id = places.id
  where places.place_type_id = 'conservation_area'
    and places.publication_status = 'published'
    and details.realm = 'Terrestrial'
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

create or replace function public.place_bounds(p_id uuid)
returns table (
  west double precision,
  south double precision,
  east double precision,
  north double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    extensions.st_xmin(box),
    extensions.st_ymin(box),
    extensions.st_xmax(box),
    extensions.st_ymax(box)
  from (
    select extensions.st_extent(places.geom)::extensions.box2d as box
    from public.places
    where places.id = p_id
      and places.place_type_id = 'conservation_area'
      and places.publication_status = 'published'
      and places.geom is not null
  ) as extent
  where box is not null;
$$;

comment on function public.place_bounds(uuid) is
  'West, south, east, north of one published conservation area. Does not return geometry.';

-- Contract ----------------------------------------------------------------------------

alter table public.places
  drop constraint places_source_feature_key,
  drop constraint places_iucn_category_check,
  drop column place_type,
  drop column source_release_id,
  drop column source_id,
  drop column site_id,
  drop column designation,
  drop column iucn_category,
  drop column iso3,
  drop column realm;

drop type public.place_type;

create view public.protected_areas
with (security_invoker = true)
as
select
  places.id,
  (
    select min(ids.source_record_id)
    from public.place_source_ids as ids
    where ids.place_id = places.id
      and ids.id_kind = 'wdpa_site_pid'
      and ids.match_status = 'confirmed'
  ) as source_id,
  details.source_record_id as site_id,
  places.name,
  places.place_type_id as place_type,
  details.designation,
  details.iucn_category,
  array_to_string(details.iso3, ';') as iso3,
  details.realm,
  places.area_km2,
  sources.title as source_name,
  source_releases.released_on as release_month,
  source_releases.citation
from public.places
join public.conservation_area_details as details on details.place_id = places.id
join public.source_releases on source_releases.id = details.source_release_id
join public.sources on sources.id = source_releases.source_id
where places.place_type_id = 'conservation_area'
  and places.publication_status = 'published'
  and details.realm = 'Terrestrial'
  and places.area_km2 >= 10;

comment on view public.protected_areas is
  'Published terrestrial conservation areas of at least 10 km2, with the source title, release month, and citation.';

revoke all on table public.protected_areas from public, anon, authenticated;
grant select on table public.protected_areas to anon, authenticated, service_role;

-- Access ------------------------------------------------------------------------------

alter policy places_select on public.places
  using (publication_status = 'published');

grant select (place_type_id, publication_status, merged_into_place_id)
  on public.places to anon, authenticated;

alter table public.place_categories enable row level security;
alter table public.place_types enable row level security;
alter table public.conservation_area_details enable row level security;
alter table public.place_source_ids enable row level security;

create policy place_categories_select
  on public.place_categories
  for select
  to anon, authenticated
  using (true);

create policy place_types_select
  on public.place_types
  for select
  to anon, authenticated
  using (true);

create policy conservation_area_details_select
  on public.conservation_area_details
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.places
      where places.id = conservation_area_details.place_id
        and places.publication_status = 'published'
    )
  );

create policy place_source_ids_select
  on public.place_source_ids
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.places
      where places.id = place_source_ids.place_id
        and places.publication_status = 'published'
    )
  );

revoke all on table public.place_categories from public, anon, authenticated;
revoke all on table public.place_types from public, anon, authenticated;
revoke all on table public.conservation_area_details from public, anon, authenticated;
revoke all on table public.place_source_ids from public, anon, authenticated;
grant select on table public.place_categories to anon, authenticated;
grant select on table public.place_types to anon, authenticated;
grant select on table public.conservation_area_details to anon, authenticated;
grant select on table public.place_source_ids to anon, authenticated;
grant select, insert, update, delete on table public.place_categories to service_role;
grant select, insert, update, delete on table public.place_types to service_role;
grant select, insert, update, delete on table public.conservation_area_details to service_role;
grant select, insert, update, delete on table public.place_source_ids to service_role;
