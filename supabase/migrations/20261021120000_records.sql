-- Records: one WDPCA release, places, and an empty facts table.
-- anon and authenticated can read place attributes. They cannot read places.geom.

create extension if not exists postgis with schema extensions;

create type public.place_type as enum (
  'wild_space',
  'protected_area',
  'ecoregion',
  'country',
  'river_catchment'
);

create table public.sources (
  id uuid primary key,
  name text not null,
  release_month date not null,
  download_url text not null,
  checksum text not null,
  constraint sources_release_month_first check (extract(day from release_month) = 1),
  constraint sources_name_release_month_key unique (name, release_month)
);

comment on table public.sources is
  'Dataset release a place was loaded from.';
comment on column public.sources.release_month is
  'First day of the release month.';
comment on column public.sources.checksum is
  'SHA-256 hex digest of the file at download_url.';

insert into public.sources (id, name, release_month, download_url, checksum)
values (
  'a0c3e5b2-7d14-4f6a-9c88-2b6e1d0a94f3',
  'WDPCA',
  date '2026-10-01',
  'https://d1gam3xoknrgr2.cloudfront.net/current/WDPA_WDOECM_Oct2026_Public_ZAF.zip',
  '5e55ad223986b4d9e2afdb1fad5d9ec0591e18e2ebb0e5bf71dfa344f0f93447'
);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  source_release_id uuid not null references public.sources (id),
  source_id text not null,
  site_id text,
  name text not null,
  place_type public.place_type not null,
  designation text,
  iucn_category text,
  iso3 text,
  realm text,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  area_km2 double precision generated always as (
    extensions.st_area(geom::extensions.geography, true) / 1e6
  ) stored,
  constraint places_source_feature_key unique (source_release_id, source_id),
  constraint places_iucn_category_check check (
    iucn_category is null
    or iucn_category in (
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
  )
);

comment on column public.places.source_id is
  'Feature id from the source. For WDPCA this is SITE_PID, unique within the release.';
comment on column public.places.site_id is
  'Site id from the source. For WDPCA this is SITE_ID, used for the Protected Planet link.';
comment on column public.places.designation is
  'English designation. For WDPCA this is DESIG_ENG.';
comment on column public.places.iucn_category is
  'IUCN management category. Closed WDPA set, or null when the source has none.';
comment on column public.places.area_km2 is
  'Spheroidal area in square kilometres on the WGS84 spheroid.';
comment on column public.places.geom is
  'Boundary in EPSG:4326. Not granted to anon or authenticated.';

create index places_geom_idx on public.places using gist (geom);

alter table public.places enable row level security;

create policy places_select
  on public.places
  for select
  to anon, authenticated
  using (true);

revoke all on table public.places from public, anon, authenticated;
grant select (
  id,
  source_release_id,
  source_id,
  site_id,
  name,
  place_type,
  designation,
  iucn_category,
  iso3,
  realm,
  area_km2
) on public.places to anon, authenticated;

create table public.facts (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete restrict,
  layer text not null,
  layer_version text not null,
  area_km2 double precision not null,
  percent double precision not null,
  valid_coverage double precision not null,
  constraint facts_place_layer_version_key unique (place_id, layer, layer_version)
);

comment on table public.facts is
  'One row per place, layer, and layer version. Empty until facts are calculated.';

revoke all on table public.sources from public, anon, authenticated;
grant select on table public.sources to anon, authenticated;

revoke all on table public.facts from public, anon, authenticated;
grant select on table public.facts to anon, authenticated;

grant select, insert, update, delete on table public.sources to service_role;
grant select, insert, update, delete on table public.places to service_role;
grant select, insert, update, delete on table public.facts to service_role;

create view public.pilot_places
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
  and places.iso3 = 'ZAF'
  and places.area_km2 >= 10;

comment on view public.pilot_places is
  'Terrestrial South African protected areas of at least 10 km2, with the source release month.';

revoke all on table public.pilot_places from public, anon, authenticated;
grant select on table public.pilot_places to anon, authenticated, service_role;
