-- Shaping Boundaries task 03b: plain boundary review.
-- qc_status gains rejected ("Needs fixing"). review_boundary() gives a boundary one
-- verdict: count it, needs fixing, leave out of Stats, or back to review. The review
-- list becomes a filter on the places list: the list reads take p_boundary_review,
-- and boundary_review_notes() gives the cards their notes. accept_boundary_qc() and
-- admin_boundary_list() from task 03 go. Design in design.md §4.2.

-- Needs fixing -------------------------------------------------------------------------
alter table public.place_boundaries
  drop constraint place_boundaries_qc_status_check,
  add constraint place_boundaries_qc_status_check
    check (qc_status in ('unchecked', 'passed', 'flagged', 'accepted', 'rejected'));

comment on column public.place_boundaries.qc_status is
  'Is the shape trustworthy? Set from boundary_checks, or by an admin: accepted (the shape is right) or rejected (it needs fixing).';

drop function public.accept_boundary_qc(uuid);
drop function public.admin_boundary_list(text, integer, integer);

-- The verdict ----------------------------------------------------------------------------
create function public.review_boundary(p_boundary_id uuid, p_verdict text, p_note text)
returns table (
  boundary_id uuid,
  qc_status text,
  stats_eligibility text,
  stats_eligibility_reason text,
  stats_eligibility_set_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  note text := nullif(btrim(p_note), '');
  qc text;
  current_boundary boolean;
  checked_qc text;
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can review a boundary.' using errcode = '42501';
  end if;
  if p_verdict is null or p_verdict not in ('count', 'fix', 'leave_out', 'undo') then
    raise exception 'The verdict must be count, fix, leave_out, or undo.' using errcode = '22023';
  end if;
  if note is not null and char_length(note) > 1000 then
    raise exception 'The note can be at most 1,000 characters.' using errcode = '22023';
  end if;
  select b.qc_status, b.is_current into qc, current_boundary
  from public.place_boundaries as b
  where b.id = p_boundary_id
  for update;
  if not found then
    raise exception 'No boundary has this id.' using errcode = 'P0002';
  end if;
  if not current_boundary then
    raise exception 'Only a current boundary can be reviewed.' using errcode = '22023';
  end if;

  if p_verdict = 'count' then
    if qc = 'rejected' then
      raise exception 'This boundary needs fixing. Choose Back to review first.' using errcode = '22023';
    end if;
    if qc = 'unchecked' then
      raise exception 'This boundary has not been checked yet.' using errcode = '22023';
    end if;
    if qc <> 'passed' and note is null then
      raise exception 'Give a note on why the shape is right.' using errcode = '22023';
    end if;
    return query
    update public.place_boundaries as b
    set qc_status = case when qc = 'flagged' then 'accepted' else qc end,
      stats_eligibility = 'eligible',
      stats_eligibility_reason = note,
      stats_eligibility_set_by = (select auth.uid()),
      stats_eligibility_set_at = now()
    where b.id = p_boundary_id
    returning b.id, b.qc_status, b.stats_eligibility, b.stats_eligibility_reason, b.stats_eligibility_set_at;

  elsif p_verdict = 'fix' then
    return query
    update public.place_boundaries as b
    set qc_status = 'rejected',
      stats_eligibility = 'pending',
      stats_eligibility_reason = note,
      stats_eligibility_set_by = (select auth.uid()),
      stats_eligibility_set_at = now()
    where b.id = p_boundary_id
    returning b.id, b.qc_status, b.stats_eligibility, b.stats_eligibility_reason, b.stats_eligibility_set_at;

  elsif p_verdict = 'leave_out' then
    if note is null then
      raise exception 'Give a note on why it is left out of Stats.' using errcode = '22023';
    end if;
    return query
    update public.place_boundaries as b
    set stats_eligibility = 'excluded',
      stats_eligibility_reason = note,
      stats_eligibility_set_by = (select auth.uid()),
      stats_eligibility_set_at = now()
    where b.id = p_boundary_id
    returning b.id, b.qc_status, b.stats_eligibility, b.stats_eligibility_reason, b.stats_eligibility_set_at;

  else
    -- Back to review: the status the latest findings give, and pending.
    select case
        when bool_or(latest.check_category <> 'processing_cost' and latest.outcome <> 'pass') then 'flagged'
        when count(*) > 0 then 'passed'
        else 'unchecked'
      end
    into checked_qc
    from (
      select distinct on (c.check_id) c.check_category, c.outcome
      from public.boundary_checks as c
      where c.boundary_id = p_boundary_id
      order by c.check_id, c.checked_at desc
    ) as latest;
    return query
    update public.place_boundaries as b
    set qc_status = case when qc in ('accepted', 'rejected') then checked_qc else qc end,
      stats_eligibility = 'pending',
      stats_eligibility_reason = null,
      stats_eligibility_set_by = (select auth.uid()),
      stats_eligibility_set_at = now()
    where b.id = p_boundary_id
    returning b.id, b.qc_status, b.stats_eligibility, b.stats_eligibility_reason, b.stats_eligibility_set_at;
  end if;
end;
$$;

comment on function public.review_boundary(uuid, text, text) is
  'Admin only. One verdict on a current boundary: count (the shape is right; eligible), fix (rejected; pending), leave_out (excluded), or undo (back to what the checks say, and pending).';

revoke all on function public.review_boundary(uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_boundary(uuid, text, text) to authenticated;

-- The list filter ------------------------------------------------------------------------
-- The list reads run as the caller, who may not read the review columns. This helper
-- reads them as the owner, and gives a non-admin no ids.
create function public.boundary_review_place_ids(p_view text)
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ids uuid[];
begin
  if p_view not in ('to_review', 'needs_fixing', 'left_out') then
    raise exception 'The boundary review must be to_review, needs_fixing, or left_out.'
      using errcode = '22023';
  end if;
  if not (select public.has_role('admin')) then
    return '{}'::uuid[];
  end if;
  select coalesce(array_agg(b.place_id), '{}'::uuid[])
  into ids
  from public.place_boundaries as b
  where b.is_current
    and case p_view
      when 'to_review' then b.stats_eligibility = 'pending' and b.qc_status <> 'rejected'
      when 'needs_fixing' then b.qc_status = 'rejected'
      else b.stats_eligibility = 'excluded'
    end;
  return ids;
end;
$$;

comment on function public.boundary_review_place_ids(text) is
  'Place ids whose current boundary is in a review view: to_review, needs_fixing, or left_out. None for a non-admin. Used by the list reads.';

revoke all on function public.boundary_review_place_ids(text) from public;
grant execute on function public.boundary_review_place_ids(text) to anon, authenticated, service_role;

-- The cards' notes -----------------------------------------------------------------------
create function public.boundary_review_notes(p_place_ids uuid[])
returns table (
  place_id uuid,
  boundary_id uuid,
  qc_status text,
  stats_eligibility text,
  stats_eligibility_reason text,
  warnings text[],
  vertex_count double precision,
  vertex_cap double precision
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can read boundary reviews.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_place_ids), 0) > 200 then
    raise exception 'Ask for at most 200 places.' using errcode = '22023';
  end if;
  return query
  select b.place_id, b.id, b.qc_status, b.stats_eligibility, b.stats_eligibility_reason,
    coalesce(findings.warnings, '{}'::text[]), findings.vertex_count, findings.vertex_cap
  from public.place_boundaries as b
  left join lateral (
    select
      array_agg(latest.check_id order by latest.check_id)
        filter (where latest.outcome <> 'pass') as warnings,
      max(latest.measured_value) filter (where latest.check_id = 'vertex_count') as vertex_count,
      max(latest.threshold_used) filter (where latest.check_id = 'vertex_count') as vertex_cap
    from (
      select distinct on (c.check_id) c.check_id, c.outcome, c.measured_value, c.threshold_used
      from public.boundary_checks as c
      where c.boundary_id = b.id
      order by c.check_id, c.checked_at desc
    ) as latest
  ) as findings on true
  where b.is_current
    and b.place_id = any (p_place_ids);
end;
$$;

comment on function public.boundary_review_notes(uuid[]) is
  'Admin only. For each place, its current boundary''s review: QC status, eligibility, reason, the checks that warn or fail, the vertex count, and the cap used.';

revoke all on function public.boundary_review_notes(uuid[]) from public, anon, authenticated;
grant execute on function public.boundary_review_notes(uuid[]) to authenticated;

-- The list reads take the boundary review filter ---------------------------------------
-- p_boundary_review keeps the places whose current boundary is in that review view.
-- The rest of each function is as in 20261202100000_photo_queue_and_licences.sql.
drop function public.place_matched(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean);
drop function public.place_window(text[], text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer, uuid[], boolean);
drop function public.place_window_count(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean);
drop function public.place_rank(text[], uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean);
drop function public.place_kept_ids(text[], double precision, double precision, double precision, double precision, uuid[], boolean);
drop function public.place_extent(text[], double precision, double precision, uuid[], boolean);

create function public.place_matched(p_place_types text[], p_search text, p_search_prefix boolean, p_size_min double precision, p_size_max double precision, p_crop_min double precision, p_crop_max double precision, p_west double precision, p_south double precision, p_east double precision, p_north double precision, p_ecoregion_ids uuid[], p_photo_suggestions boolean DEFAULT false, p_boundary_review text DEFAULT NULL::text)
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
      and (review_ids is null or extent.id = any (review_ids));
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
      and (review_ids is null or listed.id = any (review_ids));
  end if;
end;
$function$;

create function public.place_window(p_place_types text[], p_search text DEFAULT ''::text, p_search_prefix boolean DEFAULT false, p_sort text DEFAULT 'size-desc'::text, p_size_min double precision DEFAULT NULL::double precision, p_size_max double precision DEFAULT NULL::double precision, p_crop_min double precision DEFAULT 0, p_crop_max double precision DEFAULT 100, p_west double precision DEFAULT NULL::double precision, p_south double precision DEFAULT NULL::double precision, p_east double precision DEFAULT NULL::double precision, p_north double precision DEFAULT NULL::double precision, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_ecoregion_ids uuid[] DEFAULT NULL::uuid[], p_photo_suggestions boolean DEFAULT false, p_boundary_review text DEFAULT NULL::text)
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
    p_boundary_review
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

create function public.place_window_count(p_place_types text[], p_search text DEFAULT ''::text, p_search_prefix boolean DEFAULT false, p_size_min double precision DEFAULT NULL::double precision, p_size_max double precision DEFAULT NULL::double precision, p_crop_min double precision DEFAULT 0, p_crop_max double precision DEFAULT 100, p_west double precision DEFAULT NULL::double precision, p_south double precision DEFAULT NULL::double precision, p_east double precision DEFAULT NULL::double precision, p_north double precision DEFAULT NULL::double precision, p_ecoregion_ids uuid[] DEFAULT NULL::uuid[], p_photo_suggestions boolean DEFAULT false, p_boundary_review text DEFAULT NULL::text)
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
    p_boundary_review
  );
$function$;

create function public.place_rank(p_place_types text[], p_id uuid, p_search text DEFAULT ''::text, p_search_prefix boolean DEFAULT false, p_sort text DEFAULT 'size-desc'::text, p_size_min double precision DEFAULT NULL::double precision, p_size_max double precision DEFAULT NULL::double precision, p_crop_min double precision DEFAULT 0, p_crop_max double precision DEFAULT 100, p_west double precision DEFAULT NULL::double precision, p_south double precision DEFAULT NULL::double precision, p_east double precision DEFAULT NULL::double precision, p_north double precision DEFAULT NULL::double precision, p_ecoregion_ids uuid[] DEFAULT NULL::uuid[], p_photo_suggestions boolean DEFAULT false, p_boundary_review text DEFAULT NULL::text)
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
    p_boundary_review
    ) as matched
  ) as ranked
  where ranked.id = p_id;

  return found_position;
end;
$function$;

create function public.place_kept_ids(p_place_types text[], p_size_min double precision DEFAULT NULL::double precision, p_size_max double precision DEFAULT NULL::double precision, p_crop_min double precision DEFAULT 0, p_crop_max double precision DEFAULT 100, p_ecoregion_ids uuid[] DEFAULT NULL::uuid[], p_photo_suggestions boolean DEFAULT false, p_boundary_review text DEFAULT NULL::text)
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
    p_boundary_review
  ) as matched;
$function$;

create function public.place_extent(p_place_types text[], p_size_min double precision DEFAULT NULL::double precision, p_size_max double precision DEFAULT NULL::double precision, p_ecoregion_ids uuid[] DEFAULT NULL::uuid[], p_photo_suggestions boolean DEFAULT false, p_boundary_review text DEFAULT NULL::text)
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
    p_boundary_review
  ) as matched
  join public.listed_places as listed on listed.id = matched.id
  having count(*) > 0;
$function$;

comment on function public.place_matched(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean, text) is
  'Listed places of the given types that match the list search, size, cropland, optional extent, optional ecoregions, and, when asked, have suggested photographs or a boundary in a review view. A place matches an ecoregion through a confirmed located_in link. Only an admin sees suggested photographs and boundary reviews.';
revoke all on function public.place_matched(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean, text) from public;
grant execute on function public.place_matched(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean, text) to anon, authenticated, service_role;

comment on function public.place_window(text[], text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer, uuid[], boolean, text) is
  'Up to 50 matching listed places of the given types from an offset, with the number that match.';
revoke all on function public.place_window(text[], text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer, uuid[], boolean, text) from public;
grant execute on function public.place_window(text[], text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer, uuid[], boolean, text) to anon, authenticated, service_role;

comment on function public.place_window_count(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean, text) is
  'How many listed places of the given types match the list query.';
revoke all on function public.place_window_count(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean, text) from public;
grant execute on function public.place_window_count(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean, text) to anon, authenticated, service_role;

comment on function public.place_rank(text[], uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean, text) is
  'Zero-based position of one place in the list order of the given types, or null when it does not match.';
revoke all on function public.place_rank(text[], uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean, text) from public;
grant execute on function public.place_rank(text[], uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean, text) to anon, authenticated, service_role;

comment on function public.place_kept_ids(text[], double precision, double precision, double precision, double precision, uuid[], boolean, text) is
  'Ids of the given types the size, cropland, ecoregion, photo, and boundary review filter keeps on the map. Search and extent do not apply.';
revoke all on function public.place_kept_ids(text[], double precision, double precision, double precision, double precision, uuid[], boolean, text) from public;
grant execute on function public.place_kept_ids(text[], double precision, double precision, double precision, double precision, uuid[], boolean, text) to anon, authenticated, service_role;

comment on function public.place_extent(text[], double precision, double precision, uuid[], boolean, text) is
  'West, south, east, north around the listed places of the given types that the size, ecoregion, photo, and boundary review filter keeps. No row when none is kept.';
revoke all on function public.place_extent(text[], double precision, double precision, uuid[], boolean, text) from public;
grant execute on function public.place_extent(text[], double precision, double precision, uuid[], boolean, text) to anon, authenticated, service_role;
