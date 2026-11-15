-- Molding Places task 05: the photo queue in the Places panel. The published places
-- that have suggested photographs, with how many, for an admin to review one at a
-- time. supabase/suggest_photos.py writes the suggestions. Tables are in design.md
-- §4.6, access rules in §6.

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
