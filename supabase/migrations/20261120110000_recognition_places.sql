-- Database Honing task 09: move the recognitions out of the conservation areas.
-- One transaction. Each published conservation area whose designation names a
-- recognition gets that recognition type, its details move to recognition_details,
-- and its conservation_area_details row is deleted. Ids, boundaries, source ids,
-- and stats stay. No geometry is read or written.
--
-- The user grouped the designations on 12 November 2026 (decisions.md, record 21).
-- Grouping is by the stored designation text, WDPCA DESIG_ENG, so national-coded
-- copies of a scheme go with it. recognition_type_for_designation() is the only
-- place that list is written.

create function public.recognition_type_for_designation(p_designation text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_designation in (
      'World Heritage Site (natural or mixed)'
    ) then 'world_heritage_site'
    when p_designation in (
      'Wetland of International Importance (Ramsar Site)',
      'RAMSAR Sites',
      'RAMSAR Wetland',
      'RAMSAR'
    ) then 'ramsar_site'
    when p_designation in (
      'UNESCO-MAB Biosphere Reserve'
    ) then 'biosphere_reserve'
    when p_designation in (
      'Special Areas of Conservation (Habitats Directive)',
      'Special Protection Area (Birds Directive)',
      'Site of Community Importance (Habitats Directive)',
      'Natura 2000 SCI',
      'Natura 2000 SPA',
      'Natura 2000',
      'ZPS - Natura 2000',
      'ZSC - Natura 2000'
    ) then 'natura_2000_site'
    when p_designation in (
      'Emerald Network',
      'Emerald Sites'
    ) then 'emerald_site'
    -- The nationally coded biosphere reserves stay here, apart from UNESCO-MAB.
    when p_designation in (
      'ASEAN Heritage Park',
      'Specially Protected Area (Cartagena Convention)',
      'Marine Protected Area (OSPAR)',
      'Biosphere Reserve',
      'Biosphere polygon',
      'biosphere reserve - transition area',
      'biosphere reserve',
      'biosphere reserve - buffer zone',
      'biosphere reserve - core area',
      'Biosphere Park',
      'State Biosphere Reserve',
      'Biosphere Reserve (RB)',
      'Biosphere reserve',
      'Biosphere Reserve and Indigenous Territory',
      'Biosphere Reserve-National',
      'Biosphere Reserve-National & UNESCO-MAB'
    ) then 'other_recognition'
  end;
$$;

comment on function public.recognition_type_for_designation(text) is
  'The recognition type for a WDPCA designation, or null when it is a conservation area (decisions.md, record 21).';

-- Moves every published conservation area whose designation is a recognition, and
-- returns how many places moved to each type. A rerun moves nothing.
create function public.move_recognition_places()
returns table (recognition_type text, moved bigint)
language plpgsql
set search_path = ''
as $$
begin
  create temp table moving as
  select
    details.place_id,
    public.recognition_type_for_designation(details.designation) as type_id
  from public.conservation_area_details as details
  join public.places on places.id = details.place_id
  where places.place_type_id = 'conservation_area'
    and places.publication_status = 'published'
    and public.recognition_type_for_designation(details.designation) is not null;

  update public.places
  set place_type_id = moving.type_id
  from pg_temp.moving
  where places.id = moving.place_id;

  insert into public.recognition_details (
    place_id, designation, designation_type, iso3, realm,
    source_id, source_release_id, source_record_id, source_url, source_attributes
  )
  select
    details.place_id, details.designation, details.designation_type, details.iso3,
    details.realm, details.source_id, details.source_release_id,
    details.source_record_id, details.source_url, details.source_attributes
  from public.conservation_area_details as details
  join pg_temp.moving as moving on moving.place_id = details.place_id;

  delete from public.conservation_area_details as details
  using pg_temp.moving as moving
  where details.place_id = moving.place_id;

  return query
  select moving.type_id, count(*)
  from pg_temp.moving
  group by moving.type_id
  order by moving.type_id;

  drop table pg_temp.moving;
end;
$$;

comment on function public.move_recognition_places() is
  'Moves published conservation areas whose designation is a recognition into their recognition type. Returns the count per type.';

revoke all on function public.recognition_type_for_designation(text) from public, anon, authenticated;
revoke all on function public.move_recognition_places() from public, anon, authenticated;
grant execute on function public.recognition_type_for_designation(text) to service_role;
grant execute on function public.move_recognition_places() to service_role;

-- The move, checked against the counts of 12 November 2026. An empty local
-- database moves nothing and passes.
do $$
declare
  moved jsonb;
  expected constant jsonb := jsonb_build_object(
    'world_heritage_site', 207,
    'ramsar_site', 1087,
    'biosphere_reserve', 220,
    'natura_2000_site', 8770,
    'emerald_site', 1029,
    'other_recognition', 167
  );
begin
  select coalesce(jsonb_object_agg(result.recognition_type, result.moved), '{}'::jsonb)
  into moved
  from public.move_recognition_places() as result;

  if moved <> '{}'::jsonb and moved <> expected then
    raise exception 'recognition move counts % do not match %', moved, expected;
  end if;

  if exists (
    select 1
    from public.conservation_area_details as details
    join public.places on places.id = details.place_id
    where places.place_type_id <> 'conservation_area'
  ) or exists (
    select 1
    from public.recognition_details as details
    join public.places on places.id = details.place_id
    join public.place_types on place_types.id = places.place_type_id
    where place_types.details_kind <> 'recognition'
  ) then
    raise exception 'a place has details of another kind after the move';
  end if;
end;
$$;
