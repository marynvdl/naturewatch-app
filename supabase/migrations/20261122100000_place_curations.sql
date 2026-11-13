-- Molding Places task 02: curated text.
--
-- A curated display name, tagline, description, designation, or country list
-- overrides the source value without changing it (decisions.md, record 22).
-- Admins write through curate_place(). The reads show the curated value when it
-- is set, and search matches both the curated and the source name.

-- Table ---------------------------------------------------------------------------------

create table public.place_curations (
  place_id uuid primary key references public.places (id) on delete cascade,
  display_name text check (btrim(display_name) <> ''),
  tagline text check (
    char_length(tagline) <= 120
    and btrim(tagline) <> ''
    and tagline !~ '[\r\n]'
  ),
  description text check (
    char_length(description) <= 2000
    and btrim(description) <> ''
  ),
  designation text check (btrim(designation) <> ''),
  iso3 text[] check (
    cardinality(iso3) > 0
    and array_to_string(iso3, ';') ~ '^[A-Z]{3}(;[A-Z]{3})*$'
  ),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.place_curations is
  'Curated values shown in place of the source values. Null means the source value is shown.';

create trigger audit_place_curations
after insert or update or delete on public.place_curations
for each row execute function public.audit_row('place_id');

-- Write ---------------------------------------------------------------------------------

-- p_values holds only the fields to change. A null or blank value resets that field
-- to the source value. The row is deleted once every value is null.
create function public.curate_place(p_place_id uuid, p_values jsonb)
returns public.place_curations
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed constant text[] := array['display_name', 'tagline', 'description', 'designation', 'iso3'];
  unknown text;
  current_row public.place_curations;
  text_value text;
  codes text[];
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can curate a place.' using errcode = '42501';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'The values must be a JSON object.' using errcode = '22023';
  end if;
  select key into unknown
  from jsonb_object_keys(p_values) as key
  where key <> all (allowed)
  limit 1;
  if unknown is not null then
    raise exception 'Unknown field: %', unknown using errcode = '22023';
  end if;
  if not exists (select 1 from public.places where places.id = p_place_id) then
    raise exception 'No place has id %', p_place_id using errcode = 'P0002';
  end if;

  select * into current_row from public.place_curations where place_id = p_place_id;
  if not found then
    current_row.place_id := p_place_id;
  end if;

  if p_values ? 'display_name' then
    current_row.display_name := nullif(btrim(p_values ->> 'display_name'), '');
  end if;
  if p_values ? 'tagline' then
    current_row.tagline := nullif(btrim(p_values ->> 'tagline'), '');
  end if;
  if p_values ? 'description' then
    text_value := replace(p_values ->> 'description', E'\r\n', E'\n');
    current_row.description := nullif(btrim(text_value, E' \t\n'), '');
  end if;
  if p_values ? 'designation' then
    current_row.designation := nullif(btrim(p_values ->> 'designation'), '');
  end if;
  if p_values ? 'iso3' then
    if jsonb_typeof(p_values -> 'iso3') = 'array' then
      select array_agg(code order by first_position)
      into codes
      from (
        select upper(btrim(element)) as code, min(position) as first_position
        from jsonb_array_elements_text(p_values -> 'iso3') with ordinality as items (element, position)
        where btrim(element) <> ''
        group by upper(btrim(element))
      ) as distinct_codes;
      current_row.iso3 := codes;
    elsif jsonb_typeof(p_values -> 'iso3') = 'null' then
      current_row.iso3 := null;
    else
      raise exception 'iso3 must be a list of country codes.' using errcode = '22023';
    end if;
  end if;

  if current_row.display_name is null
    and current_row.tagline is null
    and current_row.description is null
    and current_row.designation is null
    and current_row.iso3 is null
  then
    delete from public.place_curations where place_id = p_place_id;
    return null;
  end if;

  insert into public.place_curations as curation (
    place_id, display_name, tagline, description, designation, iso3, updated_by, updated_at
  )
  values (
    p_place_id,
    current_row.display_name,
    current_row.tagline,
    current_row.description,
    current_row.designation,
    current_row.iso3,
    (select auth.uid()),
    now()
  )
  on conflict (place_id) do update
  set display_name = excluded.display_name,
      tagline = excluded.tagline,
      description = excluded.description,
      designation = excluded.designation,
      iso3 = excluded.iso3,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  returning * into current_row;
  return current_row;
end;
$$;

comment on function public.curate_place(uuid, jsonb) is
  'Admin only. Sets or resets the curated fields named in p_values for one place.';

-- The designations published places show, curated over source, most used first.
-- Edit mode suggests them. A curated designation can still be new text.
create function public.place_designations()
returns table (designation text, place_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select shown.designation, count(*) as place_count
  from (
    select coalesce(curation.designation, details.designation, recognition.designation) as designation
    from public.places
    left join public.conservation_area_details as details on details.place_id = places.id
    left join public.recognition_details as recognition on recognition.place_id = places.id
    left join public.place_curations as curation on curation.place_id = places.id
    where places.publication_status = 'published'
  ) as shown
  where shown.designation is not null
  group by shown.designation
  order by place_count desc, shown.designation;
$$;

comment on function public.place_designations() is
  'Designations of published places, curated over source, with how many places show each. For edit mode.';

-- Reads ---------------------------------------------------------------------------------
-- place_summaries shows the curated name, designation, and countries when set. The
-- source values and the curated tagline and description are new columns at the end.

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
  array_to_string(coalesce(details.iso3, recognition.iso3), ';') as source_iso3
from public.places
join public.place_boundaries as boundary
  on boundary.place_id = places.id
  and boundary.is_current
left join public.conservation_area_details as details on details.place_id = places.id
left join public.recognition_details as recognition on recognition.place_id = places.id
left join public.place_curations as curation on curation.place_id = places.id
left join public.sources on sources.id = boundary.source_id
left join public.source_releases on source_releases.id = boundary.source_release_id
where places.publication_status = 'published';

comment on view public.place_summaries is
  'Published places with their current boundary''s area and box, its source, their conservation area or recognition details, and curated values over the source values. No geometry.';

-- listed_places is select *, so it is replaced to pick up the new columns.
create or replace view public.listed_places
with (security_invoker = true)
as
select *
from public.place_summaries
where place_summaries.place_type_id <> 'conservation_area'
  or (place_summaries.realm = 'Terrestrial' and place_summaries.area_km2 >= 10);

-- Search matches the curated or the source name. places_in_extent returns the source
-- name too, so its return type changes and it is dropped and created again.

drop function public.places_in_extent(text, double precision, double precision, double precision, double precision);

create function public.places_in_extent(
  p_place_type text,
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
    listed.designation,
    listed.iso3,
    listed.area_km2,
    listed.source_place_name
  from public.listed_places as listed
  where listed.place_type_id = p_place_type
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

comment on function public.places_in_extent(text, double precision, double precision, double precision, double precision) is
  'Listed places of one type whose current boundary box meets a map view. Does not return geometry.';

revoke all on function public.places_in_extent(text, double precision, double precision, double precision, double precision) from public;
grant execute on function public.places_in_extent(text, double precision, double precision, double precision, double precision) to anon, authenticated, service_role;

create or replace function public.place_matched(
  p_place_type text,
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
      extent.designation,
      extent.iso3,
      extent.area_km2,
      crops.percent
    from public.places_in_extent(p_place_type, p_west, p_south, p_east, p_north) as extent
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
      listed.designation,
      listed.iso3,
      listed.area_km2,
      crops.percent
    from public.listed_places as listed
    left join public.place_crops_percent as crops on crops.place_id = listed.id
    where listed.place_type_id = p_place_type
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

-- Access --------------------------------------------------------------------------------

alter table public.place_curations enable row level security;

revoke all on table public.place_curations from public, anon, authenticated;
grant select on table public.place_curations to anon, authenticated;
grant select, insert, update, delete on table public.place_curations to service_role;

create policy place_curations_select
  on public.place_curations
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.places
      where places.id = place_curations.place_id
        and places.publication_status = 'published'
    )
  );

revoke all on function public.curate_place(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.curate_place(uuid, jsonb) to authenticated;
revoke all on function public.place_designations() from public, anon, authenticated;
grant execute on function public.place_designations() to authenticated;
