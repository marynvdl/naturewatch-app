-- Molding Places task 05: the main photograph and the photo queue. The first approved
-- photograph of a place becomes its main one. The queue lists the published places that
-- have suggested photographs, with how many, for an admin to review one at a time.
-- supabase/suggest_photos.py writes the suggestions. Tables are in design.md §4.6,
-- access rules in §6.

-- The main photograph ----------------------------------------------------------------------
-- A place with approved photographs always has a main one. When it has none, the first
-- approved photograph in gallery order becomes main: the first one approved, or, after
-- the main one is rejected, the next one.

create function public.place_images_settle_main(p_place_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.place_images
  set is_primary = true
  where place_id = p_place_id
    and image_id = (
      select image_id from public.place_images
      where place_id = p_place_id and status = 'approved'
      order by gallery_position nulls last, created_at, image_id
      limit 1
    )
    and not exists (
      select 1 from public.place_images where place_id = p_place_id and is_primary
    );
$$;

revoke all on function public.place_images_settle_main(uuid) from public, anon, authenticated;

-- As in task 04, and the first photograph of a place becomes its main one.
create or replace function public.place_images_insert(
  p_place_id uuid,
  p_image_id uuid,
  p_caption text,
  p_alt_text text
)
returns public.place_images
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  link public.place_images;
begin
  if nullif(btrim(coalesce(p_alt_text, '')), '') is null then
    raise exception 'A photograph needs alt text.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.place_images where place_id = p_place_id and image_id = p_image_id
  ) then
    raise exception 'This photograph is already linked to the place.' using errcode = '23505';
  end if;
  insert into public.place_images (
    place_id, image_id, status, suggested_by_user, reviewed_by, reviewed_at,
    caption, alt_text, is_primary, gallery_position
  )
  values (
    p_place_id, p_image_id, 'approved', actor, actor, now(),
    nullif(btrim(coalesce(p_caption, '')), ''), btrim(p_alt_text),
    not exists (
      select 1 from public.place_images where place_id = p_place_id and is_primary
    ),
    coalesce((
      select max(gallery_position) from public.place_images
      where place_id = p_place_id and status = 'approved'
    ), 0) + 1
  )
  returning * into link;
  return link;
end;
$$;

-- As in task 04. An approved photograph becomes main when the place has none, and the
-- next approved one becomes main when the main one is rejected.
create or replace function public.set_place_image(p_place_id uuid, p_image_id uuid, p_values jsonb)
returns public.place_images
language plpgsql
security definer
set search_path = ''
as $$
declare
  unknown text;
  link public.place_images;
  new_status text;
  new_primary boolean;
begin
  perform public.place_images_check(p_place_id);
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'The values must be a JSON object.' using errcode = '22023';
  end if;
  select key into unknown from jsonb_object_keys(p_values) as key
  where key <> all (array['status', 'caption', 'alt_text', 'is_primary']) limit 1;
  if unknown is not null then
    raise exception 'Unknown field: %', unknown using errcode = '22023';
  end if;

  select * into link from public.place_images
  where place_id = p_place_id and image_id = p_image_id
  for update;
  if not found then
    raise exception 'This photograph is not linked to the place.' using errcode = 'P0002';
  end if;

  new_status := coalesce(p_values ->> 'status', link.status);
  if new_status not in ('approved', 'rejected') and new_status <> link.status then
    raise exception 'Unknown status: %', new_status using errcode = '22023';
  end if;
  new_primary := (
    coalesce((p_values ->> 'is_primary')::boolean, link.is_primary)
    or not exists (
      select 1 from public.place_images
      where place_id = p_place_id and image_id <> p_image_id and is_primary
    )
  ) and new_status = 'approved';
  if (p_values ->> 'is_primary')::boolean and new_status <> 'approved' then
    raise exception 'Only an approved photograph can be the main one.' using errcode = '22023';
  end if;
  if p_values ? 'alt_text' and nullif(btrim(coalesce(p_values ->> 'alt_text', '')), '') is null then
    raise exception 'A photograph needs alt text.' using errcode = '22023';
  end if;

  if new_primary and not link.is_primary then
    update public.place_images set is_primary = false
    where place_id = p_place_id and is_primary;
  end if;

  update public.place_images
  set status = new_status,
      is_primary = new_primary,
      caption = case when p_values ? 'caption'
        then nullif(btrim(coalesce(p_values ->> 'caption', '')), '') else caption end,
      alt_text = case when p_values ? 'alt_text' then btrim(p_values ->> 'alt_text')
        else alt_text end,
      gallery_position = case
        when new_status <> 'approved' then null
        when link.status <> 'approved' then coalesce((
          select max(gallery_position) from public.place_images
          where place_id = p_place_id and status = 'approved'
        ), 0) + 1
        else gallery_position
      end,
      reviewed_by = (select auth.uid()),
      reviewed_at = now()
  where place_id = p_place_id and image_id = p_image_id
  returning * into link;
  perform public.place_images_settle_main(p_place_id);
  select * into link from public.place_images
  where place_id = p_place_id and image_id = p_image_id;
  return link;
end;
$$;

select public.place_images_settle_main(place_id)
from (select distinct place_id from public.place_images where status = 'approved') as places;

-- The photo queue --------------------------------------------------------------------------

create function public.photo_queue(p_limit integer, p_offset integer)
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
  order by summary.name, summary.id
  limit p_limit
  offset p_offset;
end;
$$;

comment on function public.photo_queue(integer, integer) is
  'Admin only. Published places with suggested photographs, by name, with how many and the total.';

revoke all on function public.photo_queue(integer, integer) from public, anon, authenticated;
grant execute on function public.photo_queue(integer, integer) to authenticated;
