-- Database Honing task 07: the stat definitions, the cropland 2024 sprout, the app's
-- selection, and the 941 cropland facts as place_stats of one run.
--
-- The run is Batch job facts-cropland-2024-v1-20261022180517 (naturewatch-analysis,
-- facts/README.md). started_at is the submit time in the job id, 22 October 2026
-- 18:05:17 UTC. finished_at is 872 seconds later: the README's task time, which
-- includes a preempted attempt. code_version dce311d is the last commit to facts/
-- before the job. The job ran an uploaded working copy, so it is the nearest commit,
-- not a certain one. It read protected_areas for South Africa. Every fact's place
-- still has its version 1 boundary, so each value is stored on that boundary.
--
-- On a database without facts, such as a fresh local reset, only the definitions,
-- the sprout, and the selections are written.

insert into public.stats (id, title, unit, denominator_stat_id, description) values
  (
    'crops_area',
    'Cropland area',
    'km2',
    null,
    'Cropland inside the boundary, in square kilometres on the WGS84 spheroid.'
  ),
  (
    'crops_percent',
    'Cropland share',
    'percent',
    null,
    'Cropland area as a percentage of the valid area: the pixels that are cropland or not cropland, leaving out nodata. 0 when the valid area is 0.'
  ),
  (
    'valid_coverage',
    'Valid coverage',
    'ratio',
    null,
    'Valid area over the boundary''s area. Slightly above 1 can come from counting pixel fractions against the polygon''s area.'
  );

insert into public.sprouts (
  id, title, period_start, period_end, stac_href, source_id, source_release_id
) values (
  'cropland-2024-v1',
  'GLAD annual cropland 2024, South Africa',
  date '2024-01-01',
  date '2024-12-31',
  'gs://nature-watch-bucket/sprouts/cropland/2024/v1/collection.json',
  'glad-annual-cropland',
  null
);

insert into public.stat_selections (stat_id, period_start, sprout_id, stat_method_id)
select stat_id, date '2024-01-01', 'cropland-2024-v1', 'area-weighted-spheroid-v1'
from (values ('crops_area'), ('crops_percent'), ('valid_coverage')) as s (stat_id);

-- The backfill. A function, so the records fixture can run it on its own facts.
-- Dropped with facts in task 08.
create function public.backfill_place_stats_from_facts()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  fact_count integer;
  run_id uuid;
  written integer;
  matched integer;
  finished timestamptz := timestamptz '2026-10-22 18:05:17+00' + interval '872 seconds';
begin
  select count(*) into fact_count from public.facts;
  if fact_count = 0 then
    return 0;
  end if;

  if exists (
    select 1 from public.facts
    where sprout_id <> 'cropland-2024-v1' or method_id <> 'area-weighted-spheroid-v1'
  ) then
    raise exception 'a fact is not from cropland-2024-v1 and area-weighted-spheroid-v1';
  end if;

  if exists (
    select 1
    from public.facts
    join public.places on places.id = facts.place_id
    where places.publication_status <> 'published'
      or not exists (
        select 1 from public.place_boundaries as b
        where b.place_id = facts.place_id and b.is_current and b.version_number = 1
      )
  ) then
    raise exception 'a fact''s place is not published on its version 1 boundary';
  end if;

  if exists (
    select 1 from public.stat_runs
    where batch_job_id = 'facts-cropland-2024-v1-20261022180517'
  ) then
    raise exception 'the 22 October 2026 run is already stored';
  end if;

  insert into public.stat_runs (
    sprout_id, stat_method_id, selection, boundary_count, code_version,
    batch_job_id, status, started_at, finished_at
  ) values (
    'cropland-2024-v1',
    'area-weighted-spheroid-v1',
    '{"place_type": "conservation_area", "iso3": "ZAF", "list": "protected_areas"}',
    fact_count,
    'dce311d',
    'facts-cropland-2024-v1-20261022180517',
    'succeeded',
    timestamptz '2026-10-22 18:05:17+00',
    finished
  )
  returning id into run_id;

  insert into public.place_stats (
    stat_run_id, sprout_id, stat_method_id, place_id, boundary_id, stat_id,
    period_start, period_end, value, calculated_at
  )
  select
    run_id,
    facts.sprout_id,
    facts.method_id,
    facts.place_id,
    b.id,
    v.stat_id,
    date '2024-01-01',
    date '2024-12-31',
    v.value,
    finished
  from public.facts
  join public.place_boundaries as b
    on b.place_id = facts.place_id and b.is_current
  cross join lateral (values
    ('crops_area', facts.area_km2),
    ('crops_percent', facts.percent),
    ('valid_coverage', facts.valid_coverage)
  ) as v (stat_id, value);
  get diagnostics written = row_count;

  if written <> 3 * fact_count then
    raise exception 'wrote % place_stats for % facts, expected %', written, fact_count, 3 * fact_count;
  end if;

  select count(*) into matched
  from public.place_stats_preferred as p
  join public.facts on facts.place_id = p.place_id
  where p.stat_run_id = run_id
    and p.value = case p.stat_id
      when 'crops_area' then facts.area_km2
      when 'crops_percent' then facts.percent
      when 'valid_coverage' then facts.valid_coverage
    end;

  if matched <> written then
    raise exception 'place_stats_preferred returns % values equal to facts, expected %', matched, written;
  end if;

  return written;
end;
$$;

comment on function public.backfill_place_stats_from_facts() is
  'Task 07: store the cropland facts as place_stats of the 22 October 2026 run. Dropped with facts in task 08.';

revoke all on function public.backfill_place_stats_from_facts() from public, anon, authenticated;

do $$
declare
  fact_count integer;
begin
  select count(*) into fact_count from public.facts;
  if fact_count = 0 then
    return;
  end if;
  if fact_count <> 941 then
    raise exception 'expected the 941 South Africa facts, found %', fact_count;
  end if;
  if public.backfill_place_stats_from_facts() <> 2823 then
    raise exception 'the backfill did not write 2,823 place_stats';
  end if;
end;
$$;
