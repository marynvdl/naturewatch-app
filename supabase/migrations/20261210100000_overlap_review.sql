-- Shaping Boundaries task 04: overlap review queue.
-- review_overlap() gives a proposed link one decision: keep it, not related, or, for
-- two conservation areas, same place (hide one). Back to review undoes it. The queue
-- is a filter on the places list: the list reads take p_overlap_review, and
-- overlap_review_notes() gives the cards their notes. The pairs of conservation areas
-- are computed on a laptop (derive_overlaps.py). Design in design.md §4.5.

-- The text a Same place decision writes, as the withdrawal reason and the Stats note.
create function public.same_place_reason(p_other_place_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select left('Same place as ' || coalesce(places.name, places.id::text), 80)
  from public.places
  where places.id = p_other_place_id;
$$;

comment on function public.same_place_reason(uuid) is
  'The reason a Same place decision gives the hidden place: "Same place as <name>", cut to 80 characters. Used by review_overlap.';

revoke all on function public.same_place_reason(uuid) from public, anon, authenticated;

-- The decision ---------------------------------------------------------------------------
create function public.review_overlap(
  p_link_id uuid,
  p_decision text,
  p_hide_place_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  link public.place_relationships;
  link_status text;
  kept_id uuid;
  reason text;
  hidden record;
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can review a link.' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('keep', 'not_related', 'same_place', 'undo') then
    raise exception 'The decision must be keep, not_related, same_place, or undo.'
      using errcode = '22023';
  end if;
  select * into link
  from public.place_relationships as r
  where r.id = p_link_id
  for update;
  if not found then
    raise exception 'No link has this id.' using errcode = 'P0002';
  end if;
  if link.retired_at is not null then
    raise exception 'This link is retired.' using errcode = '22023';
  end if;

  if p_decision in ('keep', 'not_related', 'same_place') then
    if link.status <> 'proposed' then
      raise exception 'This link has been reviewed. Choose Back to review first.'
        using errcode = '22023';
    end if;
  end if;

  if p_decision = 'same_place' then
    if link.relationship_type_id <> 'overlaps' then
      raise exception 'Only two overlapping conservation areas can be the same place.'
        using errcode = '22023';
    end if;
    if (
      select count(*) from public.places
      where places.id in (link.subject_place_id, link.object_place_id)
        and places.place_type_id = 'conservation_area'
    ) <> 2 then
      raise exception 'Only two overlapping conservation areas can be the same place.'
        using errcode = '22023';
    end if;
    if p_hide_place_id is null
      or p_hide_place_id not in (link.subject_place_id, link.object_place_id) then
      raise exception 'The place to hide must be one end of the link.' using errcode = '22023';
    end if;
    kept_id := case when p_hide_place_id = link.subject_place_id
      then link.object_place_id else link.subject_place_id end;
    reason := public.same_place_reason(kept_id);
    update public.places
    set publication_status = 'withdrawn',
      withdrawal_reason = reason,
      withdrawal_note = null,
      withdrawn_by = actor,
      withdrawn_at = now()
    where places.id = p_hide_place_id
      and places.publication_status = 'published';
    if not found then
      raise exception 'Only a published place can be hidden.' using errcode = '22023';
    end if;
    update public.place_boundaries as b
    set stats_eligibility = 'excluded',
      stats_eligibility_reason = reason,
      stats_eligibility_set_by = actor,
      stats_eligibility_set_at = now()
    where b.place_id = p_hide_place_id
      and b.is_current;
  end if;

  if p_decision = 'undo' then
    if link.origin <> 'derived' then
      raise exception 'Only a derived link goes back to review.' using errcode = '22023';
    end if;
    if link.status = 'proposed' then
      raise exception 'This link is not reviewed yet.' using errcode = '22023';
    end if;
    -- After Same place: show the hidden end again, and put its boundary back to review.
    if link.relationship_type_id = 'overlaps' and link.status = 'confirmed' then
      for hidden in
        select places.id as place_id,
          public.same_place_reason(
            case when places.id = link.subject_place_id
              then link.object_place_id else link.subject_place_id end
          ) as reason
        from public.places
        where places.id in (link.subject_place_id, link.object_place_id)
          and places.publication_status = 'withdrawn'
      loop
        update public.places
        set publication_status = 'published',
          withdrawal_reason = null,
          withdrawal_note = null,
          withdrawn_by = null,
          withdrawn_at = null
        where places.id = hidden.place_id
          and places.withdrawal_reason = hidden.reason;
        if found then
          update public.place_boundaries as b
          set stats_eligibility = 'pending',
            stats_eligibility_reason = null,
            stats_eligibility_set_by = actor,
            stats_eligibility_set_at = now()
          where b.place_id = hidden.place_id
            and b.is_current
            and b.stats_eligibility = 'excluded'
            and b.stats_eligibility_reason = hidden.reason;
        end if;
      end loop;
    end if;
  end if;

  update public.place_relationships as r
  set status = case p_decision
      when 'keep' then 'confirmed'
      when 'same_place' then 'confirmed'
      when 'not_related' then 'rejected'
      else 'proposed'
    end,
    reviewed_by = actor
  where r.id = p_link_id
  returning r.status into link_status;
  return link_status;
end;
$$;

comment on function public.review_overlap(uuid, text, uuid) is
  'Admin only. One decision on an active link: keep (confirmed), not_related (rejected), same_place (an overlaps link between two conservation areas: confirmed, and the given end hidden from the map and left out of Stats), or undo (a reviewed derived link back to proposed, and a Same place undone). Returns the link''s status.';

revoke all on function public.review_overlap(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.review_overlap(uuid, text, uuid) to authenticated;

-- The list filter ------------------------------------------------------------------------
-- The list reads run as the caller, who may not read proposed links. This helper reads
-- them as the owner, and gives a non-admin no ids.
create function public.overlap_review_place_ids(p_view text)
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ids uuid[];
begin
  if p_view not in ('recognises', 'overlaps') then
    raise exception 'The link review must be recognises or overlaps.' using errcode = '22023';
  end if;
  if not (select public.has_role('admin')) then
    return '{}'::uuid[];
  end if;
  select coalesce(array_agg(distinct ends.place_id), '{}'::uuid[])
  into ids
  from public.place_relationships as r
  cross join lateral (values (r.subject_place_id), (r.object_place_id)) as ends (place_id)
  where r.relationship_type_id = p_view
    and r.status = 'proposed'
    and r.retired_at is null;
  return ids;
end;
$$;

comment on function public.overlap_review_place_ids(text) is
  'Place ids at either end of an active proposed link of one kind: recognises or overlaps. None for a non-admin. Used by the list reads.';

revoke all on function public.overlap_review_place_ids(text) from public;
grant execute on function public.overlap_review_place_ids(text) to anon, authenticated, service_role;

-- The cards' notes -----------------------------------------------------------------------
create function public.overlap_review_notes(p_place_ids uuid[], p_view text default null)
returns table (
  place_id uuid,
  proposed_links bigint,
  top_other_name text,
  top_share double precision
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can read link reviews.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_place_ids), 0) > 200 then
    raise exception 'Ask for at most 200 places.' using errcode = '22023';
  end if;
  if p_view is not null and p_view not in ('recognises', 'overlaps') then
    raise exception 'The link review must be recognises or overlaps.' using errcode = '22023';
  end if;
  return query
  with sides as (
    select
      case when side.outward then r.subject_place_id else r.object_place_id end as place_id,
      case when side.outward then r.object_place_id else r.subject_place_id end as other_id,
      case when side.outward then r.subject_coverage else r.object_coverage end as share
    from public.place_relationships as r
    cross join (values (true), (false)) as side (outward)
    where r.relationship_type_id in ('recognises', 'overlaps')
      and (p_view is null or r.relationship_type_id = p_view)
      and r.status = 'proposed'
      and r.retired_at is null
      and (
        (side.outward and r.subject_place_id = any (p_place_ids))
        or (not side.outward and r.object_place_id = any (p_place_ids))
      )
  ),
  ranked as (
    select sides.*, count(*) over (partition by sides.place_id) as n,
      row_number() over (
        partition by sides.place_id order by sides.share desc nulls last, sides.other_id
      ) as k
    from sides
  )
  select ranked.place_id, ranked.n, other.name, ranked.share
  from ranked
  left join public.places as other on other.id = ranked.other_id
  where ranked.k = 1;
end;
$$;

comment on function public.overlap_review_notes(uuid[], text) is
  'Admin only. For each place with proposed recognises or overlaps links, or of one kind when p_view is given: how many, and the other place and the share of this place inside it for the largest.';

revoke all on function public.overlap_review_notes(uuid[], text) from public, anon, authenticated;
grant execute on function public.overlap_review_notes(uuid[], text) to authenticated;

-- The list reads take the link review filter -------------------------------------------
-- p_overlap_review keeps the places at either end of a proposed link of that kind.
-- The rest of each function is as in 20261209100000_plain_boundary_review.sql.
drop function public.place_matched(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean, text);
drop function public.place_window(text[], text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer, uuid[], boolean, text);
drop function public.place_window_count(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean, text);
drop function public.place_rank(text[], uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean, text);
drop function public.place_kept_ids(text[], double precision, double precision, double precision, double precision, uuid[], boolean, text);
drop function public.place_extent(text[], double precision, double precision, uuid[], boolean, text);

create function public.place_matched(p_place_types text[], p_search text, p_search_prefix boolean, p_size_min double precision, p_size_max double precision, p_crop_min double precision, p_crop_max double precision, p_west double precision, p_south double precision, p_east double precision, p_north double precision, p_ecoregion_ids uuid[], p_photo_suggestions boolean DEFAULT false, p_boundary_review text DEFAULT NULL::text, p_overlap_review text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, name text, place_type_id text, designation text, iso3 text, area_km2 double precision, cropland_percent double precision)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  needle text;
  crop_whole boolean;
  has_extent boolean;
  ecoregions_whole boolean;
  review_ids uuid[];
  link_ids uuid[];
begin
  needle := nullif(btrim(coalesce(p_search, '')), '');
  if needle is not null then
    needle := replace(replace(replace(needle, '\', '\\'), '%', '\%'), '_', '\_');
    needle := case when p_search_prefix then needle || '%' else '%' || needle || '%' end;
  end if;
  crop_whole := coalesce(p_crop_min, 0) <= 0 and coalesce(p_crop_max, 100) >= 100;
  has_extent :=
    p_west is not null
    and p_south is not null
    and p_east is not null
    and p_north is not null;
  ecoregions_whole := coalesce(cardinality(p_ecoregion_ids), 0) = 0;
  review_ids := case
    when p_boundary_review is null then null
    else public.boundary_review_place_ids(p_boundary_review)
  end;
  link_ids := case
    when p_overlap_review is null then null
    else public.overlap_review_place_ids(p_overlap_review)
  end;

  if has_extent then
    return query
    select
      extent.id,
      extent.name,
      extent.place_type_id,
      extent.designation,
      extent.iso3,
      extent.area_km2,
      crops.percent
    from public.places_in_extent(p_place_types, p_west, p_south, p_east, p_north) as extent
    left join public.place_crops_percent as crops on crops.place_id = extent.id
    where (
        needle is null
        or extent.name ilike needle escape '\'
        or extent.source_place_name ilike needle escape '\'
      )
      and (p_size_min is null or extent.area_km2 >= p_size_min)
      and (p_size_max is null or extent.area_km2 <= p_size_max)
      and (
        crop_whole
        or (
          crops.percent is not null
          and crops.percent >= coalesce(p_crop_min, 0)
          and crops.percent <= coalesce(p_crop_max, 100)
        )
      )
      and (
        ecoregions_whole
        or exists (
          select 1
          from public.place_relationships as link
          where link.subject_place_id = extent.id
            and link.relationship_type_id = 'located_in'
            and link.status = 'confirmed'
            and link.retired_at is null
            and link.object_place_id = any (p_ecoregion_ids)
        )
      )
      and (
        not coalesce(p_photo_suggestions, false)
        or exists (
          select 1
          from public.place_images as photo
          where photo.place_id = extent.id
            and photo.status = 'suggested'
        )
      )
      and (review_ids is null or extent.id = any (review_ids))
      and (link_ids is null or extent.id = any (link_ids));
  else
    return query
    select
      listed.id,
      listed.name,
      listed.place_type_id,
      listed.designation,
      listed.iso3,
      listed.area_km2,
      crops.percent
    from public.listed_places as listed
    left join public.place_crops_percent as crops on crops.place_id = listed.id
    where listed.place_type_id = any (p_place_types)
      and (
        needle is null
        or listed.name ilike needle escape '\'
        or listed.source_place_name ilike needle escape '\'
      )
      and (p_size_min is null or listed.area_km2 >= p_size_min)
      and (p_size_max is null or listed.area_km2 <= p_size_max)
      and (
        crop_whole
        or (
          crops.percent is not null
          and crops.percent >= coalesce(p_crop_min, 0)
          and crops.percent <= coalesce(p_crop_max, 100)
        )
      )
      and (
        ecoregions_whole
        or exists (
          select 1
          from public.place_relationships as link
          where link.subject_place_id = listed.id
            and link.relationship_type_id = 'located_in'
            and link.status = 'confirmed'
            and link.retired_at is null
            and link.object_place_id = any (p_ecoregion_ids)
        )
      )
      and (
        not coalesce(p_photo_suggestions, false)
        or exists (
          select 1
          from public.place_images as photo
          where photo.place_id = listed.id
            and photo.status = 'suggested'
        )
      )
      and (review_ids is null or listed.id = any (review_ids))
      and (link_ids is null or listed.id = any (link_ids));
  end if;
end;
$function$;

create function public.place_window(p_place_types text[], p_search text DEFAULT ''::text, p_search_prefix boolean DEFAULT false, p_sort text DEFAULT 'size-desc'::text, p_size_min double precision DEFAULT NULL::double precision, p_size_max double precision DEFAULT NULL::double precision, p_crop_min double precision DEFAULT 0, p_crop_max double precision DEFAULT 100, p_west double precision DEFAULT NULL::double precision, p_south double precision DEFAULT NULL::double precision, p_east double precision DEFAULT NULL::double precision, p_north double precision DEFAULT NULL::double precision, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_ecoregion_ids uuid[] DEFAULT NULL::uuid[], p_photo_suggestions boolean DEFAULT false, p_boundary_review text DEFAULT NULL::text, p_overlap_review text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, name text, place_type_id text, designation text, iso3 text, area_km2 double precision, cropland_percent double precision, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  sort_id text;
  page_limit integer;
  page_offset integer;
begin
  sort_id := case p_sort
    when 'name' then 'name'
    when 'size-asc' then 'size-asc'
    when 'cropland-desc' then 'cropland-desc'
    when 'cropland-asc' then 'cropland-asc'
    else 'size-desc'
  end;
  page_limit := least(greatest(coalesce(p_limit, 50), 1), 50);
  page_offset := greatest(coalesce(p_offset, 0), 0);

  return query
  with matched as (
    select *
    from public.place_matched(
      p_place_types,
      p_search,
      p_search_prefix,
      p_size_min,
      p_size_max,
      p_crop_min,
      p_crop_max,
      p_west,
      p_south,
      p_east,
      p_north,
      p_ecoregion_ids,
      p_photo_suggestions,
    p_boundary_review,
    p_overlap_review
    )
  ),
  counted as (
    select count(*)::bigint as n from matched
  )
  select
    matched.id,
    matched.name,
    matched.place_type_id,
    matched.designation,
    matched.iso3,
    matched.area_km2,
    matched.cropland_percent,
    counted.n
  from matched
  cross join counted
  order by
    case
      when sort_id in ('size-desc', 'size-asc') and matched.area_km2 is null then 1
      when sort_id in ('cropland-desc', 'cropland-asc') and matched.cropland_percent is null then 1
      else 0
    end,
    case sort_id when 'name' then matched.name end,
    case sort_id
      when 'size-desc' then -matched.area_km2
      when 'size-asc' then matched.area_km2
      when 'cropland-desc' then -matched.cropland_percent
      when 'cropland-asc' then matched.cropland_percent
    end,
    matched.name,
    matched.id
  limit page_limit offset page_offset;
end;
$function$;

create function public.place_window_count(p_place_types text[], p_search text DEFAULT ''::text, p_search_prefix boolean DEFAULT false, p_size_min double precision DEFAULT NULL::double precision, p_size_max double precision DEFAULT NULL::double precision, p_crop_min double precision DEFAULT 0, p_crop_max double precision DEFAULT 100, p_west double precision DEFAULT NULL::double precision, p_south double precision DEFAULT NULL::double precision, p_east double precision DEFAULT NULL::double precision, p_north double precision DEFAULT NULL::double precision, p_ecoregion_ids uuid[] DEFAULT NULL::uuid[], p_photo_suggestions boolean DEFAULT false, p_boundary_review text DEFAULT NULL::text, p_overlap_review text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select count(*)::bigint
  from public.place_matched(
    p_place_types,
    p_search,
    p_search_prefix,
    p_size_min,
    p_size_max,
    p_crop_min,
    p_crop_max,
    p_west,
    p_south,
    p_east,
    p_north,
    p_ecoregion_ids,
    p_photo_suggestions,
    p_boundary_review,
    p_overlap_review
  );
$function$;

create function public.place_rank(p_place_types text[], p_id uuid, p_search text DEFAULT ''::text, p_search_prefix boolean DEFAULT false, p_sort text DEFAULT 'size-desc'::text, p_size_min double precision DEFAULT NULL::double precision, p_size_max double precision DEFAULT NULL::double precision, p_crop_min double precision DEFAULT 0, p_crop_max double precision DEFAULT 100, p_west double precision DEFAULT NULL::double precision, p_south double precision DEFAULT NULL::double precision, p_east double precision DEFAULT NULL::double precision, p_north double precision DEFAULT NULL::double precision, p_ecoregion_ids uuid[] DEFAULT NULL::uuid[], p_photo_suggestions boolean DEFAULT false, p_boundary_review text DEFAULT NULL::text, p_overlap_review text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  sort_id text;
  found_position bigint;
begin
  sort_id := case p_sort
    when 'name' then 'name'
    when 'size-asc' then 'size-asc'
    when 'cropland-desc' then 'cropland-desc'
    when 'cropland-asc' then 'cropland-asc'
    else 'size-desc'
  end;

  select ranked.list_position
  into found_position
  from (
    select
      matched.id,
      row_number() over (
        order by
          case
            when sort_id in ('size-desc', 'size-asc') and matched.area_km2 is null then 1
            when sort_id in ('cropland-desc', 'cropland-asc') and matched.cropland_percent is null then 1
            else 0
          end,
          case sort_id when 'name' then matched.name end,
          case sort_id
            when 'size-desc' then -matched.area_km2
            when 'size-asc' then matched.area_km2
            when 'cropland-desc' then -matched.cropland_percent
            when 'cropland-asc' then matched.cropland_percent
          end,
          matched.name,
          matched.id
      ) - 1 as list_position
    from public.place_matched(
      p_place_types,
      p_search,
      p_search_prefix,
      p_size_min,
      p_size_max,
      p_crop_min,
      p_crop_max,
      p_west,
      p_south,
      p_east,
      p_north,
      p_ecoregion_ids,
      p_photo_suggestions,
    p_boundary_review,
    p_overlap_review
    ) as matched
  ) as ranked
  where ranked.id = p_id;

  return found_position;
end;
$function$;

create function public.place_kept_ids(p_place_types text[], p_size_min double precision DEFAULT NULL::double precision, p_size_max double precision DEFAULT NULL::double precision, p_crop_min double precision DEFAULT 0, p_crop_max double precision DEFAULT 100, p_ecoregion_ids uuid[] DEFAULT NULL::uuid[], p_photo_suggestions boolean DEFAULT false, p_boundary_review text DEFAULT NULL::text, p_overlap_review text DEFAULT NULL::text)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(matched.id), '{}'::uuid[])
  from public.place_matched(
    p_place_types,
    '',
    false,
    p_size_min,
    p_size_max,
    p_crop_min,
    p_crop_max,
    null,
    null,
    null,
    null,
    p_ecoregion_ids,
    p_photo_suggestions,
    p_boundary_review,
    p_overlap_review
  ) as matched;
$function$;

create function public.place_extent(p_place_types text[], p_size_min double precision DEFAULT NULL::double precision, p_size_max double precision DEFAULT NULL::double precision, p_ecoregion_ids uuid[] DEFAULT NULL::uuid[], p_photo_suggestions boolean DEFAULT false, p_boundary_review text DEFAULT NULL::text, p_overlap_review text DEFAULT NULL::text)
 RETURNS TABLE(west double precision, south double precision, east double precision, north double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    min(listed.bbox_west),
    min(listed.bbox_south),
    max(listed.bbox_east),
    max(listed.bbox_north)
  from public.place_matched(
    p_place_types,
    '',
    false,
    p_size_min,
    p_size_max,
    0,
    100,
    null,
    null,
    null,
    null,
    p_ecoregion_ids,
    p_photo_suggestions,
    p_boundary_review,
    p_overlap_review
  ) as matched
  join public.listed_places as listed on listed.id = matched.id
  having count(*) > 0;
$function$;

comment on function public.place_matched(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean, text, text) is
  'Listed places of the given types that match the list search, size, cropland, optional extent, optional ecoregions, and, when asked, have suggested photographs, a boundary in a review view, or a proposed link of a kind. A place matches an ecoregion through a confirmed located_in link. Only an admin sees suggested photographs, boundary reviews, and proposed links.';
revoke all on function public.place_matched(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean, text, text) from public;
grant execute on function public.place_matched(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean, text, text) to anon, authenticated, service_role;

comment on function public.place_window(text[], text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer, uuid[], boolean, text, text) is
  'Up to 50 matching listed places of the given types from an offset, with the number that match.';
revoke all on function public.place_window(text[], text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer, uuid[], boolean, text, text) from public;
grant execute on function public.place_window(text[], text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer, uuid[], boolean, text, text) to anon, authenticated, service_role;

comment on function public.place_window_count(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean, text, text) is
  'How many listed places of the given types match the list query.';
revoke all on function public.place_window_count(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean, text, text) from public;
grant execute on function public.place_window_count(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean, text, text) to anon, authenticated, service_role;

comment on function public.place_rank(text[], uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean, text, text) is
  'Zero-based position of one place in the list order of the given types, or null when it does not match.';
revoke all on function public.place_rank(text[], uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean, text, text) from public;
grant execute on function public.place_rank(text[], uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean, text, text) to anon, authenticated, service_role;

comment on function public.place_kept_ids(text[], double precision, double precision, double precision, double precision, uuid[], boolean, text, text) is
  'Ids of the given types the size, cropland, ecoregion, photo, boundary review, and link review filter keeps on the map. Search and extent do not apply.';
revoke all on function public.place_kept_ids(text[], double precision, double precision, double precision, double precision, uuid[], boolean, text, text) from public;
grant execute on function public.place_kept_ids(text[], double precision, double precision, double precision, double precision, uuid[], boolean, text, text) to anon, authenticated, service_role;

comment on function public.place_extent(text[], double precision, double precision, uuid[], boolean, text, text) is
  'West, south, east, north around the listed places of the given types that the size, ecoregion, photo, boundary review, and link review filter keeps. No row when none is kept.';
revoke all on function public.place_extent(text[], double precision, double precision, uuid[], boolean, text, text) from public;
grant execute on function public.place_extent(text[], double precision, double precision, uuid[], boolean, text, text) to anon, authenticated, service_role;
