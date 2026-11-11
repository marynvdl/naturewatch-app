-- Database Honing task 06: a person's decision on a WDPCA site with several parcels.
-- A place is one parcel (decisions.md, record 20). Until a person decides, the
-- site's wdpa_site_id row is proposed, on its largest parcel. Keeping the parcels
-- apart confirms that row where it is. Merging keeps the place holding the row and
-- merges the site's other published parcels into it. Functions only. The decisions
-- are applied in 20261117110000_wdpa_site_decisions.sql.

-- The site row and the site's published parcels, or an exception.
create function public.wdpa_site_for_decision(
  p_site_id text,
  p_statuses text[],
  out site_row_id uuid,
  out kept_place_id uuid,
  out parcels integer
)
language plpgsql
set search_path = ''
as $$
begin
  select site.id, site.place_id into site_row_id, kept_place_id
  from public.place_source_ids as site
  where site.source_id = 'wdpca'
    and site.id_kind = 'wdpa_site_id'
    and site.source_record_id = p_site_id
    and site.match_status = any (p_statuses)
  for update;
  if site_row_id is null then
    raise exception 'site % has no % wdpa_site_id row', p_site_id, p_statuses
      using errcode = 'check_violation';
  end if;

  select count(*) into parcels
  from public.conservation_area_details as details
  join public.places on places.id = details.place_id
  where details.source_id = 'wdpca'
    and details.source_record_id = p_site_id
    and places.publication_status = 'published';
  if parcels < 2 then
    raise exception 'site % has % published parcels, not several', p_site_id, parcels
      using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.places
    where id = kept_place_id and publication_status = 'published'
  ) then
    raise exception 'the wdpa_site_id row of site % is not on a published place', p_site_id
      using errcode = 'check_violation';
  end if;
end;
$$;

comment on function public.wdpa_site_for_decision(text, text[]) is
  'Task 06: checks a site before a decision. Used by keep_wdpa_site_apart and merge_wdpa_site.';

-- Keep apart -----------------------------------------------------------------------
-- The site row stays on the largest parcel and becomes confirmed. On a site with
-- several published places, a confirmed wdpa_site_id means a person kept them apart.

create function public.keep_wdpa_site_apart(p_site_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  site record;
begin
  select * into site from public.wdpa_site_for_decision(p_site_id, array['proposed']);
  update public.place_source_ids
  set match_status = 'confirmed'
  where id = site.site_row_id;
end;
$$;

comment on function public.keep_wdpa_site_apart(text) is
  'Task 06: a person kept the parcels of a WDPCA site as separate places. Confirms its proposed wdpa_site_id row.';

-- Merge ----------------------------------------------------------------------------
-- The kept place gets the union of the parcels' current boundaries as its next
-- version. The other parcels become merged into it, without a current boundary, and
-- their SITE_PIDs point at it. Each superseded parcel boundary keeps its SITE_PID,
-- so a merge can be undone from stored data. Returns how many places were merged.

create function public.merge_wdpa_site(p_site_id text, p_name text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  site record;
  merged_count integer;
begin
  select * into site
  from public.wdpa_site_for_decision(p_site_id, array['proposed', 'confirmed']);

  create temp table site_parcels on commit drop as
  select details.place_id, boundary.id as boundary_id, boundary.geom
  from public.conservation_area_details as details
  join public.places on places.id = details.place_id
  join public.place_boundaries as boundary
    on boundary.place_id = details.place_id and boundary.is_current
  where details.source_id = 'wdpca'
    and details.source_record_id = p_site_id
    and places.publication_status = 'published';

  if (select count(*) from site_parcels) <> site.parcels then
    raise exception 'a parcel of site % has no current boundary', p_site_id
      using errcode = 'check_violation';
  end if;

  update public.place_boundaries
  set is_current = false, superseded_at = now()
  where id in (select boundary_id from site_parcels);

  insert into public.place_boundaries (
    place_id, version_number, geom,
    source_id, source_release_id, source_record_id, source_url,
    review_status, reviewed_at, is_current, review_note
  )
  select
    site.kept_place_id,
    (select max(version_number) + 1 from public.place_boundaries
     where place_id = site.kept_place_id),
    extensions.st_multi(extensions.st_union(site_parcels.geom)),
    'wdpca',
    (select source_release_id from public.place_boundaries
     where id = (select boundary_id from site_parcels where place_id = site.kept_place_id)),
    p_site_id,
    'https://www.protectedplanet.net/' || p_site_id,
    'approved',
    now(),
    true,
    'The union of the site''s ' || site.parcels || ' parcels, merged by a person (Database Honing task 06).'
  from site_parcels;

  update public.places
  set publication_status = 'merged', merged_into_place_id = site.kept_place_id
  where id in (select place_id from site_parcels where place_id <> site.kept_place_id);
  get diagnostics merged_count = row_count;

  update public.place_source_ids
  set place_id = site.kept_place_id
  where source_id = 'wdpca'
    and id_kind = 'wdpa_site_pid'
    and match_status = 'confirmed'
    and place_id in (select place_id from site_parcels where place_id <> site.kept_place_id);

  update public.place_source_ids
  set match_status = 'confirmed'
  where id = site.site_row_id;

  if p_name is not null then
    update public.places set name = p_name where id = site.kept_place_id;
  end if;

  drop table site_parcels;
  return merged_count;
end;
$$;

comment on function public.merge_wdpa_site(text, text) is
  'Task 06: a person merged the parcels of a WDPCA site into the place holding its wdpa_site_id row. Optionally renames it.';

-- Where a merged place went --------------------------------------------------------
-- A link to a merged parcel, from the tiles or a bookmark, opens the place it was
-- merged into. places_select hides merged places from anon, so this is security definer
-- and returns only an id.

create function public.place_merged_into(p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with recursive chain as (
    select id, merged_into_place_id, publication_status, 0 as depth
    from public.places
    where id = p_id and publication_status = 'merged'
    union all
    select places.id, places.merged_into_place_id, places.publication_status, chain.depth + 1
    from chain
    join public.places on places.id = chain.merged_into_place_id
    where chain.publication_status = 'merged' and chain.depth < 10
  )
  select id from chain where publication_status = 'published' limit 1;
$$;

comment on function public.place_merged_into(uuid) is
  'Task 06: for a merged place, the published place it was merged into. Null otherwise.';

revoke all on function public.wdpa_site_for_decision(text, text[]) from public, anon, authenticated;
revoke all on function public.keep_wdpa_site_apart(text) from public, anon, authenticated;
revoke all on function public.merge_wdpa_site(text, text) from public, anon, authenticated;
revoke all on function public.place_merged_into(uuid) from public;
grant execute on function public.place_merged_into(uuid) to anon, authenticated, service_role;
