-- Molding Places task 01: profiles, roles, and the audit log.
--
-- Sign-in is Supabase Auth only (decisions.md, record 15). Only admins sign in
-- for now. Nothing here is written from the browser: roles are granted by the
-- owner, and later tasks write through security definer RPCs that check
-- has_role(). Tables are in design.md §4.6, access rules in §6.

-- Profiles ----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create function public.create_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

revoke all on function public.create_profile() from public, anon, authenticated;

create trigger create_profile
after insert on auth.users
for each row execute function public.create_profile();

-- Users invited before this migration get their profile here.
insert into public.profiles (id) select id from auth.users;

-- Roles -------------------------------------------------------------------------------

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('contributor', 'editor', 'admin')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create function public.has_role(role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_roles.user_id = (select auth.uid())
      and user_roles.role = has_role.role
  );
$$;

revoke all on function public.has_role(text) from public, anon, authenticated;
grant execute on function public.has_role(text) to authenticated;

-- Audit log ---------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id text,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now(),
  old_values jsonb,
  new_values jsonb
);

create index audit_log_table_row on public.audit_log (table_name, row_id);

-- One trigger function for every audited table. The trigger names the columns
-- that identify a row: create trigger … execute function public.audit_row('id').
-- actor is null for statements run by the owner or a pipeline.
create function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_json jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_json jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  source jsonb := coalesce(new_json, old_json);
  key_text text;
begin
  select string_agg(source ->> column_name, '/' order by position)
  into key_text
  from unnest(tg_argv) with ordinality as keys (column_name, position);

  insert into public.audit_log (table_name, row_id, action, actor, old_values, new_values)
  values (tg_table_name, key_text, lower(tg_op), (select auth.uid()), old_json, new_json);
  return null;
end;
$$;

revoke all on function public.audit_row() from public, anon, authenticated;

create trigger audit_user_roles
after insert or update or delete on public.user_roles
for each row execute function public.audit_row('user_id', 'role');

-- Access ------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_log enable row level security;

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.user_roles from public, anon, authenticated;
revoke all on table public.audit_log from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant select on table public.user_roles to authenticated;
grant select on table public.audit_log to authenticated;

create policy "own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "own roles" on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "admins read the audit log" on public.audit_log
  for select to authenticated
  using ((select public.has_role('admin')));
