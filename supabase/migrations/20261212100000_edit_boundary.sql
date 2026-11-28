-- Edit a boundary on the map (Shaping Boundaries task 06).
-- current_boundary_shape() gives an admin the current shape of at most 5,000 points to
-- edit. submit_boundary() records the boundary an edit was made from, and
-- proposed_boundary() returns it.

-- The current shape, for editing -----------------------------------------------------------
create function public.current_boundary_shape(p_place_id uuid)
returns table (
  boundary_id uuid,
  version_number integer,
  points integer,
  shape jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can edit a boundary.' using errcode = '42501';
  end if;
  return query
  select b.id, b.version_number, counted.points,
    case when counted.points <= 5000
      then extensions.st_asgeojson(b.geom, 7)::jsonb
    end
  from public.place_boundaries as b
  cross join lateral (select extensions.st_npoints(b.geom) as points) as counted
  where b.place_id = p_place_id and b.is_current;
end;
$$;

comment on function public.current_boundary_shape(uuid) is
  'Admin only. The place''s current boundary with its point count, and its shape as GeoJSON when it has at most 5,000 points, for editing on the map.';

revoke all on function public.current_boundary_shape(uuid) from public, anon, authenticated;
grant execute on function public.current_boundary_shape(uuid) to authenticated;

-- Submit, with the boundary an edit was made from ------------------------------------------
drop function public.submit_boundary(uuid, jsonb, text);

-- p_geojson is a GeoJSON Polygon or MultiPolygon geometry in WGS 84.
-- p_derived_from_boundary_id is the current boundary an edit was made from, or null.
create function public.submit_boundary(
  p_place_id uuid,
  p_geojson jsonb,
  p_source_url text default null,
  p_derived_from_boundary_id uuid default null
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
  if p_derived_from_boundary_id is not null and not exists (
    select 1 from public.place_boundaries as b
    where b.id = p_derived_from_boundary_id and b.place_id = p_place_id and b.is_current
  ) then
    raise exception 'The edit must start from this place''s current boundary.'
      using errcode = '22023';
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
    place_id, version_number, geom, source_id, source_url, review_status, submitted_by,
    derived_from_boundary_id
  )
  select
    p_place_id,
    coalesce(max(b.version_number), 0) + 1,
    extensions.st_multi(shape),
    'sooty-earth-contributors',
    source_link,
    'proposed',
    (select auth.uid()),
    p_derived_from_boundary_id
  from public.place_boundaries as b
  where b.place_id = p_place_id
  returning id into saved;
  return saved;
end;
$$;

comment on function public.submit_boundary(uuid, jsonb, text, uuid) is
  'Admin only. Stores a valid GeoJSON Polygon or MultiPolygon of at most 100,000 points as the place''s proposed boundary, with the current boundary an edit was made from, and returns its id.';

revoke all on function public.submit_boundary(uuid, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.submit_boundary(uuid, jsonb, text, uuid) to authenticated;

-- The proposed version, with the boundary it was edited from -------------------------------
drop function public.proposed_boundary(uuid);

create function public.proposed_boundary(p_place_id uuid)
returns table (
  boundary_id uuid,
  area_km2 double precision,
  points integer,
  source_url text,
  submitted_by uuid,
  created_at timestamptz,
  derived_from_boundary_id uuid,
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
    b.created_at, b.derived_from_boundary_id, extensions.st_asgeojson(b.geom, 7)::jsonb
  from public.place_boundaries as b
  where b.place_id = p_place_id and b.review_status = 'proposed';
end;
$$;

comment on function public.proposed_boundary(uuid) is
  'Admin only. The place''s proposed boundary, if any, with its area, point count, uploader, the boundary it was edited from, and shape as GeoJSON.';

revoke all on function public.proposed_boundary(uuid) from public, anon, authenticated;
grant execute on function public.proposed_boundary(uuid) to authenticated;
