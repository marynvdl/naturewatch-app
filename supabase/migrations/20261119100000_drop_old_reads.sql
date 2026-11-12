-- Database Honing task 08: the frontend reads the generic place_* functions,
-- place_summaries, and place_stats_preferred. Drop what only the old frontend and
-- the task 05-07 backfills read: the protected_area* wrappers, facts, the one-off
-- backfill functions, and places.geom with the area, box, trigger, and index that
-- hang on it. Every reader uses the current boundary in place_boundaries.
--
-- Dropping a column only hides it. After the push, run by hand, outside a
-- transaction, to give the disk back:
--   vacuum full public.places;
--   vacuum analyze public.places;

-- Refuse unless every fact is stored as the same three place_stats of the
-- 22 October 2026 run (task 07). With no facts, as in a fresh local database,
-- there is nothing to check.
do $$
declare
  fact_count integer;
  unmatched integer;
begin
  select count(*) into fact_count from public.facts;
  select count(*) into unmatched
  from public.facts
  where (
    select count(*)
    from public.place_stats as s
    join public.stat_runs as run on run.id = s.stat_run_id
    where run.batch_job_id = 'facts-cropland-2024-v1-20261022180517'
      and s.place_id = facts.place_id
      and s.sprout_id = facts.sprout_id
      and s.stat_method_id = facts.method_id
      and (
        (s.stat_id = 'crops_area' and s.value = facts.area_km2)
        or (s.stat_id = 'crops_percent' and s.value = facts.percent)
        or (s.stat_id = 'valid_coverage' and s.value = facts.valid_coverage)
      )
  ) <> 3;
  if unmatched <> 0 then
    raise exception '% of % facts are not stored as the same three place_stats', unmatched, fact_count;
  end if;
end;
$$;

-- The wrappers (task 05b). -------------------------------------------------------------

drop view public.protected_areas;
drop function public.protected_areas_in_extent(double precision, double precision, double precision, double precision);
drop function public.protected_area_matched(text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision);
drop function public.protected_area_window(text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, integer, integer);
drop function public.protected_area_window_count(text, boolean, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision);
drop function public.protected_area_rank(uuid, text, boolean, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision);
drop function public.protected_area_kept_ids(double precision, double precision, double precision, double precision);
drop function public.protected_area_filter_stats();

-- The one-off backfills (tasks 05, 05a, and 07). -----------------------------------------

drop function public.backfill_place_boundaries(uuid, integer);
drop function public.merge_wdpa_site_parcels();
drop function public.unmerge_wdpa_site_parcels();
drop function public.backfill_place_stats_from_facts();

-- facts. Its values are place_stats of the 22 October 2026 run. --------------------------

drop table public.facts;

-- places keeps its identity. The boundary, its area, and its box are in place_boundaries.

drop trigger places_set_bbox on public.places;
drop function public.places_set_bbox();
drop index public.places_geom_idx;
alter table public.places
  drop column area_km2,
  drop column bbox_west,
  drop column bbox_south,
  drop column bbox_east,
  drop column bbox_north,
  drop column geom;

comment on table public.places is
  'A place''s identity, type, and publication status. Its boundaries are in place_boundaries.';
