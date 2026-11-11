-- Database Honing task 05a: undo task 05's merge of the parcels of each WDPCA site.
-- A place is one WDPCA parcel (decisions.md, record 20). Merging parcels is a
-- person's decision, through the review task 06 designs. Until then, a site with
-- several parcels keeps its wdpa_site_id row on its largest parcel, as proposed.
-- Nothing is deleted. The site unions stay as superseded boundary versions.

-- Un-merge -------------------------------------------------------------------------
-- Returns how many merged places it published again. A second call changes nothing,
-- because the first removes the parcels list it reads.

create function public.unmerge_wdpa_site_parcels()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  listed integer;
  unmerged_count integer;
  invalid_place uuid;
begin
  create temp table if not exists site_parcels (
    kept_place_id uuid not null,
    site_id text not null,
    site_pid text primary key,
    place_id uuid unique
  );
  truncate site_parcels;

  -- Each kept place lists its site's parcels. places.source_id, which held the
  -- SITE_PID, was dropped in task 04, so a parcel is found again by its site,
  -- name, designation, and area. The area went through JSON, so it is compared
  -- within 1e-9 relative.
  insert into site_parcels (kept_place_id, site_id, site_pid, place_id)
  select
    kept.place_id,
    kept.source_record_id,
    entry ->> 'site_pid',
    (
      select parcel.place_id
      from public.conservation_area_details as parcel
      join public.places on places.id = parcel.place_id
      where parcel.source_id = kept.source_id
        and parcel.source_record_id = kept.source_record_id
        and places.name = entry ->> 'name'
        and parcel.designation is not distinct from entry ->> 'designation'
        and abs(places.area_km2 - (entry ->> 'area_km2')::double precision)
          <= 1e-9 * places.area_km2
    )
  from public.conservation_area_details as kept
  cross join lateral jsonb_array_elements(kept.source_attributes -> 'parcels') as entry
  where kept.source_id = 'wdpca'
    and kept.source_attributes ? 'parcels';
  -- The scalar subquery raises if an entry matches two places, and place_id is
  -- unique, so two entries cannot match one place.

  select count(*) into listed from site_parcels;
  if listed = 0 then
    drop table site_parcels;
    return 0;
  end if;
  if exists (select 1 from site_parcels where place_id is null) then
    raise exception 'a listed parcel matches no place: SITE_PID %',
      (select min(site_pid) from site_parcels where place_id is null);
  end if;
  if exists (
    select 1
    from site_parcels
    join public.place_source_ids as pid
      on pid.source_id = 'wdpca'
      and pid.id_kind = 'wdpa_site_pid'
      and pid.match_status = 'confirmed'
      and pid.source_record_id = site_parcels.site_pid
    where pid.place_id <> site_parcels.kept_place_id
  ) or exists (
    select 1
    from site_parcels
    join public.places on places.id = site_parcels.place_id
    where (site_parcels.place_id = site_parcels.kept_place_id) =
      (places.publication_status = 'merged')
      or (places.publication_status = 'merged'
        and places.merged_into_place_id <> site_parcels.kept_place_id)
  ) then
    raise exception 'the merged parcels are not in the shape task 05 left them';
  end if;

  select site_parcels.place_id into invalid_place
  from site_parcels
  join public.places on places.id = site_parcels.place_id
  where not extensions.st_isvalid(places.geom) or extensions.st_isempty(places.geom)
  limit 1;
  if invalid_place is not null then
    raise exception 'place % has an invalid or empty geometry', invalid_place;
  end if;

  update public.places
  set publication_status = 'published',
    merged_into_place_id = null
  from site_parcels
  where places.id = site_parcels.place_id
    and site_parcels.place_id <> site_parcels.kept_place_id;
  get diagnostics unmerged_count = row_count;

  update public.place_source_ids as pid
  set place_id = site_parcels.place_id
  from site_parcels
  where pid.source_id = 'wdpca'
    and pid.id_kind = 'wdpa_site_pid'
    and pid.match_status = 'confirmed'
    and pid.source_record_id = site_parcels.site_pid;

  update public.place_source_ids as site
  set match_status = 'proposed'
  where site.source_id = 'wdpca'
    and site.id_kind = 'wdpa_site_id'
    and site.match_status = 'confirmed'
    and site.source_record_id in (select site_id from site_parcels);

  -- The site union stops being current before each parcel's own shape is added.
  update public.place_boundaries as boundary
  set is_current = false,
    superseded_at = now()
  from site_parcels
  where boundary.place_id = site_parcels.place_id
    and boundary.is_current;

  insert into public.place_boundaries (
    place_id, version_number, geom,
    source_id, source_release_id, source_record_id, source_url,
    review_status, is_current, review_note
  )
  select
    site_parcels.place_id,
    coalesce(
      (select max(version_number) from public.place_boundaries as b
       where b.place_id = site_parcels.place_id),
      0
    ) + 1,
    places.geom,
    'wdpca',
    details.source_release_id,
    site_parcels.site_pid,
    'https://www.protectedplanet.net/' || site_parcels.site_id,
    'approved',
    true,
    'The parcel''s own shape, copied from places.geom (Database Honing task 05a).'
  from site_parcels
  join public.places on places.id = site_parcels.place_id
  join public.conservation_area_details as details on details.place_id = site_parcels.place_id;

  update public.conservation_area_details as details
  set source_attributes = nullif(
    details.source_attributes - 'parcels' - 'designations_differ',
    '{}'::jsonb
  )
  where details.place_id in (select kept_place_id from site_parcels);

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
    raise exception 'a published place has no current boundary after the un-merge';
  end if;
  if exists (
    select 1
    from public.place_source_ids as pid
    join public.places on places.id = pid.place_id
    where pid.id_kind = 'wdpa_site_pid'
      and pid.match_status = 'confirmed'
      and places.publication_status = 'merged'
  ) then
    raise exception 'a SITE_PID still points at a merged place';
  end if;

  return unmerged_count;
end;
$$;

comment on function public.unmerge_wdpa_site_parcels() is
  'Task 05a: undo merge_wdpa_site_parcels(). Dropped with places.geom in task 08.';

revoke all on function public.unmerge_wdpa_site_parcels() from public, anon, authenticated;

comment on column public.place_boundaries.source_record_id is
  'For WDPCA, the SITE_PID of the parcel. Version 1 rows from task 05 hold SITE_ID, which differs from SITE_PID for 190 single-parcel sites and for the 74 superseded site unions.';
comment on column public.place_source_ids.id_kind is
  'For WDPCA: wdpa_site_pid (one parcel, the place) or wdpa_site_id (the site). A proposed wdpa_site_id marks a site whose parcels a person has not yet decided to merge or keep apart.';

select public.unmerge_wdpa_site_parcels();
