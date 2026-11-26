-- Corrections task 01: an admin records that a layer is wrong inside a polygon.
-- layer_corrections, submit_correction(), review_correction(), and the private
-- correction-photos bucket. Which actions and values a layer accepts is in the catalog
-- (layers.json); the database checks only the rules shared by every layer.
-- Table in design.md §4.7, access rules in §6.

create table public.layer_corrections (
  id uuid primary key default gen_random_uuid(),
  layer_id text not null,
  layer_version text,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  years integer[] not null,
  action text not null,
  value jsonb,
  note text,
  photo_paths text[] not null default '{}',
  review_status text not null default 'submitted',
  submitted_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint layer_corrections_layer_id_format check (layer_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint layer_corrections_years_not_empty check (cardinality(years) > 0),
  constraint layer_corrections_action_check check (action in ('remove', 'add', 'reclassify')),
  constraint layer_corrections_value_object
    check (value is null or jsonb_typeof(value) = 'object'),
  constraint layer_corrections_remove_no_value check (action <> 'remove' or value is null),
  constraint layer_corrections_note_length
    check (char_length(note) <= 1000 and btrim(note) <> ''),
  constraint layer_corrections_review_note_length
    check (char_length(review_note) <= 500 and btrim(review_note) <> ''),
  constraint layer_corrections_review_status_check
    check (review_status in ('submitted', 'approved', 'rejected'))
);

comment on table public.layer_corrections is
  'A polygon where a layer is wrong, with what should be there instead. Applied only once approved, as an overlay on the sprout.';
comment on column public.layer_corrections.layer_id is
  'The layer id in layers.json. No foreign key: the catalog is not in the database.';
comment on column public.layer_corrections.layer_version is
  'The catalog source.version of the layer when the correction was submitted.';
comment on column public.layer_corrections.years is
  'The layer years the correction applies to.';
comment on column public.layer_corrections.value is
  'For add and reclassify: the values the catalog lists for the layer, such as {"share": 0.5} or {"level": 3, "surface": 1}.';
comment on column public.layer_corrections.photo_paths is
  'Object paths in the correction-photos bucket.';

create index layer_corrections_layer_status_idx
  on public.layer_corrections (layer_id, review_status);
create index layer_corrections_geom_idx
  on public.layer_corrections using gist (geom);

create trigger layer_corrections_set_updated_at
before update on public.layer_corrections
for each row execute function public.set_updated_at();

create trigger audit_layer_corrections
after insert or update or delete on public.layer_corrections
for each row execute function public.audit_row('id');

-- RPCs -----------------------------------------------------------------------------------

-- Stores a correction as submitted and returns its id. p_geojson is a GeoJSON Polygon
-- or MultiPolygon geometry in WGS 84.
create function public.submit_correction(
  p_layer_id text,
  p_layer_version text,
  p_geojson jsonb,
  p_years integer[],
  p_action text,
  p_value jsonb default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  shape extensions.geometry;
  saved uuid;
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can submit a correction.' using errcode = '42501';
  end if;
  if p_geojson is null or jsonb_typeof(p_geojson) <> 'object'
     or p_geojson ->> 'type' not in ('Polygon', 'MultiPolygon') then
    raise exception 'The shape must be a GeoJSON Polygon or MultiPolygon.'
      using errcode = '22023';
  end if;
  begin
    shape := extensions.st_setsrid(extensions.st_geomfromgeojson(p_geojson::text), 4326);
  exception when others then
    raise exception 'The shape is not valid GeoJSON.' using errcode = '22023';
  end;
  if extensions.st_isempty(shape) then
    raise exception 'The shape is empty.' using errcode = '22023';
  end if;
  if extensions.st_npoints(shape) > 5000 then
    raise exception 'The shape has more than 5,000 vertices.' using errcode = '22023';
  end if;
  if not extensions.st_isvalid(shape) then
    raise exception 'The shape is not valid: %', extensions.st_isvalidreason(shape)
      using errcode = '22023';
  end if;

  insert into public.layer_corrections (
    layer_id, layer_version, geom, years, action, value, note, submitted_by
  )
  values (
    p_layer_id, nullif(btrim(coalesce(p_layer_version, '')), ''),
    extensions.st_multi(shape), p_years, p_action, p_value,
    nullif(btrim(coalesce(p_note, '')), ''), (select auth.uid())
  )
  returning id into saved;
  return saved;
end;
$$;

comment on function public.submit_correction(text, text, jsonb, integer[], text, jsonb, text) is
  'Admin only. Stores a correction to a layer as submitted and returns its id.';

-- Approves or rejects a correction, or sets it back to submitted.
create function public.review_correction(
  p_id uuid,
  p_status text,
  p_note text default null
)
returns public.layer_corrections
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.layer_corrections;
  submitted boolean := p_status = 'submitted';
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can review a correction.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('submitted', 'approved', 'rejected') then
    raise exception 'The status must be submitted, approved, or rejected.'
      using errcode = '22023';
  end if;
  update public.layer_corrections
  set review_status = p_status,
    reviewed_by = case when submitted then null else (select auth.uid()) end,
    reviewed_at = case when submitted then null else now() end,
    review_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_id
  returning * into saved;
  if not found then
    raise exception 'No correction has id %', p_id using errcode = 'P0002';
  end if;
  return saved;
end;
$$;

comment on function public.review_correction(uuid, text, text) is
  'Admin only. Sets a correction to approved or rejected, or back to submitted, with an optional note.';

-- Storage --------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'correction-photos', 'correction-photos', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp']
);

create policy "admins read correction photos"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'correction-photos' and (select public.has_role('admin')));

create policy "admins upload correction photos"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'correction-photos' and (select public.has_role('admin')));

create policy "admins update correction photos"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'correction-photos' and (select public.has_role('admin')));

create policy "admins delete correction photos"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'correction-photos' and (select public.has_role('admin')));

-- Access ---------------------------------------------------------------------------------

alter table public.layer_corrections enable row level security;

revoke all on table public.layer_corrections from public, anon, authenticated;
grant select on table public.layer_corrections to authenticated;
grant select, insert, update, delete on table public.layer_corrections to service_role;

create policy layer_corrections_select_admin
  on public.layer_corrections for select to authenticated
  using ((select public.has_role('admin')));

revoke all on function public.submit_correction(text, text, jsonb, integer[], text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.submit_correction(text, text, jsonb, integer[], text, jsonb, text)
  to authenticated;
revoke all on function public.review_correction(uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_correction(uuid, text, text) to authenticated;
