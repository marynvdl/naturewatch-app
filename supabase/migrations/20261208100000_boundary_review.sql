-- Shaping Boundaries task 03: the polygon review queue.
-- audit_row() can leave columns out, the QC and eligibility changes on
-- place_boundaries are audited without geom, accept_boundary_qc() accepts a
-- flagged boundary's warnings, and admin_boundary_list() lists the pending or
-- excluded current boundaries with their findings. Design in design.md §4.2 and §4.6.

-- Audit ---------------------------------------------------------------------------------
-- An argument that starts with '-' names a column left out of old_values and
-- new_values. The other arguments are the key columns, as before.
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_json jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_json jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  source jsonb;
  key_text text;
  dropped text[];
begin
  select array_agg(substr(arg, 2))
  into dropped
  from unnest(tg_argv) as args (arg)
  where left(arg, 1) = '-';
  if dropped is not null then
    old_json := old_json - dropped;
    new_json := new_json - dropped;
  end if;
  source := coalesce(new_json, old_json);

  select string_agg(source ->> column_name, '/' order by position)
  into key_text
  from unnest(tg_argv) with ordinality as keys (column_name, position)
  where left(column_name, 1) <> '-';

  insert into public.audit_log (table_name, row_id, action, actor, old_values, new_values)
  values (tg_table_name, key_text, lower(tg_op), (select auth.uid()), old_json, new_json);
  return null;
end;
$$;

revoke all on function public.audit_row() from public, anon, authenticated;

-- Only a change to QC or eligibility is audited, so importer writes are not logged.
create trigger audit_place_boundaries_review
after update of qc_status, stats_eligibility, stats_eligibility_reason on public.place_boundaries
for each row
when (
  old.qc_status is distinct from new.qc_status
  or old.stats_eligibility is distinct from new.stats_eligibility
  or old.stats_eligibility_reason is distinct from new.stats_eligibility_reason
)
execute function public.audit_row('id', '-geom');

-- Accepting warnings --------------------------------------------------------------------
create function public.accept_boundary_qc(p_boundary_id uuid)
returns table (boundary_id uuid, qc_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  qc text;
  current_boundary boolean;
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can accept QC warnings.' using errcode = '42501';
  end if;
  select b.qc_status, b.is_current into qc, current_boundary
  from public.place_boundaries as b
  where b.id = p_boundary_id
  for update;
  if not found then
    raise exception 'No boundary has this id.' using errcode = 'P0002';
  end if;
  if not current_boundary then
    raise exception 'Only a current boundary can be accepted.' using errcode = '22023';
  end if;
  if qc <> 'flagged' then
    raise exception 'Only a flagged boundary can be accepted, not %.', qc using errcode = '22023';
  end if;
  return query
  update public.place_boundaries as b
  set qc_status = 'accepted'
  where b.id = p_boundary_id
  returning b.id, b.qc_status;
end;
$$;

comment on function public.accept_boundary_qc(uuid) is
  'Admin only. Accepts the warnings of a flagged current boundary: qc_status becomes accepted.';

revoke all on function public.accept_boundary_qc(uuid) from public, anon, authenticated;
grant execute on function public.accept_boundary_qc(uuid) to authenticated;

-- The queue -----------------------------------------------------------------------------
create function public.admin_boundary_list(p_eligibility text, p_limit integer, p_offset integer)
returns table (
  place_id uuid,
  name text,
  place_type_id text,
  iso3 text,
  area_km2 double precision,
  boundary_id uuid,
  qc_status text,
  stats_eligibility_reason text,
  warnings text[],
  vertex_count double precision,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can read this list.' using errcode = '42501';
  end if;
  if p_eligibility is null or p_eligibility not in ('pending', 'excluded') then
    raise exception 'The list must be pending or excluded.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 or p_offset is null or p_offset < 0 then
    raise exception 'The limit must be 1 to 200 and the offset at least 0.'
      using errcode = '22023';
  end if;
  return query
  select summary.id, summary.name, summary.place_type_id, summary.iso3,
    summary.area_km2::double precision, b.id, b.qc_status, b.stats_eligibility_reason,
    coalesce(findings.warnings, '{}'::text[]), findings.vertex_count,
    count(*) over () as total_count
  from public.place_boundaries as b
  join public.places on places.id = b.place_id
  join public.place_summaries as summary on summary.id = b.place_id
  left join lateral (
    select
      array_agg(latest.check_id order by latest.check_id)
        filter (where latest.outcome <> 'pass') as warnings,
      max(latest.measured_value) filter (where latest.check_id = 'vertex_count') as vertex_count
    from (
      select distinct on (c.check_id) c.check_id, c.outcome, c.measured_value
      from public.boundary_checks as c
      where c.boundary_id = b.id
      order by c.check_id, c.checked_at desc
    ) as latest
  ) as findings on true
  where b.is_current
    and b.stats_eligibility = p_eligibility
    and places.publication_status = 'published'
  order by summary.name, summary.id
  limit p_limit
  offset p_offset;
end;
$$;

comment on function public.admin_boundary_list(text, integer, integer) is
  'Admin only. Current boundaries of published places that are pending or excluded, by name, with the checks that warn or fail, the vertex count, and the total.';

revoke all on function public.admin_boundary_list(text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_boundary_list(text, integer, integer) to authenticated;
