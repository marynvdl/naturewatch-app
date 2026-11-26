-- Shaping Boundaries task 01: boundary QC and Stats eligibility.
-- qc_status and stats_eligibility on place_boundaries, boundary_checks for the
-- findings, stats_eligible_boundaries for the Stats Pipeline, and
-- set_stats_eligibility() for admins. supabase/check_boundaries.py measures the
-- checks on a laptop and loads the findings. Design in design.md §4.2, records 7 and 8.

-- Columns ------------------------------------------------------------------------------

alter table public.place_boundaries
  add column qc_status text not null default 'unchecked',
  add column stats_eligibility text not null default 'pending',
  add column stats_eligibility_reason text,
  add column stats_eligibility_set_by uuid references public.profiles (id) on delete set null,
  add column stats_eligibility_set_at timestamptz,
  add constraint place_boundaries_qc_status_check
    check (qc_status in ('unchecked', 'passed', 'flagged', 'accepted')),
  add constraint place_boundaries_stats_eligibility_check
    check (stats_eligibility in ('pending', 'eligible', 'excluded')),
  add constraint place_boundaries_eligible_qc_check
    check (stats_eligibility <> 'eligible' or qc_status in ('passed', 'accepted'));

comment on column public.place_boundaries.qc_status is
  'Is the shape trustworthy? Set from boundary_checks, or accepted by an admin.';
comment on column public.place_boundaries.stats_eligibility is
  'May Stats use it? Starts pending. Changed only on purpose: set_stats_eligibility(), or the first run of check_boundaries.py.';

grant select (
  qc_status,
  stats_eligibility,
  stats_eligibility_reason,
  stats_eligibility_set_by,
  stats_eligibility_set_at
) on public.place_boundaries to authenticated;

-- Findings -----------------------------------------------------------------------------

create table public.boundary_checks (
  id uuid primary key default gen_random_uuid(),
  boundary_id uuid not null references public.place_boundaries (id),
  check_id text not null,
  check_category text not null,
  outcome text not null,
  measured_value double precision,
  threshold_used double precision,
  checker_version text not null,
  checked_by uuid references public.profiles (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  constraint boundary_checks_check_category_check
    check (check_category in ('technical', 'modelling', 'processing_cost')),
  constraint boundary_checks_outcome_check
    check (outcome in ('pass', 'warn', 'fail')),
  constraint boundary_checks_details_check
    check (jsonb_typeof(details) = 'object')
);

create index boundary_checks_boundary_check_idx
  on public.boundary_checks (boundary_id, check_id, checked_at desc);

comment on table public.boundary_checks is
  'Append-only QC findings per boundary. Thresholds live in the QC code; each row records the one it used.';

alter table public.boundary_checks enable row level security;

revoke all on table public.boundary_checks from public, anon, authenticated;
grant select on table public.boundary_checks to authenticated;
grant select, insert, update, delete on table public.boundary_checks to service_role;

create policy boundary_checks_select_admin
  on public.boundary_checks for select to authenticated
  using ((select public.has_role('admin')));

-- What Stats reads ---------------------------------------------------------------------

create view public.stats_eligible_boundaries
with (security_invoker = true) as
select b.id as boundary_id, b.place_id, p.place_type_id, b.area_km2
from public.place_boundaries as b
join public.places as p on p.id = b.place_id
where b.is_current
  and b.stats_eligibility = 'eligible'
  and p.publication_status = 'published';

comment on view public.stats_eligible_boundaries is
  'The only boundaries the Stats Pipeline reads: current, eligible, of published places.';

revoke all on table public.stats_eligible_boundaries from public, anon, authenticated;
grant select on table public.stats_eligible_boundaries to service_role;

-- Changing eligibility -----------------------------------------------------------------

create function public.set_stats_eligibility(
  p_boundary_id uuid,
  p_eligibility text,
  p_reason text
)
returns table (
  boundary_id uuid,
  qc_status text,
  stats_eligibility text,
  stats_eligibility_reason text,
  stats_eligibility_set_by uuid,
  stats_eligibility_set_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  reason text := nullif(btrim(p_reason), '');
  qc text;
begin
  if not (select public.has_role('admin')) then
    raise exception 'Only an admin can change Stats eligibility.' using errcode = '42501';
  end if;
  if p_eligibility is null or p_eligibility not in ('pending', 'eligible', 'excluded') then
    raise exception 'The eligibility must be pending, eligible, or excluded.' using errcode = '22023';
  end if;
  if reason is not null and char_length(reason) > 1000 then
    raise exception 'The reason can be at most 1,000 characters.' using errcode = '22023';
  end if;

  select b.qc_status into qc
  from public.place_boundaries as b
  where b.id = p_boundary_id
  for update;
  if not found then
    raise exception 'No boundary has this id.' using errcode = 'P0002';
  end if;

  if p_eligibility = 'eligible' and qc not in ('passed', 'accepted') then
    raise exception 'A boundary can be eligible only when its QC status is passed or accepted, not %.', qc
      using errcode = '23514';
  end if;
  if reason is null and (p_eligibility = 'excluded' or (p_eligibility = 'eligible' and qc <> 'passed')) then
    raise exception 'Give a reason for this eligibility.' using errcode = '22023';
  end if;

  return query
  update public.place_boundaries as b
  set stats_eligibility = p_eligibility,
    stats_eligibility_reason = reason,
    stats_eligibility_set_by = (select auth.uid()),
    stats_eligibility_set_at = now()
  where b.id = p_boundary_id
  returning b.id, b.qc_status, b.stats_eligibility, b.stats_eligibility_reason,
    b.stats_eligibility_set_by, b.stats_eligibility_set_at;
end;
$$;

comment on function public.set_stats_eligibility(uuid, text, text) is
  'Admin only. Sets a boundary''s Stats eligibility with a reason, who, and when.';

revoke all on function public.set_stats_eligibility(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_stats_eligibility(uuid, text, text) to authenticated;
