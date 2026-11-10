-- Database Honing task 03: sources, source releases, and licences.
-- The old sources table becomes source_releases and keeps its ids, so every
-- places.source_release_id still points at the same row. No places row changes.

-- Licences ---------------------------------------------------------------------

create table public.licences (
  id text primary key,
  title text not null,
  url text not null,
  requires_attribution boolean not null,
  share_alike boolean not null,
  allows_commercial boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.licences is
  'Terms a source or record can be used under.';

insert into public.licences (
  id, title, url, requires_attribution, share_alike, allows_commercial
) values (
  'wdpa-terms',
  'Protected Planet Terms of Use',
  'https://www.protectedplanet.net/en/legal',
  true,
  false,
  false
);

create trigger licences_set_updated_at
  before update on public.licences
  for each row execute function public.set_updated_at();

-- The old sources table becomes source_releases ----------------------------------

alter table public.sources rename to source_releases;
alter table public.source_releases rename constraint sources_pkey to source_releases_pkey;
alter table public.source_releases drop constraint sources_release_month_first;
alter policy sources_select on public.source_releases rename to source_releases_select;
alter trigger sources_set_updated_at on public.source_releases rename to source_releases_set_updated_at;

-- Sources ----------------------------------------------------------------------

create table public.sources (
  id text primary key,
  source_kind text not null,
  title text not null,
  publisher text,
  url text,
  doi text,
  authors text,
  published_year integer,
  citation text,
  licence_id text references public.licences (id),
  described_by_source_id text references public.sources (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sources_source_kind_check
    check (source_kind in ('dataset', 'publication', 'platform', 'contributors'))
);

comment on table public.sources is
  'Anything a record can come from: a dataset, a publication, a platform, or contributors.';
comment on column public.sources.citation is
  'For sources without releases. A release that names its version carries its own citation.';

insert into public.sources (id, source_kind, title, publisher, url, licence_id)
values (
  'wdpca',
  'dataset',
  'World Database on Protected and Conserved Areas',
  'UNEP-WCMC and IUCN',
  'https://www.protectedplanet.net',
  'wdpa-terms'
);

create trigger sources_set_updated_at
  before update on public.sources
  for each row execute function public.set_updated_at();

-- Reshape source_releases ----------------------------------------------------------

alter table public.source_releases
  add column source_id text references public.sources (id),
  add column version_label text,
  add column accessed_on date,
  add column citation text;

alter table public.source_releases rename column release_month to released_on;

update public.source_releases
set
  source_id = 'wdpca',
  version_label = 'October 2026',
  citation = 'UNEP-WCMC and IUCN (2026), Protected Planet: The World Database on Protected and Conserved Areas (WDPCA) [On-line], October 2026, Cambridge, UK: UNEP-WCMC and IUCN. Available at: www.protectedplanet.net.'
where name = 'WDPCA'
  and released_on = date '2026-10-01';

do $$
begin
  if exists (
    select 1 from public.source_releases
    where source_id is null or version_label is null or citation is null
  ) then
    raise exception 'a source release has no source, version label, or citation';
  end if;
end;
$$;

alter table public.source_releases
  alter column source_id set not null,
  alter column version_label set not null,
  alter column citation set not null,
  add constraint source_releases_source_id_version_label_key unique (source_id, version_label),
  add constraint source_releases_id_source_id_key unique (id, source_id);

comment on table public.source_releases is
  'One release of a source that publishes versions. Was public.sources until task 03.';
comment on column public.source_releases.released_on is
  'Release date. For WDPCA, the first day of the release month.';
comment on column public.source_releases.citation is
  'The citation for this release. WDPCA citations name the month.';

-- protected_areas keeps every column in its order and adds citation.
-- source_name now reads sources.title.
create or replace view public.protected_areas
with (security_invoker = true)
as
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
  sources.title as source_name,
  source_releases.released_on as release_month,
  source_releases.citation
from public.places
join public.source_releases on source_releases.id = places.source_release_id
join public.sources on sources.id = source_releases.source_id
where places.place_type = 'protected_area'
  and places.realm = 'Terrestrial'
  and places.area_km2 >= 10;

comment on view public.protected_areas is
  'Terrestrial protected areas of at least 10 km2, with the source title, release month, and citation.';

alter table public.source_releases drop constraint sources_name_release_month_key;
alter table public.source_releases drop column name;

-- Access -----------------------------------------------------------------------

alter table public.licences enable row level security;
alter table public.sources enable row level security;

create policy licences_select
  on public.licences
  for select
  to anon, authenticated
  using (true);

create policy sources_select
  on public.sources
  for select
  to anon, authenticated
  using (true);

revoke all on table public.licences from public, anon, authenticated;
revoke all on table public.sources from public, anon, authenticated;
grant select on table public.licences to anon, authenticated;
grant select on table public.sources to anon, authenticated;
grant select, insert, update, delete on table public.licences to service_role;
grant select, insert, update, delete on table public.sources to service_role;
