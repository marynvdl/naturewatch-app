-- Database Honing task 05, step 3: merge the parcels of each site, and read the
-- current boundary. Run supabase/backfill_boundaries.py first: the merge refuses
-- to run unless every WDPCA site has exactly one current boundary, on its kept
-- place.
-- A place is the whole WDPCA site (decisions.md, record 19). The place with the
-- largest parcel, which the site's wdpa_site_id row points at, is kept. The
-- other parcels' places become merged into it. Nothing is deleted.

-- Merge ----------------------------------------------------------------------------
-- Returns how many places it set to merged. A second call changes nothing.

create function public.merge_wdpa_site_parcels()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  merged_count integer;
begin
  if exists (
    select 1
    from public.place_source_ids as kept
    where kept.source_id = 'wdpca'
      and kept.id_kind = 'wdpa_site_id'
      and kept.match_status = 'confirmed'
      and (
        select count(*)
        from public.place_boundaries as boundary
        where boundary.place_id = kept.place_id
          and boundary.is_current
      ) <> 1
  ) or exists (
    select 1
    from public.place_boundaries as boundary
    where not exists (
      select 1
      from public.place_source_ids as kept
      where kept.place_id = boundary.place_id
        and kept.source_id = 'wdpca'
        and kept.id_kind = 'wdpa_site_id'
        and kept.match_status = 'confirmed'
    )
  ) then
    raise exception
      'run supabase/backfill_boundaries.py first: every WDPCA site needs exactly one current boundary, on its kept place'
      using errcode = 'check_violation';
  end if;

  create temp table if not exists site_parcels (
    kept_place_id uuid not null,
    site_id text not null,
    place_id uuid primary key
  );
  truncate site_parcels;

  insert into site_parcels (kept_place_id, site_id, place_id)
  select kept.place_id, kept.source_record_id, parcel.place_id
  from public.place_source_ids as kept
  join public.conservation_area_details as parcel
    on parcel.source_id = kept.source_id
    and parcel.source_record_id = kept.source_record_id
  where kept.source_id = 'wdpca'
    and kept.id_kind = 'wdpa_site_id'
    and kept.match_status = 'confirmed'
    and kept.source_record_id in (
      select details.source_record_id
      from public.conservation_area_details as details
      where details.source_id = 'wdpca'
      group by details.source_record_id
      having count(*) > 1
    );

  -- The kept place records every parcel, because one place has one designation.
  update public.conservation_area_details as details
  set source_attributes = coalesce(details.source_attributes, '{}'::jsonb)
    || jsonb_build_object('parcels', summary.parcels)
    || case
      when summary.designations > 1 then jsonb_build_object('designations_differ', true)
      else '{}'::jsonb
    end
  from (
    select
      site_parcels.kept_place_id,
      count(distinct parcel.designation) as designations,
      jsonb_agg(
        jsonb_build_object(
          'site_pid', pid.source_record_id,
          'name', places.name,
          'designation', parcel.designation,
          'iucn_category', parcel.iucn_category,
          'area_km2', places.area_km2
        )
        order by places.area_km2 desc, places.id
      ) as parcels
    from site_parcels
    join public.places on places.id = site_parcels.place_id
    join public.conservation_area_details as parcel on parcel.place_id = site_parcels.place_id
    join public.place_source_ids as pid
      on pid.place_id = site_parcels.place_id
      and pid.source_id = 'wdpca'
      and pid.id_kind = 'wdpa_site_pid'
      and pid.match_status = 'confirmed'
    group by site_parcels.kept_place_id
  ) as summary
  where details.place_id = summary.kept_place_id
    -- Before the SITE_PIDs move below, each parcel still holds its own. A second
    -- call would see them all on the kept place, so it leaves the summary alone.
    and not coalesce(details.source_attributes ? 'parcels', false);

  update public.places
  set publication_status = 'merged',
    merged_into_place_id = site_parcels.kept_place_id
  from site_parcels
  where places.id = site_parcels.place_id
    and site_parcels.place_id <> site_parcels.kept_place_id
    and places.publication_status <> 'merged';
  get diagnostics merged_count = row_count;

  update public.place_source_ids as pid
  set place_id = site_parcels.kept_place_id
  from site_parcels
  where pid.place_id = site_parcels.place_id
    and site_parcels.place_id <> site_parcels.kept_place_id
    and pid.source_id = 'wdpca'
    and pid.id_kind = 'wdpa_site_pid'
    and pid.match_status = 'confirmed';

  drop table site_parcels;

  if exists (
    select 1
    from public.places
    where publication_status = 'published'
      and not exists (
        select 1 from public.place_boundaries
        where place_boundaries.place_id = places.id and place_boundaries.is_current
      )
  ) then
    raise exception 'a published place has no current boundary after the merge';
  end if;
  if exists (
    select 1
    from public.places
    join public.facts on facts.place_id = places.id
    where places.publication_status <> 'published'
  ) then
    raise exception 'a merged place has a fact';
  end if;

  return merged_count;
end;
$$;

comment on function public.merge_wdpa_site_parcels() is
  'Task 05: merge the parcels of each WDPCA site into the kept place. Dropped with places.geom in task 08.';

revoke all on function public.merge_wdpa_site_parcels() from public, anon, authenticated;

select public.merge_wdpa_site_parcels();

-- Indexes ---------------------------------------------------------------------------
-- The backfill script builds this on the hosted database, so this is a no-op there.
-- (place_id) needs no index of its own: the version key and place_boundaries_current_key
-- both lead with it.

create index if not exists place_boundaries_geom_idx
  on public.place_boundaries using gist (geom);

-- Readers ---------------------------------------------------------------------------
-- Same names, columns, signatures, and grants. The area and box are now the
-- current boundary's. places.area_km2 and the bbox columns are no longer read here.

create or replace view public.protected_areas
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
  boundary.area_km2,
  sources.title as source_name,
  source_releases.released_on as release_month,
  source_releases.citation
from public.places
join public.place_boundaries as boundary
  on boundary.place_id = places.id
  and boundary.is_current
join public.conservation_area_details as details on details.place_id = places.id
join public.source_releases on source_releases.id = details.source_release_id
join public.sources on sources.id = source_releases.source_id
where places.place_type_id = 'conservation_area'
  and places.publication_status = 'published'
  and details.realm = 'Terrestrial'
  and boundary.area_km2 >= 10;

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
    boundary.area_km2
  from public.places
  join public.place_boundaries as boundary
    on boundary.place_id = places.id
    and boundary.is_current
  join public.conservation_area_details as details on details.place_id = places.id
  where places.place_type_id = 'conservation_area'
    and places.publication_status = 'published'
    and details.realm = 'Terrestrial'
    and boundary.area_km2 >= 10
    and boundary.bbox_south <= north
    and boundary.bbox_north >= south
    and (
      case
        when west <= east then
          boundary.bbox_west <= east and boundary.bbox_east >= west
        else
          boundary.bbox_west <= east or boundary.bbox_east >= west
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
set search_path = public
as $$
  select
    boundary.bbox_west,
    boundary.bbox_south,
    boundary.bbox_east,
    boundary.bbox_north
  from public.places
  join public.place_boundaries as boundary
    on boundary.place_id = places.id
    and boundary.is_current
  where places.id = p_id
    and places.place_type_id = 'conservation_area'
    and places.publication_status = 'published';
$$;

comment on function public.place_bounds(uuid) is
  'West, south, east, north of the current boundary of one published conservation area. Does not return geometry.';
