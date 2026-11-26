-- Corrections task 03: the review queue, map outlines, and photos.
-- admin_correction_list() reads corrections by status, with each polygon as GeoJSON.
-- set_correction_photos() replaces a correction's photo paths in correction-photos.
-- Table in design.md §4.7, access rules in §6.

-- Corrections with any of the statuses, newest first, with the total.
create function public.admin_correction_list(
  p_statuses text[],
  p_limit integer,
  p_offset integer
)
returns table (
  id uuid,
  layer_id text,
  layer_version text,
  years integer[],
  action text,
  value jsonb,
  note text,
  photo_paths text[],
  review_status text,
  review_note text,
  created_at timestamptz,
  reviewed_at timestamptz,
  geojson jsonb,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can read corrections.' using errcode = '42501';
  end if;
  if p_statuses is null or cardinality(p_statuses) = 0
     or not (p_statuses <@ array['submitted', 'approved', 'rejected']) then
    raise exception 'The statuses must be submitted, approved, or rejected.'
      using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 or p_offset is null or p_offset < 0 then
    raise exception 'The limit must be 1 to 1000 and the offset at least 0.'
      using errcode = '22023';
  end if;
  return query
  select c.id, c.layer_id, c.layer_version, c.years, c.action, c.value, c.note,
    c.photo_paths, c.review_status, c.review_note, c.created_at, c.reviewed_at,
    extensions.st_asgeojson(c.geom)::jsonb,
    count(*) over () as total_count
  from public.layer_corrections as c
  where c.review_status = any (p_statuses)
  order by c.created_at desc, c.id
  limit p_limit
  offset p_offset;
end;
$$;

comment on function public.admin_correction_list(text[], integer, integer) is
  'Admin only. Corrections with any of the statuses, newest first, with the polygon as GeoJSON and the total.';

-- Replaces a correction's photos. Each path is an object in correction-photos under
-- the correction's id.
create function public.set_correction_photos(p_id uuid, p_paths text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  paths text[] := coalesce(p_paths, '{}');
  saved text[];
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can change correction photos.' using errcode = '42501';
  end if;
  if cardinality(paths) > 6 then
    raise exception 'A correction can have at most 6 photos.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(paths) as path
    where path is null or path !~ ('^' || p_id::text || '/[^/]+$')
  ) then
    raise exception 'Each photo must be stored under the correction''s id.'
      using errcode = '22023';
  end if;
  update public.layer_corrections
  set photo_paths = paths
  where id = p_id
  returning photo_paths into saved;
  if not found then
    raise exception 'No correction has id %', p_id using errcode = 'P0002';
  end if;
  return saved;
end;
$$;

comment on function public.set_correction_photos(uuid, text[]) is
  'Admin only. Replaces a correction''s photo paths, at most 6, each under the correction''s id.';

-- Access ---------------------------------------------------------------------------------

revoke all on function public.admin_correction_list(text[], integer, integer)
  from public, anon, authenticated;
grant execute on function public.admin_correction_list(text[], integer, integer)
  to authenticated;
revoke all on function public.set_correction_photos(uuid, text[])
  from public, anon, authenticated;
grant execute on function public.set_correction_photos(uuid, text[]) to authenticated;
