-- Wayfinding task 05a: the photo queue becomes a filter on the places list, rejected
-- photographs older than 30 days are purged into photo_refusals, and every CC BY and
-- BY-SA version, with its ports, is a licence. Tables are in design.md §4.6, access
-- rules in §6.

-- The list reads take the photo filter ---------------------------------------------------
-- p_photo_suggestions keeps the places that have a suggested photograph. place_images row
-- security shows suggested links to admins only, so for anyone else it keeps none.

drop function public.place_extent(text[], double precision, double precision, uuid[]);
drop function public.place_window(text[], text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer, uuid[]);
drop function public.place_window_count(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[]);
drop function public.place_rank(text[], uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[]);
drop function public.place_kept_ids(text[], double precision, double precision, double precision, double precision, uuid[]);
drop function public.place_matched(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[]);

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
  p_north double precision,
  p_ecoregion_ids uuid[],
  p_photo_suggestions boolean default false
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
  ecoregions_whole boolean;
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
      );
  end if;
end;
$$;

comment on function public.place_matched(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean) is
  'Listed places of the given types that match the list search, size, cropland, optional extent, optional ecoregions, and, when asked, have suggested photographs. A place matches an ecoregion through a confirmed located_in link. Only an admin sees suggested photographs.';

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
  p_offset integer default 0,
  p_ecoregion_ids uuid[] default null,
  p_photo_suggestions boolean default false
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
      p_north,
      p_ecoregion_ids,
      p_photo_suggestions
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

comment on function public.place_window(text[], text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer, uuid[], boolean) is
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
  p_north double precision default null,
  p_ecoregion_ids uuid[] default null,
  p_photo_suggestions boolean default false
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
    p_north,
    p_ecoregion_ids,
    p_photo_suggestions
  );
$$;

comment on function public.place_window_count(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean) is
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
  p_north double precision default null,
  p_ecoregion_ids uuid[] default null,
  p_photo_suggestions boolean default false
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
      p_north,
      p_ecoregion_ids,
      p_photo_suggestions
    ) as matched
  ) as ranked
  where ranked.id = p_id;

  return found_position;
end;
$$;

comment on function public.place_rank(text[], uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean) is
  'Zero-based position of one place in the list order of the given types, or null when it does not match.';

create function public.place_kept_ids(
  p_place_types text[],
  p_size_min double precision default null,
  p_size_max double precision default null,
  p_crop_min double precision default 0,
  p_crop_max double precision default 100,
  p_ecoregion_ids uuid[] default null,
  p_photo_suggestions boolean default false
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
    null,
    p_ecoregion_ids,
    p_photo_suggestions
  ) as matched;
$$;

comment on function public.place_kept_ids(text[], double precision, double precision, double precision, double precision, uuid[], boolean) is
  'Ids of the given types the size, cropland, ecoregion, and photo filter keeps on the map. Search and extent do not apply.';

create function public.place_extent(
  p_place_types text[],
  p_size_min double precision default null,
  p_size_max double precision default null,
  p_ecoregion_ids uuid[] default null,
  p_photo_suggestions boolean default false
)
returns table (
  west double precision,
  south double precision,
  east double precision,
  north double precision
)
language sql
stable
security invoker
set search_path = public
as $$
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
    p_photo_suggestions
  ) as matched
  join public.listed_places as listed on listed.id = matched.id
  having count(*) > 0;
$$;

comment on function public.place_extent(text[], double precision, double precision, uuid[], boolean) is
  'West, south, east, north around the listed places of the given types that the size, ecoregion, and photo filter keeps. No row when none is kept.';


revoke all on function public.place_matched(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean) from public;
grant execute on function public.place_matched(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean) to anon, authenticated, service_role;
revoke all on function public.place_window(text[], text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer, uuid[], boolean) from public;
grant execute on function public.place_window(text[], text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer, uuid[], boolean) to anon, authenticated, service_role;
revoke all on function public.place_window_count(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean) from public;
grant execute on function public.place_window_count(text[], text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean) to anon, authenticated, service_role;
revoke all on function public.place_rank(text[], uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean) from public;
grant execute on function public.place_rank(text[], uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, uuid[], boolean) to anon, authenticated, service_role;
revoke all on function public.place_kept_ids(text[], double precision, double precision, double precision, double precision, uuid[], boolean) from public;
grant execute on function public.place_kept_ids(text[], double precision, double precision, double precision, double precision, uuid[], boolean) to anon, authenticated, service_role;
revoke all on function public.place_extent(text[], double precision, double precision, uuid[], boolean) from public;
grant execute on function public.place_extent(text[], double precision, double precision, uuid[], boolean) to anon, authenticated, service_role;

-- The photo queue goes --------------------------------------------------------------------

drop function public.photo_queue(integer, integer);

-- Refused photographs ---------------------------------------------------------------------

create table public.photo_refusals (
  place_id uuid not null references public.places (id) on delete cascade,
  commons_title text not null,
  refused_at timestamptz not null default now(),
  primary key (place_id, commons_title),
  constraint photo_refusals_commons_title check (commons_title ~ '^File:.+')
);

comment on table public.photo_refusals is
  'A Commons file an admin rejected for a place, kept after the rejected link is purged so it is not suggested again.';
comment on column public.photo_refusals.commons_title is
  'The file title on Commons (File:…), as images.source_record_id.';

alter table public.photo_refusals enable row level security;

revoke all on table public.photo_refusals from public, anon, authenticated;
grant select on table public.photo_refusals to authenticated;
grant select, insert, update, delete on table public.photo_refusals to service_role;

create policy photo_refusals_select_admin
  on public.photo_refusals
  for select
  to authenticated
  using ((select public.has_role('admin')));

-- Deletes the links rejected more than 30 days ago. A Commons file gets a photo_refusals
-- row first. A Commons image no link uses any more is deleted too. An upload's row stays,
-- as it names its object in Storage.
create function public.purge_rejected_photos()
returns table (links_deleted bigint, images_deleted bigint, refusals_added bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  refused bigint;
  purged bigint;
  removed bigint;
begin
  if (select auth.role()) in ('anon', 'authenticated')
    and not (select public.has_role('admin'))
  then
    raise exception 'Only an admin can purge rejected photographs.' using errcode = '42501';
  end if;

  create temporary table purged_links on commit drop as
  select links.place_id, links.image_id
  from public.place_images as links
  where links.status = 'rejected'
    and coalesce(links.reviewed_at, links.updated_at) < now() - interval '30 days';

  insert into public.photo_refusals (place_id, commons_title)
  select purged_links.place_id, images.source_record_id
  from purged_links
  join public.images on images.id = purged_links.image_id
  where images.source_id = 'wikimedia-commons'
    and images.source_record_id is not null
  on conflict (place_id, commons_title) do nothing;
  get diagnostics refused = row_count;

  delete from public.place_images as links
  using purged_links
  where links.place_id = purged_links.place_id
    and links.image_id = purged_links.image_id;
  get diagnostics purged = row_count;

  delete from public.images
  where images.id in (select distinct purged_links.image_id from purged_links)
    and images.external_url is not null
    and not exists (
      select 1 from public.place_images as links where links.image_id = images.id
    );
  get diagnostics removed = row_count;

  drop table purged_links;
  return query select purged, removed, refused;
end;
$$;

comment on function public.purge_rejected_photos() is
  'Admin or service only. Deletes photographs rejected more than 30 days ago, keeping a photo_refusals row for each Commons file, and the Commons images no place uses any more.';

revoke all on function public.purge_rejected_photos() from public, anon, authenticated;
grant execute on function public.purge_rejected_photos() to authenticated, service_role;

-- Licences --------------------------------------------------------------------------------
-- Every CC BY and BY-SA version from 1.0 to 4.0. 2.1 was only published as ports. The
-- ports are CC's own list (creativecommons/cc-legal-tools-data, docs/licenses).

insert into public.licences (
  id, title, url, requires_attribution, share_alike, allows_commercial
) values
  ('cc-by-1.0', 'Creative Commons Attribution 1.0 Generic',
   'https://creativecommons.org/licenses/by/1.0/', true, false, true),
  ('cc-by-sa-1.0', 'Creative Commons Attribution-ShareAlike 1.0 Generic',
   'https://creativecommons.org/licenses/by-sa/1.0/', true, true, true);

with
  kinds (code, title, share_alike) as (
    values ('by', 'Attribution', false), ('by-sa', 'Attribution-ShareAlike', true)
  ),
  ports (version, jurisdiction, place) as (
    values
    ('1.0', 'fi', 'Finland'),
    ('1.0', 'il', 'Israel'),
    ('1.0', 'nl', 'Netherlands'),
    ('2.0', 'at', 'Austria'),
    ('2.0', 'au', 'Australia'),
    ('2.0', 'be', 'Belgium'),
    ('2.0', 'br', 'Brazil'),
    ('2.0', 'ca', 'Canada'),
    ('2.0', 'cl', 'Chile'),
    ('2.0', 'de', 'Germany'),
    ('2.0', 'es', 'Spain'),
    ('2.0', 'fr', 'France'),
    ('2.0', 'hr', 'Croatia'),
    ('2.0', 'it', 'Italy'),
    ('2.0', 'jp', 'Japan'),
    ('2.0', 'kr', 'Korea'),
    ('2.0', 'nl', 'Netherlands'),
    ('2.0', 'pl', 'Poland'),
    ('2.0', 'tw', 'Taiwan'),
    ('2.0', 'uk', 'England and Wales'),
    ('2.0', 'za', 'South Africa'),
    ('2.1', 'au', 'Australia'),
    ('2.1', 'ca', 'Canada'),
    ('2.1', 'es', 'Spain'),
    ('2.1', 'jp', 'Japan'),
    ('2.5', 'ar', 'Argentina'),
    ('2.5', 'au', 'Australia'),
    ('2.5', 'bg', 'Bulgaria'),
    ('2.5', 'br', 'Brazil'),
    ('2.5', 'ca', 'Canada'),
    ('2.5', 'ch', 'Switzerland'),
    ('2.5', 'cn', 'China Mainland'),
    ('2.5', 'co', 'Colombia'),
    ('2.5', 'dk', 'Denmark'),
    ('2.5', 'es', 'Spain'),
    ('2.5', 'hr', 'Croatia'),
    ('2.5', 'hu', 'Hungary'),
    ('2.5', 'il', 'Israel'),
    ('2.5', 'in', 'India'),
    ('2.5', 'it', 'Italy'),
    ('2.5', 'mk', 'North Macedonia'),
    ('2.5', 'mt', 'Malta'),
    ('2.5', 'mx', 'Mexico'),
    ('2.5', 'my', 'Malaysia'),
    ('2.5', 'nl', 'Netherlands'),
    ('2.5', 'pe', 'Peru'),
    ('2.5', 'pl', 'Poland'),
    ('2.5', 'pt', 'Portugal'),
    ('2.5', 'scotland', 'Scotland'),
    ('2.5', 'se', 'Sweden'),
    ('2.5', 'si', 'Slovenia'),
    ('2.5', 'tw', 'Taiwan'),
    ('2.5', 'za', 'South Africa'),
    ('3.0', 'am', 'Armenia'),
    ('3.0', 'at', 'Austria'),
    ('3.0', 'au', 'Australia'),
    ('3.0', 'az', 'Azerbaijan'),
    ('3.0', 'br', 'Brazil'),
    ('3.0', 'ca', 'Canada'),
    ('3.0', 'ch', 'Switzerland'),
    ('3.0', 'cl', 'Chile'),
    ('3.0', 'cn', 'China Mainland'),
    ('3.0', 'cr', 'Costa Rica'),
    ('3.0', 'cz', 'Czech Republic'),
    ('3.0', 'de', 'Germany'),
    ('3.0', 'ec', 'Ecuador'),
    ('3.0', 'ee', 'Estonia'),
    ('3.0', 'eg', 'Egypt'),
    ('3.0', 'es', 'Spain'),
    ('3.0', 'fr', 'France'),
    ('3.0', 'ge', 'Georgia'),
    ('3.0', 'gr', 'Greece'),
    ('3.0', 'gt', 'Guatemala'),
    ('3.0', 'hk', 'Hong Kong'),
    ('3.0', 'hr', 'Croatia'),
    ('3.0', 'ie', 'Ireland'),
    ('3.0', 'igo', 'IGO'),
    ('3.0', 'it', 'Italy'),
    ('3.0', 'lu', 'Luxembourg'),
    ('3.0', 'nl', 'Netherlands'),
    ('3.0', 'no', 'Norway'),
    ('3.0', 'nz', 'New Zealand'),
    ('3.0', 'ph', 'Philippines'),
    ('3.0', 'pl', 'Poland'),
    ('3.0', 'pr', 'Puerto Rico'),
    ('3.0', 'pt', 'Portugal'),
    ('3.0', 'ro', 'Romania'),
    ('3.0', 'rs', 'Serbia'),
    ('3.0', 'sg', 'Singapore'),
    ('3.0', 'th', 'Thailand'),
    ('3.0', 'tw', 'Taiwan'),
    ('3.0', 'ug', 'Uganda'),
    ('3.0', 'us', 'United States'),
    ('3.0', 've', 'Venezuela'),
    ('3.0', 'vn', 'Vietnam'),
    ('3.0', 'za', 'South Africa')
  )
insert into public.licences (
  id, title, url, requires_attribution, share_alike, allows_commercial
)
select
  format('cc-%s-%s-%s', kinds.code, ports.version, ports.jurisdiction),
  format('Creative Commons %s %s %s', kinds.title, ports.version, ports.place),
  format('https://creativecommons.org/licenses/%s/%s/%s/', kinds.code, ports.version,
    ports.jurisdiction),
  true,
  kinds.share_alike,
  true
from kinds
cross join ports;
