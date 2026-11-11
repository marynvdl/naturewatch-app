-- Database Honing task 07: the stats tables, as design.md 4.4 and 6.
-- A stat is one number for one boundary version, from one sprout, with one method,
-- for one period, in one run. place_stats is append-only. stat_selections names the
-- sprout and method the app shows, and place_stats_preferred applies it.
-- stat_run_issues and stat_selections.selected_by are deferred (see the parcel).
-- facts stays until the frontend moves in task 08.

-- stat_methods: fact_methods, renamed. facts.method_id follows the rename. ----------

alter table public.fact_methods rename to stat_methods;
alter table public.stat_methods rename constraint fact_methods_pkey to stat_methods_pkey;
alter policy fact_methods_select on public.stat_methods rename to stat_methods_select;
alter trigger fact_methods_set_updated_at on public.stat_methods
  rename to stat_methods_set_updated_at;

comment on table public.stat_methods is
  'A calculation, named with its version. Was public.fact_methods until task 07.';

-- The cropland source, for the sprout's provenance. ---------------------------------

insert into public.sources (
  id, source_kind, title, publisher, url, doi, authors, published_year, citation
) values (
  'glad-annual-cropland',
  'dataset',
  'GLAD annual cropland',
  'Global Land Analysis and Discovery (GLAD), University of Maryland',
  'https://glad.umd.edu/dataset/annual-croplands',
  '10.1016/j.rse.2026.115438',
  'Khan et al.',
  2026,
  'Khan et al. 2026, https://doi.org/10.1016/j.rse.2026.115438'
);

-- stats -----------------------------------------------------------------------------

create table public.stats (
  id text primary key,
  title text not null,
  unit text not null,
  denominator_stat_id text references public.stats (id) on update cascade,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stats_unit_check check (unit in ('km2', 'percent', 'ratio', 'count'))
);

comment on table public.stats is 'What is measured.';
comment on column public.stats.denominator_stat_id is
  'The stat a percentage or ratio is of, when that stat is stored.';

-- sprouts -----------------------------------------------------------------------------

create table public.sprouts (
  id text primary key,
  title text not null,
  period_start date not null,
  period_end date not null,
  stac_href text not null,
  source_id text not null references public.sources (id),
  source_release_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sprouts_source_release_fkey
    foreign key (source_release_id, source_id)
    references public.source_releases (id, source_id),
  constraint sprouts_period_check check (period_end >= period_start)
);

comment on table public.sprouts is
  'A layer Stats read. id is the recipe id and the STAC collection id.';
comment on column public.sprouts.stac_href is
  'The STAC collection beside the sprout raster.';

-- stat_runs ---------------------------------------------------------------------------

create table public.stat_runs (
  id uuid primary key default gen_random_uuid(),
  sprout_id text not null references public.sprouts (id) on update cascade,
  stat_method_id text not null references public.stat_methods (id) on update cascade,
  selection jsonb not null,
  boundary_count integer not null,
  code_version text,
  batch_job_id text,
  status text not null,
  retracted_reason text,
  started_at timestamptz not null,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stat_runs_id_sprout_method_key unique (id, sprout_id, stat_method_id),
  constraint stat_runs_status_check
    check (status in ('running', 'succeeded', 'partial', 'failed', 'retracted')),
  constraint stat_runs_retracted_reason_check
    check ((status = 'retracted') = (retracted_reason is not null)),
  constraint stat_runs_finished_check
    check ((status = 'running') = (finished_at is null)),
  constraint stat_runs_boundary_count_check check (boundary_count >= 0)
);

comment on table public.stat_runs is
  'One calculation run: a sprout, a method, and the boundaries it selected.';
comment on column public.stat_runs.selection is
  'What the run chose, for example a place type and a country.';
comment on column public.stat_runs.code_version is 'Git commit of the script.';

-- place_stats -------------------------------------------------------------------------

create table public.place_stats (
  id uuid primary key default gen_random_uuid(),
  stat_run_id uuid not null,
  sprout_id text not null,
  stat_method_id text not null,
  place_id uuid not null references public.places (id),
  boundary_id uuid not null references public.place_boundaries (id),
  stat_id text not null references public.stats (id) on update cascade,
  period_start date not null,
  period_end date not null,
  value double precision not null,
  calculated_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint place_stats_run_fkey
    foreign key (stat_run_id, sprout_id, stat_method_id)
    references public.stat_runs (id, sprout_id, stat_method_id),
  constraint place_stats_run_boundary_stat_period_key
    unique (stat_run_id, boundary_id, stat_id, period_start),
  constraint place_stats_period_check check (period_end >= period_start)
);

comment on table public.place_stats is
  'One value per run, boundary version, stat, and period. Append-only: rows are never updated or deleted.';
comment on column public.place_stats.value is
  'Full precision. Rounding is for display.';

create index place_stats_preferred_idx
  on public.place_stats (
    stat_id, period_start, sprout_id, stat_method_id, boundary_id, calculated_at desc
  );

-- A boundary must belong to the place the row names.
create function public.place_stats_check_boundary()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.place_boundaries
    where id = new.boundary_id and place_id = new.place_id
  ) then
    raise exception 'boundary % is not a boundary of place %', new.boundary_id, new.place_id;
  end if;
  return new;
end;
$$;

revoke all on function public.place_stats_check_boundary() from public, anon, authenticated;

create trigger place_stats_check_boundary
  before insert on public.place_stats
  for each row execute function public.place_stats_check_boundary();

-- stat_selections ---------------------------------------------------------------------

create table public.stat_selections (
  stat_id text not null references public.stats (id) on update cascade,
  period_start date not null,
  sprout_id text not null references public.sprouts (id) on update cascade,
  stat_method_id text not null references public.stat_methods (id) on update cascade,
  selected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (stat_id, period_start)
);

comment on table public.stat_selections is
  'The sprout and method the app shows for each stat and period.';

-- Timestamps --------------------------------------------------------------------------

create trigger stats_set_updated_at
  before update on public.stats
  for each row execute function public.set_updated_at();
create trigger sprouts_set_updated_at
  before update on public.sprouts
  for each row execute function public.set_updated_at();
create trigger stat_runs_set_updated_at
  before update on public.stat_runs
  for each row execute function public.set_updated_at();
create trigger stat_selections_set_updated_at
  before update on public.stat_selections
  for each row execute function public.set_updated_at();

-- place_stats_preferred ---------------------------------------------------------------
-- For each current boundary, stat, and period: rows from the selected sprout and
-- method only, from a run that succeeded or was partial, the latest calculated_at.

create view public.place_stats_preferred
with (security_invoker = true)
as
select distinct on (s.boundary_id, s.stat_id, s.period_start)
  s.place_id,
  s.boundary_id,
  s.stat_id,
  s.period_start,
  s.period_end,
  s.value,
  s.sprout_id,
  s.stat_method_id,
  s.stat_run_id,
  s.calculated_at
from public.place_stats as s
join public.stat_selections as sel
  on sel.stat_id = s.stat_id
  and sel.period_start = s.period_start
  and sel.sprout_id = s.sprout_id
  and sel.stat_method_id = s.stat_method_id
join public.stat_runs as r
  on r.id = s.stat_run_id
  and r.status in ('succeeded', 'partial')
join public.place_boundaries as b
  on b.id = s.boundary_id
  and b.is_current
order by s.boundary_id, s.stat_id, s.period_start, s.calculated_at desc;

comment on view public.place_stats_preferred is
  'The value the app shows: current boundary, selected sprout and method, a successful or partial run, latest calculated_at.';

-- place_crops_percent now reads the selection. No sprout or method id is left in SQL.
create or replace view public.place_crops_percent
with (security_invoker = true)
as
select preferred.place_id, preferred.value as percent
from public.place_stats_preferred as preferred
where preferred.stat_id = 'crops_percent';

comment on view public.place_crops_percent is
  'Cropland percent per place, from place_stats_preferred. Its sprout and method are in stat_selections.';

-- Access ------------------------------------------------------------------------------

alter table public.stats enable row level security;
alter table public.sprouts enable row level security;
alter table public.stat_runs enable row level security;
alter table public.place_stats enable row level security;
alter table public.stat_selections enable row level security;

create policy stats_select on public.stats
  for select to anon, authenticated using (true);
create policy sprouts_select on public.sprouts
  for select to anon, authenticated using (true);
create policy stat_runs_select on public.stat_runs
  for select to anon, authenticated using (true);
create policy place_stats_select on public.place_stats
  for select to anon, authenticated using (true);
create policy stat_selections_select on public.stat_selections
  for select to anon, authenticated using (true);

revoke all on table public.stats from public, anon, authenticated;
revoke all on table public.sprouts from public, anon, authenticated;
revoke all on table public.stat_runs from public, anon, authenticated;
revoke all on table public.place_stats from public, anon, authenticated, service_role;
revoke all on table public.stat_selections from public, anon, authenticated;
revoke all on table public.place_stats_preferred from public, anon, authenticated;

grant select on table public.stats to anon, authenticated;
grant select on table public.sprouts to anon, authenticated;
grant select on table public.stat_runs to anon, authenticated;
grant select on table public.place_stats to anon, authenticated;
grant select on table public.stat_selections to anon, authenticated;
grant select on table public.place_stats_preferred to anon, authenticated, service_role;

grant select, insert, update, delete on table public.stats to service_role;
grant select, insert, update, delete on table public.sprouts to service_role;
grant select, insert, update on table public.stat_runs to service_role;
grant select, insert on table public.place_stats to service_role;
grant select, insert, update, delete on table public.stat_selections to service_role;
