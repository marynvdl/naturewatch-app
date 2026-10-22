-- One column names the raster: the sprout id from the recipe.
-- cropland-2024 and v1 become cropland-2024-v1.

alter table public.facts
  add column sprout_id text;

update public.facts
set sprout_id = layer || '-' || layer_version
where sprout_id is null;

alter table public.facts
  alter column sprout_id set not null;

alter table public.facts
  drop constraint facts_place_layer_version_method_key;

alter table public.facts
  drop column layer,
  drop column layer_version;

alter table public.facts
  add constraint facts_place_sprout_method_key
  unique (place_id, sprout_id, method_id);

comment on column public.facts.sprout_id is
  'Sprout id from the recipe. The STAC collection uses the same id.';

comment on table public.fact_methods is
  'Calculation used for a facts row. sprout_id names the raster.';
