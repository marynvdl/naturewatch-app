-- Molding Places task 04: photographs of places. The Creative Commons licences, the
-- sources wikimedia-commons and sooty-earth-contributors, images, place_images, the
-- place-images Storage bucket, and the admin RPCs that add, review, and order them.
-- Tables are in design.md §4.6, access rules in §6.

-- Licences and sources ------------------------------------------------------------------

insert into public.licences (
  id, title, url, requires_attribution, share_alike, allows_commercial
) values
  ('cc0-1.0', 'CC0 1.0 Universal',
   'https://creativecommons.org/publicdomain/zero/1.0/', false, false, true),
  ('public-domain', 'Public domain',
   'https://creativecommons.org/publicdomain/mark/1.0/', false, false, true),
  ('cc-by-2.0', 'Creative Commons Attribution 2.0 Generic',
   'https://creativecommons.org/licenses/by/2.0/', true, false, true),
  ('cc-by-2.5', 'Creative Commons Attribution 2.5 Generic',
   'https://creativecommons.org/licenses/by/2.5/', true, false, true),
  ('cc-by-3.0', 'Creative Commons Attribution 3.0 Unported',
   'https://creativecommons.org/licenses/by/3.0/', true, false, true),
  ('cc-by-4.0', 'Creative Commons Attribution 4.0 International',
   'https://creativecommons.org/licenses/by/4.0/', true, false, true),
  ('cc-by-sa-2.0', 'Creative Commons Attribution-ShareAlike 2.0 Generic',
   'https://creativecommons.org/licenses/by-sa/2.0/', true, true, true),
  ('cc-by-sa-2.5', 'Creative Commons Attribution-ShareAlike 2.5 Generic',
   'https://creativecommons.org/licenses/by-sa/2.5/', true, true, true),
  ('cc-by-sa-3.0', 'Creative Commons Attribution-ShareAlike 3.0 Unported',
   'https://creativecommons.org/licenses/by-sa/3.0/', true, true, true),
  ('cc-by-sa-4.0', 'Creative Commons Attribution-ShareAlike 4.0 International',
   'https://creativecommons.org/licenses/by-sa/4.0/', true, true, true);

insert into public.sources (id, source_kind, title, publisher, url) values
  ('wikimedia-commons', 'platform', 'Wikimedia Commons', 'Wikimedia Foundation',
   'https://commons.wikimedia.org'),
  ('sooty-earth-contributors', 'contributors', 'Sooty Earth contributors', null, null);

-- Images -------------------------------------------------------------------------------

create table public.images (
  id uuid primary key default gen_random_uuid(),
  storage_path text,
  external_url text,
  source_id text not null references public.sources (id),
  source_release_id uuid references public.source_releases (id),
  source_record_id text,
  source_url text,
  creator_name text not null,
  credit_text text,
  licence_id text not null references public.licences (id),
  uploaded_by uuid references public.profiles (id) on delete set null,
  sha256 text unique,
  width integer,
  height integer,
  image_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint images_one_location
    check ((storage_path is null) <> (external_url is null)),
  constraint images_image_status_check check (image_status in ('active', 'removed')),
  constraint images_sha256_hex check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint images_size_positive check (width > 0 and height > 0),
  constraint images_creator_name_not_blank check (btrim(creator_name) <> '')
);

comment on table public.images is
  'A photograph file, its rights, and its source. place_images links it to places.';
comment on column public.images.storage_path is
  'Object path in the place-images bucket, for uploads.';
comment on column public.images.external_url is
  'The file on another site. Only Wikimedia Commons files are linked.';
comment on column public.images.source_record_id is
  'The file title on Commons (File:…). Unique per source.';
comment on column public.images.uploaded_by is
  'The admin who added it. Null for pipelines.';
comment on column public.images.image_status is
  'removed hides the image from every place.';

create unique index images_source_record_key
  on public.images (source_id, source_record_id)
  where source_record_id is not null;

create trigger images_set_updated_at
  before update on public.images
  for each row execute function public.set_updated_at();

create table public.place_images (
  place_id uuid not null references public.places (id) on delete cascade,
  image_id uuid not null references public.images (id),
  status text not null,
  suggested_by_user uuid references public.profiles (id) on delete set null,
  suggested_by_pipeline text,
  suggestion_score double precision,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  caption text,
  alt_text text not null,
  is_primary boolean not null default false,
  gallery_position integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (place_id, image_id),
  constraint place_images_status_check
    check (status in ('suggested', 'approved', 'rejected', 'withdrawn')),
  constraint place_images_primary_approved check (not is_primary or status = 'approved'),
  constraint place_images_caption_length check (char_length(caption) <= 300),
  constraint place_images_alt_text_length check (char_length(alt_text) <= 300)
);

comment on table public.place_images is
  'Links an image to a place, with its own review, caption, order, and main flag.';
comment on column public.place_images.is_primary is
  'The main photograph of the place. One per place, and only when approved.';
comment on column public.place_images.gallery_position is
  'Order of the approved photographs after the main one.';

create unique index place_images_one_primary
  on public.place_images (place_id)
  where is_primary;

create index place_images_image_id_idx on public.place_images (image_id);

create trigger place_images_set_updated_at
  before update on public.place_images
  for each row execute function public.set_updated_at();

create trigger audit_images
after insert or update or delete on public.images
for each row execute function public.audit_row('id');

create trigger audit_place_images
after insert or update or delete on public.place_images
for each row execute function public.audit_row('place_id', 'image_id');

-- Storage --------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'place-images', 'place-images', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp']
);

create policy "admins upload place images"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'place-images' and (select public.has_role('admin')));

create policy "admins update place images"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'place-images' and (select public.has_role('admin')));

create policy "admins delete place images"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'place-images' and (select public.has_role('admin')));

-- RPCs -----------------------------------------------------------------------------------

-- Raises unless the caller is an admin and the place exists.
create function public.place_images_check(p_place_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can change photographs.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.places where id = p_place_id) then
    raise exception 'No place has id %', p_place_id using errcode = 'P0002';
  end if;
end;
$$;

-- Links an active image to a place as approved, last in the gallery.
create function public.place_images_insert(
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
    caption, alt_text, gallery_position
  )
  values (
    p_place_id, p_image_id, 'approved', actor, actor, now(),
    nullif(btrim(coalesce(p_caption, '')), ''), btrim(p_alt_text),
    coalesce((
      select max(gallery_position) from public.place_images
      where place_id = p_place_id and status = 'approved'
    ), 0) + 1
  )
  returning * into link;
  return link;
end;
$$;

-- Stores an image, or reuses the one with the same sha256 or Commons file, and links it
-- to the place as approved. The keys of p_image are image columns plus caption and
-- alt_text.
create function public.add_place_image(p_place_id uuid, p_image jsonb)
returns public.place_images
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed text[] := array[
    'storage_path', 'external_url', 'source_id', 'source_record_id', 'source_url',
    'creator_name', 'credit_text', 'licence_id', 'sha256', 'width', 'height',
    'caption', 'alt_text'
  ];
  unknown text;
  image public.images;
begin
  perform public.place_images_check(p_place_id);
  if p_image is null or jsonb_typeof(p_image) <> 'object' then
    raise exception 'The image must be a JSON object.' using errcode = '22023';
  end if;
  select key into unknown from jsonb_object_keys(p_image) as key
  where key <> all (allowed) limit 1;
  if unknown is not null then
    raise exception 'Unknown field: %', unknown using errcode = '22023';
  end if;
  if not exists (select 1 from public.sources where id = p_image ->> 'source_id') then
    raise exception 'Unknown source: %', p_image ->> 'source_id' using errcode = '22023';
  end if;
  if not exists (select 1 from public.licences where id = p_image ->> 'licence_id') then
    raise exception 'Unknown licence: %', p_image ->> 'licence_id' using errcode = '22023';
  end if;

  select * into image from public.images
  where (p_image ->> 'sha256' is not null and sha256 = p_image ->> 'sha256')
     or (p_image ->> 'source_record_id' is not null
         and source_id = p_image ->> 'source_id'
         and source_record_id = p_image ->> 'source_record_id')
  limit 1;

  if not found then
    insert into public.images (
      storage_path, external_url, source_id, source_record_id, source_url,
      creator_name, credit_text, licence_id, uploaded_by, sha256, width, height
    )
    values (
      p_image ->> 'storage_path', p_image ->> 'external_url', p_image ->> 'source_id',
      p_image ->> 'source_record_id', p_image ->> 'source_url',
      btrim(p_image ->> 'creator_name'), p_image ->> 'credit_text',
      p_image ->> 'licence_id', (select auth.uid()), p_image ->> 'sha256',
      (p_image ->> 'width')::integer, (p_image ->> 'height')::integer
    )
    returning * into image;
  elsif image.image_status <> 'active' then
    raise exception 'This photograph was removed.' using errcode = '22023';
  end if;

  return public.place_images_insert(
    p_place_id, image.id, p_image ->> 'caption', p_image ->> 'alt_text'
  );
end;
$$;

-- Links an image already stored, such as a recognition's photograph, to the place. Its
-- caption and alt text are copied from its latest approved link.
create function public.link_place_image(p_place_id uuid, p_image_id uuid)
returns public.place_images
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_link public.place_images;
begin
  perform public.place_images_check(p_place_id);
  if not exists (
    select 1 from public.images where id = p_image_id and image_status = 'active'
  ) then
    raise exception 'No active image has id %', p_image_id using errcode = 'P0002';
  end if;
  select * into source_link from public.place_images
  where image_id = p_image_id and status = 'approved'
  order by reviewed_at desc nulls last
  limit 1;
  if not found then
    raise exception 'This photograph is not approved for any place.' using errcode = 'P0002';
  end if;
  return public.place_images_insert(
    p_place_id, p_image_id, source_link.caption, source_link.alt_text
  );
end;
$$;

-- Changes the status, caption, alt text, or main flag of one link. Making one photograph
-- the main one clears the others. A photograph that is not approved is not in the
-- gallery and cannot be the main one.
create function public.set_place_image(p_place_id uuid, p_image_id uuid, p_values jsonb)
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
  new_primary := coalesce((p_values ->> 'is_primary')::boolean, link.is_primary)
    and new_status = 'approved';
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
  return link;
end;
$$;

-- Sets the gallery order. The ids must be exactly the place's approved photographs.
create function public.order_place_images(p_place_id uuid, p_image_ids uuid[])
returns setof public.place_images
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.place_images_check(p_place_id);
  if p_image_ids is null
    or cardinality(p_image_ids) <> (select count(distinct id) from unnest(p_image_ids) as id)
    or array(select unnest(p_image_ids) order by 1) is distinct from array(
      select image_id from public.place_images
      where place_id = p_place_id and status = 'approved'
      order by 1
    )
  then
    raise exception 'The order must list each approved photograph of the place once.'
      using errcode = '22023';
  end if;
  return query
  update public.place_images as links
  set gallery_position = ordered.position,
      reviewed_by = (select auth.uid()),
      reviewed_at = now()
  from unnest(p_image_ids) with ordinality as ordered (image_id, position)
  where links.place_id = p_place_id
    and links.image_id = ordered.image_id
    and links.gallery_position is distinct from ordered.position
  returning links.*;
end;
$$;

comment on function public.add_place_image(uuid, jsonb) is
  'Admin only. Stores or reuses an image and links it to a place as approved.';
comment on function public.link_place_image(uuid, uuid) is
  'Admin only. Links a stored, approved image to another place.';
comment on function public.set_place_image(uuid, uuid, jsonb) is
  'Admin only. Changes the status, caption, alt text, or main flag of a photograph.';
comment on function public.order_place_images(uuid, uuid[]) is
  'Admin only. Sets the gallery order of the approved photographs of a place.';

-- Access ---------------------------------------------------------------------------------

alter table public.images enable row level security;
alter table public.place_images enable row level security;

revoke all on table public.images from public, anon, authenticated;
revoke all on table public.place_images from public, anon, authenticated;
grant select on table public.images to anon, authenticated;
grant select on table public.place_images to anon, authenticated;
grant select, insert, update, delete on table public.images to service_role;
grant select, insert, update, delete on table public.place_images to service_role;

create policy place_images_select
  on public.place_images
  for select
  to anon, authenticated
  using (
    status = 'approved'
    and exists (
      select 1 from public.places
      where places.id = place_images.place_id
        and places.publication_status = 'published'
    )
  );

create policy images_select
  on public.images
  for select
  to anon, authenticated
  using (
    image_status = 'active'
    and exists (
      select 1
      from public.place_images
      join public.places on places.id = place_images.place_id
      where place_images.image_id = images.id
        and place_images.status = 'approved'
        and places.publication_status = 'published'
    )
  );

create policy place_images_select_admin
  on public.place_images
  for select
  to authenticated
  using ((select public.has_role('admin')));

create policy images_select_admin
  on public.images
  for select
  to authenticated
  using ((select public.has_role('admin')));

revoke all on function public.place_images_check(uuid) from public, anon, authenticated;
revoke all on function public.place_images_insert(uuid, uuid, text, text)
  from public, anon, authenticated;

revoke all on function public.add_place_image(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.link_place_image(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_place_image(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.order_place_images(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.add_place_image(uuid, jsonb) to authenticated;
grant execute on function public.link_place_image(uuid, uuid) to authenticated;
grant execute on function public.set_place_image(uuid, uuid, jsonb) to authenticated;
grant execute on function public.order_place_images(uuid, uuid[]) to authenticated;
