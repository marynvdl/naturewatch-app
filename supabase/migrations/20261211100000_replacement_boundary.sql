-- Shaping Boundaries task 05: upload a replacement boundary.
-- submit_boundary() stores an admin's GeoJSON as a proposed version,
-- approve_boundary() makes it current, and reject_boundary() discards it.
-- proposed_boundary() returns a place's proposed version, with its shape, to an
-- admin. A new current boundary starts unchecked and pending: QC comes from
-- check_boundaries.py measure --unchecked on a laptop. Design in design.md §4.2.

alter table public.place_boundaries
  add column submitted_by uuid references public.profiles (id) on delete set null,
  add column reviewed_by uuid references public.profiles (id) on delete set null;

comment on column public.place_boundaries.submitted_by is
  'Who uploaded this version. Null for an imported boundary.';
comment on column public.place_boundaries.reviewed_by is
  'Who approved or rejected this version. Null for an imported boundary.';

-- At most one proposed version per place. It also serves proposed_boundary().
create unique index place_boundaries_proposed_key
  on public.place_boundaries (place_id)
  where review_status = 'proposed';

-- Audit ---------------------------------------------------------------------------------
-- An upload, an approval, a rejection, and a superseded boundary are audited, as the
-- QC and eligibility changes are. The importer's inserts are still not logged, but a
-- boundary it supersedes is.
drop trigger audit_place_boundaries_review on public.place_boundaries;

create trigger audit_place_boundaries_review
after update of qc_status, stats_eligibility, stats_eligibility_reason, review_status, is_current
on public.place_boundaries
for each row
when (
  old.qc_status is distinct from new.qc_status
  or old.stats_eligibility is distinct from new.stats_eligibility
  or old.stats_eligibility_reason is distinct from new.stats_eligibility_reason
  or old.review_status is distinct from new.review_status
  or old.is_current is distinct from new.is_current
)
execute function public.audit_row('id', '-geom');

create trigger audit_place_boundaries_submitted
after insert on public.place_boundaries
for each row
when (new.submitted_by is not null)
execute function public.audit_row('id', '-geom');

-- Submit ---------------------------------------------------------------------------------
-- p_geojson is a GeoJSON Polygon or MultiPolygon geometry in WGS 84.
create function public.submit_boundary(
  p_place_id uuid,
  p_geojson jsonb,
  p_source_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  shape extensions.geometry;
  source_link text := nullif(btrim(coalesce(p_source_url, '')), '');
  saved uuid;
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can upload a boundary.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.places as p where p.id = p_place_id) then
    raise exception 'No place has this id.' using errcode = 'P0002';
  end if;
  perform 1 from public.places as p where p.id = p_place_id for update;
  if not exists (
    select 1 from public.place_boundaries as b where b.place_id = p_place_id and b.is_current
  ) then
    raise exception 'This place has no current boundary to replace.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.place_boundaries as b
    where b.place_id = p_place_id and b.review_status = 'proposed'
  ) then
    raise exception 'This place already has a proposed boundary. Approve or discard it first.'
      using errcode = '22023';
  end if;
  if source_link is not null and char_length(source_link) > 1000 then
    raise exception 'The source link can be at most 1,000 characters.' using errcode = '22023';
  end if;
  if p_geojson is null or jsonb_typeof(p_geojson) <> 'object'
     or p_geojson ->> 'type' not in ('Polygon', 'MultiPolygon') then
    raise exception 'The shape must be a GeoJSON Polygon or MultiPolygon.'
      using errcode = '22023';
  end if;
  begin
    shape := extensions.st_force2d(
      extensions.st_setsrid(extensions.st_geomfromgeojson(p_geojson::text), 4326)
    );
  exception when others then
    raise exception 'The shape is not valid GeoJSON.' using errcode = '22023';
  end;
  if extensions.st_isempty(shape) then
    raise exception 'The shape is empty.' using errcode = '22023';
  end if;
  if extensions.st_npoints(shape) > 100000 then
    raise exception 'The shape has more than 100,000 points.' using errcode = '22023';
  end if;
  if extensions.st_xmin(shape) < -180 or extensions.st_xmax(shape) > 180
     or extensions.st_ymin(shape) < -90 or extensions.st_ymax(shape) > 90 then
    raise exception 'The shape must be in longitude and latitude.' using errcode = '22023';
  end if;
  if not extensions.st_isvalid(shape) then
    raise exception 'The shape is not valid: %', extensions.st_isvalidreason(shape)
      using errcode = '22023';
  end if;

  insert into public.place_boundaries (
    place_id, version_number, geom, source_id, source_url, review_status, submitted_by
  )
  select
    p_place_id,
    coalesce(max(b.version_number), 0) + 1,
    extensions.st_multi(shape),
    'sooty-earth-contributors',
    source_link,
    'proposed',
    (select auth.uid())
  from public.place_boundaries as b
  where b.place_id = p_place_id
  returning id into saved;
  return saved;
end;
$$;

comment on function public.submit_boundary(uuid, jsonb, text) is
  'Admin only. Stores a valid GeoJSON Polygon or MultiPolygon of at most 100,000 points as the place''s proposed boundary, and returns its id.';

revoke all on function public.submit_boundary(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.submit_boundary(uuid, jsonb, text) to authenticated;

-- Approve and reject ---------------------------------------------------------------------
create function public.approve_boundary(p_boundary_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  status text;
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can approve a boundary.' using errcode = '42501';
  end if;
  select b.place_id, b.review_status into target, status
  from public.place_boundaries as b
  where b.id = p_boundary_id
  for update;
  if not found then
    raise exception 'No boundary has this id.' using errcode = 'P0002';
  end if;
  if status <> 'proposed' then
    raise exception 'Only a proposed boundary can be approved.' using errcode = '22023';
  end if;

  update public.place_boundaries as b
  set is_current = false,
    superseded_at = now()
  where b.place_id = target and b.is_current;

  update public.place_boundaries as b
  set review_status = 'approved',
    is_current = true,
    reviewed_by = (select auth.uid()),
    reviewed_at = now()
  where b.id = p_boundary_id;
  return p_boundary_id;
end;
$$;

comment on function public.approve_boundary(uuid) is
  'Admin only. Makes a proposed boundary current and supersedes the old one. The new boundary stays unchecked and pending.';

revoke all on function public.approve_boundary(uuid) from public, anon, authenticated;
grant execute on function public.approve_boundary(uuid) to authenticated;

create function public.reject_boundary(p_boundary_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  status text;
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can discard a boundary.' using errcode = '42501';
  end if;
  select b.review_status into status
  from public.place_boundaries as b
  where b.id = p_boundary_id
  for update;
  if not found then
    raise exception 'No boundary has this id.' using errcode = 'P0002';
  end if;
  if status <> 'proposed' then
    raise exception 'Only a proposed boundary can be discarded.' using errcode = '22023';
  end if;

  update public.place_boundaries as b
  set review_status = 'rejected',
    reviewed_by = (select auth.uid()),
    reviewed_at = now()
  where b.id = p_boundary_id;
  return p_boundary_id;
end;
$$;

comment on function public.reject_boundary(uuid) is
  'Admin only. Rejects a proposed boundary. It is kept, and is never current.';

revoke all on function public.reject_boundary(uuid) from public, anon, authenticated;
grant execute on function public.reject_boundary(uuid) to authenticated;

-- The proposed version -------------------------------------------------------------------
-- The shape of a proposed boundary only: submit_boundary() caps it at 100,000 points.
create function public.proposed_boundary(p_place_id uuid)
returns table (
  boundary_id uuid,
  area_km2 double precision,
  points integer,
  source_url text,
  submitted_by uuid,
  created_at timestamptz,
  shape jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can read a proposed boundary.' using errcode = '42501';
  end if;
  return query
  select b.id, b.area_km2, extensions.st_npoints(b.geom), b.source_url, b.submitted_by,
    b.created_at, extensions.st_asgeojson(b.geom, 7)::jsonb
  from public.place_boundaries as b
  where b.place_id = p_place_id and b.review_status = 'proposed';
end;
$$;

comment on function public.proposed_boundary(uuid) is
  'Admin only. The place''s proposed boundary, if any, with its area, point count, uploader, and shape as GeoJSON.';

revoke all on function public.proposed_boundary(uuid) from public, anon, authenticated;
grant execute on function public.proposed_boundary(uuid) to authenticated;
