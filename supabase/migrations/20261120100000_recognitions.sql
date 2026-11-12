-- Database Honing task 09: recognition types, recognition details, relationships,
-- and the admin overlap function. Tables and functions only. The next migration,
-- 20261120110000_recognition_places.sql, moves the places.
--
-- A recognition is a place of its own (decisions.md, record 12), linked to the
-- conservation areas it is about with a recognises relationship (record 11).
-- Which WDPCA designations are recognitions is record 21.

-- Category and types ------------------------------------------------------------------

insert into public.place_categories (id, title)
values ('recognition', 'Recognition');

insert into public.place_types (id, place_category_id, details_kind, title)
values
  ('world_heritage_site', 'recognition', 'recognition', 'World Heritage'),
  ('ramsar_site', 'recognition', 'recognition', 'Ramsar'),
  ('biosphere_reserve', 'recognition', 'recognition', 'UNESCO-MAB Biosphere'),
  ('natura_2000_site', 'recognition', 'recognition', 'Natura 2000'),
  ('emerald_site', 'recognition', 'recognition', 'Emerald Network'),
  ('other_recognition', 'recognition', 'recognition', 'Other regional');

-- Recognition details -----------------------------------------------------------------

create table public.recognition_details (
  place_id uuid primary key references public.places (id),
  designation text,
  designation_type text,
  criteria text,
  iso3 text[] not null,
  realm text,
  source_id text not null references public.sources (id),
  source_release_id uuid,
  source_record_id text,
  source_url text,
  source_attributes jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recognition_details_source_release_fkey
    foreign key (source_release_id, source_id)
    references public.source_releases (id, source_id),
  constraint recognition_details_designation_type_check
    check (designation_type in ('national', 'regional', 'international', 'not_applicable')),
  constraint recognition_details_iso3_check check (cardinality(iso3) > 0)
);

comment on table public.recognition_details is
  'One row per recognition: a World Heritage Site, a Ramsar site, a Natura 2000 site, and others.';
comment on column public.recognition_details.designation is
  'English designation. For WDPCA this is DESIG_ENG.';
comment on column public.recognition_details.designation_type is
  'From WDPCA DESIG_TYPE. Null until an import stores it.';
comment on column public.recognition_details.criteria is
  'From WDPCA INT_CRIT, for example the World Heritage criteria. Null when not applicable.';
comment on column public.recognition_details.iso3 is
  'Country codes. WDPCA lists several for some sites.';
comment on column public.recognition_details.source_record_id is
  'For WDPCA this is SITE_ID, used for the Protected Planet link.';
comment on column public.recognition_details.source_attributes is
  'The raw source row, unvalidated. Null until an import stores it.';

create trigger recognition_details_set_updated_at
  before update on public.recognition_details
  for each row execute function public.set_updated_at();

create function public.recognition_details_check_type()
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
      and place_types.details_kind = 'recognition'
  ) then
    raise exception 'place % is not of a type with recognition details', new.place_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.recognition_details_check_type() from public, anon, authenticated;

create trigger recognition_details_check_type
  after insert or update of place_id on public.recognition_details
  for each row execute function public.recognition_details_check_type();

-- Relationships -------------------------------------------------------------------------

create table public.place_relationship_types (
  id text primary key,
  label text not null,
  inverse_label text not null,
  is_symmetric boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.place_relationship_types is
  'Kinds of link between two places. No type means stats can be added up.';
comment on column public.place_relationship_types.inverse_label is
  'How the object''s profile reads the link.';

insert into public.place_relationship_types (id, label, inverse_label, is_symmetric)
values
  ('part_of', 'Part of', 'Has part', false),
  ('located_in', 'Located in', 'Contains', false),
  ('recognises', 'Recognises', 'Recognised by', false),
  ('overlaps', 'Overlaps', 'Overlaps', true);

create trigger place_relationship_types_set_updated_at
  before update on public.place_relationship_types
  for each row execute function public.set_updated_at();

-- created_by and reviewed_by come with profiles in task 10.
create table public.place_relationships (
  id uuid primary key default gen_random_uuid(),
  subject_place_id uuid not null references public.places (id),
  relationship_type_id text not null
    references public.place_relationship_types (id) on update cascade,
  object_place_id uuid not null references public.places (id),
  origin text not null,
  status text not null,
  subject_boundary_id uuid references public.place_boundaries (id),
  object_boundary_id uuid references public.place_boundaries (id),
  subject_coverage double precision,
  object_coverage double precision,
  source_id text references public.sources (id),
  source_release_id uuid,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint place_relationships_source_release_fkey
    foreign key (source_release_id, source_id)
    references public.source_releases (id, source_id),
  constraint place_relationships_not_self_check
    check (subject_place_id <> object_place_id),
  constraint place_relationships_origin_check
    check (origin in ('manual', 'imported', 'derived')),
  constraint place_relationships_status_check
    check (status in ('proposed', 'confirmed', 'rejected')),
  constraint place_relationships_coverage_check
    check (
      (subject_coverage is null and object_coverage is null)
      or origin = 'derived'
    ),
  constraint place_relationships_coverage_range_check
    check (
      (subject_coverage is null or subject_coverage between 0 and 1)
      and (object_coverage is null or object_coverage between 0 and 1)
    ),
  constraint place_relationships_derived_boundaries_check
    check (
      origin <> 'derived'
      or (subject_boundary_id is not null and object_boundary_id is not null)
    )
);

comment on table public.place_relationships is
  'Typed links between places, with origin, review status, and provenance. Spatial overlap itself is not stored.';
comment on column public.place_relationships.subject_coverage is
  'Derived rows only: the share of the subject''s area inside the object.';
comment on column public.place_relationships.object_coverage is
  'Derived rows only: the share of the object''s area inside the subject. For recognises, the share of the park that is recognised.';
comment on column public.place_relationships.subject_boundary_id is
  'For a derived row, the subject boundary version used.';
comment on column public.place_relationships.retired_at is
  'Set when the link no longer applies. A retired row is kept.';

create unique index place_relationships_active_key
  on public.place_relationships (subject_place_id, relationship_type_id, object_place_id)
  where retired_at is null;

create index place_relationships_object_place_id_idx
  on public.place_relationships (object_place_id);

create trigger place_relationships_set_updated_at
  before update on public.place_relationships
  for each row execute function public.set_updated_at();

-- A symmetric link is stored once, with the smaller id as its subject. An asymmetric
-- link cannot be stored both ways while active.
create function public.place_relationships_check_direction()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_symmetric_type boolean;
begin
  if new.retired_at is not null then
    return new;
  end if;
  select is_symmetric into is_symmetric_type
  from public.place_relationship_types
  where id = new.relationship_type_id;
  if is_symmetric_type then
    if new.subject_place_id > new.object_place_id then
      raise exception 'a % link is stored with the smaller place id as its subject',
        new.relationship_type_id
        using errcode = 'check_violation';
    end if;
  elsif exists (
    select 1 from public.place_relationships as reverse
    where reverse.subject_place_id = new.object_place_id
      and reverse.object_place_id = new.subject_place_id
      and reverse.relationship_type_id = new.relationship_type_id
      and reverse.retired_at is null
  ) then
    raise exception 'the reverse % link is already stored', new.relationship_type_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.place_relationships_check_direction()
  from public, anon, authenticated;

create trigger place_relationships_check_direction
  before insert or update of subject_place_id, object_place_id, relationship_type_id, retired_at
  on public.place_relationships
  for each row execute function public.place_relationships_check_direction();

-- Overlap, on demand ------------------------------------------------------------------------
-- Every published place whose current boundary overlaps the given place's current
-- boundary, with the shared area on the spheroid. Uses the GiST index on
-- place_boundaries.geom. Nothing is stored. Admin only: it reads geometry.

create function public.place_overlaps(p_place_id uuid)
returns table (
  place_id uuid,
  place_type_id text,
  subject_boundary_id uuid,
  object_boundary_id uuid,
  intersection_km2 double precision,
  subject_coverage double precision,
  object_coverage double precision
)
language sql
stable
set search_path = ''
as $$
  select
    shared.place_id,
    shared.place_type_id,
    shared.subject_boundary_id,
    shared.object_boundary_id,
    shared.km2,
    least(shared.km2 / nullif(shared.subject_km2, 0), 1),
    least(shared.km2 / nullif(shared.object_km2, 0), 1)
  from (
    select
      other.place_id,
      places.place_type_id,
      subject.id as subject_boundary_id,
      other.id as object_boundary_id,
      subject.area_km2 as subject_km2,
      other.area_km2 as object_km2,
      extensions.st_area(
        extensions.st_intersection(subject.geom, other.geom)::extensions.geography,
        true
      ) / 1e6 as km2
    from public.place_boundaries as subject
    join public.place_boundaries as other
      on other.is_current
      and other.place_id <> subject.place_id
      and other.geom operator(extensions.&&) subject.geom
    join public.places
      on places.id = other.place_id
      and places.publication_status = 'published'
    where subject.place_id = p_place_id
      and subject.is_current
      and extensions.st_intersects(subject.geom, other.geom)
  ) as shared
  where shared.km2 > 0;
$$;

comment on function public.place_overlaps(uuid) is
  'Published places whose current boundary overlaps the given place''s, with the shared km2 and the share of each. Admin only. Not stored.';

revoke all on function public.place_overlaps(uuid) from public, anon, authenticated;
grant execute on function public.place_overlaps(uuid) to service_role;

-- Reads ---------------------------------------------------------------------------------------
-- place_summaries takes the designation, countries, realm, and site id from whichever
-- details table the place has. Same columns, in the same order.

create or replace view public.place_summaries
with (security_invoker = true)
as
select
  places.id,
  places.name,
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
  coalesce(details.designation, recognition.designation) as designation,
  details.iucn_category,
  array_to_string(coalesce(details.iso3, recognition.iso3), ';') as iso3,
  coalesce(details.realm, recognition.realm) as realm,
  sources.title as source_name,
  source_releases.released_on as release_month,
  source_releases.citation
from public.places
join public.place_boundaries as boundary
  on boundary.place_id = places.id
  and boundary.is_current
left join public.conservation_area_details as details on details.place_id = places.id
left join public.recognition_details as recognition on recognition.place_id = places.id
left join public.sources on sources.id = boundary.source_id
left join public.source_releases on source_releases.id = boundary.source_release_id
where places.publication_status = 'published';

comment on view public.place_summaries is
  'Published places with their current boundary''s area and box, its source, and their conservation area or recognition details. No geometry.';

-- Access -------------------------------------------------------------------------------------

alter table public.recognition_details enable row level security;
alter table public.place_relationship_types enable row level security;
alter table public.place_relationships enable row level security;

create policy recognition_details_select
  on public.recognition_details
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.places
      where places.id = recognition_details.place_id
        and places.publication_status = 'published'
    )
  );

create policy place_relationship_types_select
  on public.place_relationship_types
  for select
  to anon, authenticated
  using (true);

create policy place_relationships_select
  on public.place_relationships
  for select
  to anon, authenticated
  using (
    status = 'confirmed'
    and retired_at is null
    and exists (
      select 1 from public.places
      where places.id = place_relationships.subject_place_id
        and places.publication_status = 'published'
    )
    and exists (
      select 1 from public.places
      where places.id = place_relationships.object_place_id
        and places.publication_status = 'published'
    )
  );

revoke all on table public.recognition_details from public, anon, authenticated;
revoke all on table public.place_relationship_types from public, anon, authenticated;
revoke all on table public.place_relationships from public, anon, authenticated;
grant select on table public.recognition_details to anon, authenticated;
grant select on table public.place_relationship_types to anon, authenticated;
grant select on table public.place_relationships to anon, authenticated;
grant select, insert, update, delete on table public.recognition_details to service_role;
grant select, insert, update, delete on table public.place_relationship_types to service_role;
grant select, insert, update, delete on table public.place_relationships to service_role;
