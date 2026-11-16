-- Molding Places task 06: withdrawing a place, flagging it for attention, and lists of
-- several place types.
--
-- An admin withdraws a published place with a reason, or restores it, through
-- set_place_publication(). The map hides withdrawn places at once by reading
-- withdrawn_place_ids(), before the PMTiles are rebuilt. An admin flags a place as
-- needing attention through set_place_attention(). admin_place_list() lists either.
-- Reasons are short free text. place_status_reasons() suggests the ones in use.
-- Admins can open a withdrawn place. The list reads take several place types.

-- Withdrawal ----------------------------------------------------------------------------

alter table public.places
  add column withdrawal_reason text check (
    char_length(withdrawal_reason) <= 80 and btrim(withdrawal_reason) <> ''
  ),
  add column withdrawal_note text check (
    char_length(withdrawal_note) <= 500 and btrim(withdrawal_note) <> ''
  ),
  add column withdrawn_by uuid references public.profiles (id) on delete set null,
  add column withdrawn_at timestamptz;

-- A place withdrawn before this task has no reason, so the rule holds for new
-- withdrawals: a reason only while withdrawn.
alter table public.places
  add constraint places_withdrawal_reason_only_when_withdrawn
  check (withdrawal_reason is null or publication_status = 'withdrawn');

comment on column public.places.withdrawal_reason is
  'Why an admin withdrew the place, as they wrote it. Set only while it is withdrawn.';

-- Only a change to publication is audited, so importer writes are not logged.
create trigger audit_places_publication
after update of publication_status, withdrawal_reason, withdrawal_note on public.places
for each row
when (
  old.publication_status is distinct from new.publication_status
  or old.withdrawal_reason is distinct from new.withdrawal_reason
  or old.withdrawal_note is distinct from new.withdrawal_note
)
execute function public.audit_row('id');

-- Moves a place between published and withdrawn only. A draft or merged place is
-- left alone.
create function public.set_place_publication(
  p_place_id uuid,
  p_status text,
  p_reason text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
  clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can withdraw or restore a place.' using errcode = '42501';
  end if;
  select publication_status into current_status
  from public.places where places.id = p_place_id
  for update;
  if not found then
    raise exception 'No place has id %', p_place_id using errcode = 'P0002';
  end if;
  if current_status not in ('published', 'withdrawn') then
    raise exception 'A % place cannot be withdrawn or restored.', current_status
      using errcode = '22023';
  end if;

  if p_status = 'withdrawn' then
    if clean_reason is null then
      raise exception 'Withdrawing a place needs a reason.' using errcode = '22023';
    end if;
    update public.places
    set publication_status = 'withdrawn',
      withdrawal_reason = clean_reason,
      withdrawal_note = note,
      withdrawn_by = (select auth.uid()),
      withdrawn_at = case when current_status = 'withdrawn' then withdrawn_at else now() end
    where places.id = p_place_id;
  elsif p_status = 'published' then
    update public.places
    set publication_status = 'published',
      withdrawal_reason = null,
      withdrawal_note = null,
      withdrawn_by = null,
      withdrawn_at = null
    where places.id = p_place_id;
  else
    raise exception 'The status must be published or withdrawn.' using errcode = '22023';
  end if;
end;
$$;

comment on function public.set_place_publication(uuid, text, text, text) is
  'Admin only. Withdraws a published place with a reason and an optional note, or restores a withdrawn one.';

-- Ids of withdrawn places, so the map hides them before the tiles are rebuilt. Only
-- ids are exposed.
create function public.withdrawn_place_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(places.id order by places.id), '{}'::uuid[])
  from public.places
  where places.publication_status = 'withdrawn';
$$;

comment on function public.withdrawn_place_ids() is
  'Ids of withdrawn places, which the map hides until the tiles are rebuilt without them.';

-- Attention -----------------------------------------------------------------------------

create table public.place_attention (
  place_id uuid primary key references public.places (id) on delete cascade,
  reason text not null check (char_length(reason) <= 80 and btrim(reason) <> ''),
  note text check (char_length(note) <= 500 and btrim(note) <> ''),
  flagged_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.place_attention is
  'Places an admin flagged as needing attention. A row exists only while the place is flagged.';

create trigger place_attention_set_updated_at
before update on public.place_attention
for each row execute function public.set_updated_at();

create trigger audit_place_attention
after insert or update or delete on public.place_attention
for each row execute function public.audit_row('place_id');

-- A null reason clears the flag. Returns the row, or null once cleared.
create function public.set_place_attention(
  p_place_id uuid,
  p_reason text,
  p_note text default null
)
returns public.place_attention
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.place_attention;
  clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can flag a place.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.places where places.id = p_place_id) then
    raise exception 'No place has id %', p_place_id using errcode = 'P0002';
  end if;
  if clean_reason is null then
    delete from public.place_attention where place_id = p_place_id;
    return null;
  end if;
  insert into public.place_attention as flag (place_id, reason, note, flagged_by)
  values (p_place_id, clean_reason, nullif(btrim(coalesce(p_note, '')), ''), (select auth.uid()))
  on conflict (place_id) do update
    set reason = excluded.reason,
      note = excluded.note,
      flagged_by = excluded.flagged_by
  returning flag.* into saved;
  return saved;
end;
$$;

comment on function public.set_place_attention(uuid, text, text) is
  'Admin only. Flags a place as needing attention with a reason and an optional note. A null or blank reason clears it.';

-- The reasons in use, most used first, for the reason fields to suggest.
create function public.place_status_reasons(p_kind text)
returns table (reason text, place_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can read the reasons.' using errcode = '42501';
  end if;
  if p_kind = 'withdrawal' then
    return query
    select places.withdrawal_reason, count(*)
    from public.places
    where places.withdrawal_reason is not null
    group by places.withdrawal_reason
    order by count(*) desc, places.withdrawal_reason;
  elsif p_kind = 'attention' then
    return query
    select flag.reason, count(*)
    from public.place_attention as flag
    group by flag.reason
    order by count(*) desc, flag.reason;
  else
    raise exception 'The kind must be withdrawal or attention.' using errcode = '22023';
  end if;
end;
$$;

comment on function public.place_status_reasons(text) is
  'Admin only. The withdrawal or attention reasons in use, with how many places have each, most used first.';

-- Reads ---------------------------------------------------------------------------------
-- place_summaries also holds withdrawn places. Row security shows them to admins only.
-- listed_places, and so every list, search, and the Stats Pipeline, stays published.

create or replace view public.place_summaries
with (security_invoker = true)
as
select
  places.id,
  coalesce(curation.display_name, places.name) as name,
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
  coalesce(curation.designation, details.designation, recognition.designation) as designation,
  details.iucn_category,
  array_to_string(coalesce(curation.iso3, details.iso3, recognition.iso3), ';') as iso3,
  coalesce(details.realm, recognition.realm) as realm,
  sources.title as source_name,
  source_releases.released_on as release_month,
  source_releases.citation,
  curation.tagline,
  curation.description,
  places.name as source_place_name,
  coalesce(details.designation, recognition.designation) as source_designation,
  array_to_string(coalesce(details.iso3, recognition.iso3), ';') as source_iso3,
  places.publication_status
from public.places
join public.place_boundaries as boundary
  on boundary.place_id = places.id
  and boundary.is_current
left join public.conservation_area_details as details on details.place_id = places.id
left join public.recognition_details as recognition on recognition.place_id = places.id
left join public.place_curations as curation on curation.place_id = places.id
left join public.sources on sources.id = boundary.source_id
left join public.source_releases on source_releases.id = boundary.source_release_id
where places.publication_status in ('published', 'withdrawn');

comment on view public.place_summaries is
  'Published and withdrawn places with their current boundary''s area and box, its source, their conservation area or recognition details, and curated values over the source values. Visitors see published places only. No geometry.';

create or replace view public.listed_places
with (security_invoker = true)
as
select *
from public.place_summaries
where place_summaries.publication_status = 'published'
  and (
    place_summaries.place_type_id <> 'conservation_area'
    or (place_summaries.realm = 'Terrestrial' and place_summaries.area_km2 >= 10)
  );

-- An admin can zoom to a withdrawn place.
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
    and (
      places.publication_status = 'published'
      or (places.publication_status = 'withdrawn' and (select public.has_role('admin')))
    );
$$;

comment on function public.place_bounds(uuid) is
  'West, south, east, north of the current boundary of one published place, or a withdrawn one for an admin. Does not return geometry.';

-- The photo queue keeps to published places now that place_summaries holds withdrawn ones.
create or replace function public.photo_queue(p_limit integer, p_offset integer)
returns table (
  place_id uuid,
  name text,
  place_type_id text,
  iso3 text,
  area_km2 double precision,
  suggested_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can read the photo queue.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 or p_offset is null or p_offset < 0 then
    raise exception 'The limit must be 1 to 200 and the offset at least 0.'
      using errcode = '22023';
  end if;
  return query
  select summary.id, summary.name, summary.place_type_id, summary.iso3,
    summary.area_km2::double precision, queued.suggested_count,
    count(*) over () as total_count
  from (
    select links.place_id, count(*) as suggested_count
    from public.place_images as links
    where links.status = 'suggested'
    group by links.place_id
  ) as queued
  join public.place_summaries as summary on summary.id = queued.place_id
  where summary.publication_status = 'published'
  order by summary.name, summary.id
  limit p_limit
  offset p_offset;
end;
$$;

-- Places flagged for attention, or withdrawn, by name, with the reason and note.
create function public.admin_place_list(p_kind text, p_limit integer, p_offset integer)
returns table (
  id uuid,
  name text,
  place_type_id text,
  iso3 text,
  area_km2 double precision,
  reason text,
  note text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can read this list.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('attention', 'withdrawn') then
    raise exception 'The list must be attention or withdrawn.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 or p_offset is null or p_offset < 0 then
    raise exception 'The limit must be 1 to 200 and the offset at least 0.'
      using errcode = '22023';
  end if;
  if p_kind = 'attention' then
    return query
    select summary.id, summary.name, summary.place_type_id, summary.iso3,
      summary.area_km2::double precision, flag.reason, flag.note,
      count(*) over () as total_count
    from public.place_attention as flag
    join public.place_summaries as summary on summary.id = flag.place_id
    order by summary.name, summary.id
    limit p_limit
    offset p_offset;
  else
    return query
    select summary.id, summary.name, summary.place_type_id, summary.iso3,
      summary.area_km2::double precision, places.withdrawal_reason, places.withdrawal_note,
      count(*) over () as total_count
    from public.places
    join public.place_summaries as summary on summary.id = places.id
    where places.publication_status = 'withdrawn'
    order by summary.name, summary.id
    limit p_limit
    offset p_offset;
  end if;
end;
$$;

comment on function public.admin_place_list(text, integer, integer) is
  'Admin only. Places flagged for attention, or withdrawn, by name, with the reason, the note, and the total.';

-- Lists of several place types ----------------------------------------------------------
-- Each list read takes an array of place types. place_matched and place_window also
-- return each place's type, for the cards of a mixed list. The one-type signatures go.

drop function public.place_window(text, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer);
drop function public.place_window_count(text, text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision);
drop function public.place_rank(text, uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision);
drop function public.place_kept_ids(text, double precision, double precision, double precision, double precision);
drop function public.place_filter_stats(text);
drop function public.place_matched(text, text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision);
drop function public.places_in_extent(text, double precision, double precision, double precision, double precision);

create function public.places_in_extent(
  p_place_types text[],
  west double precision,
  south double precision,
  east double precision,
  north double precision
)
returns table (
  id uuid,
  name text,
  place_type_id text,
  designation text,
  iso3 text,
  area_km2 double precision,
  source_place_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    listed.id,
    listed.name,
    listed.place_type_id,
    listed.designation,
    listed.iso3,
    listed.area_km2,
    listed.source_place_name
  from public.listed_places as listed
  where listed.place_type_id = any (p_place_types)
    and listed.bbox_south <= north
    and listed.bbox_north >= south
    and (
      case
        when west <= east then
          listed.bbox_west <= east and listed.bbox_east >= west
        else
          listed.bbox_west <= east or listed.bbox_east >= west
      end
    );
$$;

comment on function public.places_in_extent(text[], double precision, double precision, double precision, double precision) is
  'Listed places of the given types whose current boundary box meets a map view. Does not return geometry.';

create function public.place_matched(
  p_place_types text[],
  p_search text,
  p_search_prefix boolean,
  p_size_min double precision,
  p_size_max double precision,
  p_crop_min double precision,
  p_crop_max double precision,
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision
)
returns table (
  id uuid,
  name text,
  place_type_id text,
  designation text,
  iso3 text,
  area_km2 double precision,
  cropland_percent double precision
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  needle text;
  crop_whole boolean;
  has_extent boolean;
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
      );
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
      );
  end if;
end;
$$;

comment on function public.place_matched(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) is
  'Listed places of the given types that match the list search, size, cropland, and optional extent.';

create function public.place_window(
  p_place_types text[],
  p_search text default '',
  p_search_prefix boolean default false,
  p_sort text default 'size-desc',
  p_size_min double precision default null,
  p_size_max double precision default null,
  p_crop_min double precision default 0,
  p_crop_max double precision default 100,
  p_west double precision default null,
  p_south double precision default null,
  p_east double precision default null,
  p_north double precision default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  name text,
  place_type_id text,
  designation text,
  iso3 text,
  area_km2 double precision,
  cropland_percent double precision,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
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
      p_north
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
$$;

comment on function public.place_window(text[], text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer) is
  'Up to 50 matching listed places of the given types from an offset, with the number that match.';

create function public.place_window_count(
  p_place_types text[],
  p_search text default '',
  p_search_prefix boolean default false,
  p_size_min double precision default null,
  p_size_max double precision default null,
  p_crop_min double precision default 0,
  p_crop_max double precision default 100,
  p_west double precision default null,
  p_south double precision default null,
  p_east double precision default null,
  p_north double precision default null
)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
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
    p_north
  );
$$;

comment on function public.place_window_count(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) is
  'How many listed places of the given types match the list query.';

create function public.place_rank(
  p_place_types text[],
  p_id uuid,
  p_search text default '',
  p_search_prefix boolean default false,
  p_sort text default 'size-desc',
  p_size_min double precision default null,
  p_size_max double precision default null,
  p_crop_min double precision default 0,
  p_crop_max double precision default 100,
  p_west double precision default null,
  p_south double precision default null,
  p_east double precision default null,
  p_north double precision default null
)
returns bigint
language plpgsql
stable
security invoker
set search_path = public
as $$
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
      p_north
    ) as matched
  ) as ranked
  where ranked.id = p_id;

  return found_position;
end;
$$;

comment on function public.place_rank(text[], uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) is
  'Zero-based position of one place in the list order of the given types, or null when it does not match.';

create function public.place_kept_ids(
  p_place_types text[],
  p_size_min double precision default null,
  p_size_max double precision default null,
  p_crop_min double precision default 0,
  p_crop_max double precision default 100
)
returns uuid[]
language sql
stable
security invoker
set search_path = public
as $$
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
    null
  ) as matched;
$$;

comment on function public.place_kept_ids(text[], double precision, double precision, double precision, double precision) is
  'Ids of the given types the size and cropland filter keeps on the map. Search and extent do not apply.';

create function public.place_filter_stats(p_place_types text[])
returns table (
  place_count bigint,
  size_min double precision,
  size_max double precision,
  size_bins integer[],
  cropland_bins integer[]
)
language sql
stable
security invoker
set search_path = public
as $$
  with figured as (
    select
      listed.area_km2,
      crops.percent as cropland_percent
    from public.listed_places as listed
    left join public.place_crops_percent as crops on crops.place_id = listed.id
    where listed.place_type_id = any (p_place_types)
  ),
  ends as (
    select
      count(*)::bigint as place_count,
      min(area_km2) as size_min,
      max(area_km2) as size_max
    from figured
  ),
  size_binned as (
    select
      case
        when ends.size_min is null or ends.size_max is null or ends.size_max <= ends.size_min then 0
        else least(
          39,
          greatest(
            0,
            floor(
              (ln(figured.area_km2) - ln(ends.size_min))
              / (ln(ends.size_max) - ln(ends.size_min))
              * 40
            )::integer
          )
        )
      end as bin
    from figured
    cross join ends
    where figured.area_km2 is not null
  ),
  crop_binned as (
    select
      least(
        39,
        greatest(0, floor(figured.cropland_percent / 100.0 * 40)::integer)
      ) as bin
    from figured
    where figured.cropland_percent is not null
  )
  select
    ends.place_count,
    ends.size_min,
    ends.size_max,
    (
      select array_agg(coalesce(counts.n, 0) order by bins.bin)
      from generate_series(0, 39) as bins(bin)
      left join (
        select size_binned.bin, count(*)::integer as n
        from size_binned
        group by size_binned.bin
      ) as counts on counts.bin = bins.bin
    ) as size_bins,
    (
      select array_agg(coalesce(counts.n, 0) order by bins.bin)
      from generate_series(0, 39) as bins(bin)
      left join (
        select crop_binned.bin, count(*)::integer as n
        from crop_binned
        group by crop_binned.bin
      ) as counts on counts.bin = bins.bin
    ) as cropland_bins
  from ends;
$$;

comment on function public.place_filter_stats(text[]) is
  'Size range and histogram counts of the listed places of the given types, for the filter charts.';

-- Access --------------------------------------------------------------------------------

grant select (withdrawal_reason, withdrawal_note, withdrawn_at) on public.places to authenticated;

-- Admins read withdrawn places and what the profile joins to them.
create policy places_select_admin
  on public.places for select to authenticated
  using ((select public.has_role('admin')));

create policy place_boundaries_select_admin
  on public.place_boundaries for select to authenticated
  using ((select public.has_role('admin')));

create policy conservation_area_details_select_admin
  on public.conservation_area_details for select to authenticated
  using ((select public.has_role('admin')));

create policy recognition_details_select_admin
  on public.recognition_details for select to authenticated
  using ((select public.has_role('admin')));

create policy place_source_ids_select_admin
  on public.place_source_ids for select to authenticated
  using ((select public.has_role('admin')));

create policy place_curations_select_admin
  on public.place_curations for select to authenticated
  using ((select public.has_role('admin')));

alter table public.place_attention enable row level security;

revoke all on table public.place_attention from public, anon, authenticated;
grant select on table public.place_attention to authenticated;
grant select, insert, update, delete on table public.place_attention to service_role;

create policy place_attention_select_admin
  on public.place_attention for select to authenticated
  using ((select public.has_role('admin')));

revoke all on function public.set_place_publication(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.set_place_publication(uuid, text, text, text) to authenticated;
revoke all on function public.set_place_attention(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_place_attention(uuid, text, text) to authenticated;
revoke all on function public.place_status_reasons(text) from public, anon, authenticated;
grant execute on function public.place_status_reasons(text) to authenticated;
revoke all on function public.admin_place_list(text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_place_list(text, integer, integer) to authenticated;
revoke all on function public.withdrawn_place_ids() from public;
grant execute on function public.withdrawn_place_ids() to anon, authenticated, service_role;

revoke all on function public.places_in_extent(text[], double precision, double precision, double precision, double precision) from public;
grant execute on function public.places_in_extent(text[], double precision, double precision, double precision, double precision) to anon, authenticated, service_role;
revoke all on function public.place_matched(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) from public;
grant execute on function public.place_matched(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) to anon, authenticated, service_role;
revoke all on function public.place_window(text[], text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer) from public;
grant execute on function public.place_window(text[], text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer) to anon, authenticated, service_role;
revoke all on function public.place_window_count(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) from public;
grant execute on function public.place_window_count(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) to anon, authenticated, service_role;
revoke all on function public.place_rank(text[], uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) from public;
grant execute on function public.place_rank(text[], uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) to anon, authenticated, service_role;
revoke all on function public.place_kept_ids(text[], double precision, double precision, double precision, double precision) from public;
grant execute on function public.place_kept_ids(text[], double precision, double precision, double precision, double precision) to anon, authenticated, service_role;
revoke all on function public.place_filter_stats(text[]) from public;
grant execute on function public.place_filter_stats(text[]) to anon, authenticated, service_role;
