-- Molding Places task 03: an admin adds, confirms, rejects, and retires links between
-- places. created_by and reviewed_by, set_place_relationship(), the audit trigger,
-- and an admin read of every link. Tables are in design.md §4.5, access rules in §6.

alter table public.place_relationships
  add column created_by uuid references public.profiles (id) on delete set null,
  add column reviewed_by uuid references public.profiles (id) on delete set null;

comment on column public.place_relationships.created_by is
  'The admin who added a manual link. Null for imported and derived links.';
comment on column public.place_relationships.reviewed_by is
  'The admin who last set the status or retired the link.';

-- Sets the status of the active link (subject, type, object), or retires it. When no
-- active link exists, confirmed or proposed adds a manual one. A symmetric link is
-- given in either order and stored with the smaller id as its subject.
create function public.set_place_relationship(
  p_subject_place_id uuid,
  p_relationship_type_id text,
  p_object_place_id uuid,
  p_status text
)
returns public.place_relationships
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_symmetric_type boolean;
  subject_id uuid := p_subject_place_id;
  object_id uuid := p_object_place_id;
  actor uuid := (select auth.uid());
  link public.place_relationships;
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can change a link.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('proposed', 'confirmed', 'rejected', 'retired') then
    raise exception 'Unknown status: %', p_status using errcode = '22023';
  end if;
  select is_symmetric into is_symmetric_type
  from public.place_relationship_types
  where id = p_relationship_type_id;
  if not found then
    raise exception 'Unknown link type: %', p_relationship_type_id using errcode = '22023';
  end if;
  if subject_id is null or object_id is null or subject_id = object_id then
    raise exception 'A link needs two different places.' using errcode = '22023';
  end if;
  if (select count(*) from public.places where id in (subject_id, object_id)) <> 2 then
    raise exception 'No place has one of these ids.' using errcode = 'P0002';
  end if;
  if is_symmetric_type and subject_id > object_id then
    subject_id := p_object_place_id;
    object_id := p_subject_place_id;
  end if;

  select * into link
  from public.place_relationships
  where subject_place_id = subject_id
    and relationship_type_id = p_relationship_type_id
    and object_place_id = object_id
    and retired_at is null
  for update;

  if found then
    if p_status = 'retired' then
      update public.place_relationships
      set retired_at = now(), reviewed_by = actor
      where id = link.id
      returning * into link;
    else
      update public.place_relationships
      set status = p_status, reviewed_by = actor
      where id = link.id
      returning * into link;
    end if;
    return link;
  end if;

  if p_status in ('rejected', 'retired') then
    raise exception 'No active % link between these places.', p_relationship_type_id
      using errcode = 'P0002';
  end if;

  insert into public.place_relationships (
    subject_place_id, relationship_type_id, object_place_id, origin, status,
    created_by, reviewed_by
  )
  values (subject_id, p_relationship_type_id, object_id, 'manual', p_status, actor, actor)
  returning * into link;
  return link;
end;
$$;

comment on function public.set_place_relationship(uuid, text, uuid, text) is
  'Admin only. Sets the status of a link, retires it, or adds a manual one.';

revoke all on function public.set_place_relationship(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_place_relationship(uuid, text, uuid, text)
  to authenticated;

-- Every change is audited, including the rows derive_recognises.py writes, with a
-- null actor.
create trigger audit_place_relationships
after insert or update or delete on public.place_relationships
for each row execute function public.audit_row('id');

-- Edit mode lists proposed, rejected, and retired links too.
create policy place_relationships_select_admin
  on public.place_relationships
  for select
  to authenticated
  using ((select public.has_role('admin')));
