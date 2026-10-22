-- Facts name the formula as well as the raster.
-- area_km2, percent, and valid_coverage stay full precision. Rounding is for display.

create table public.fact_methods (
  id text primary key,
  summary text not null
);

comment on table public.fact_methods is
  'Calculation used for a facts row. layer and layer_version name the raster.';

comment on column public.fact_methods.summary is
  'What the numbers mean, including the overlap rule and the display rounding.';

insert into public.fact_methods (id, summary)
values (
  'area-weighted-spheroid-v1',
  $summary$Area-weighted count of the sprout's full-resolution pixels. A pixel contributes the fraction of its area inside the place, multiplied by the WGS84 spheroidal area of the whole pixel. area_km2 sums value 1. percent is 100 times area_km2 divided by the area of values 0 and 1, or 0 when that area is 0. valid_coverage is that valid area divided by the place area. Nodata and pixels outside the raster are not valid. Each place is counted alone, and ground shared by two places is kept in both. Stored numbers are full precision. Shown square kilometres use two decimal places (one hectare), percent uses one decimal place, and valid coverage uses three decimal places.$summary$
);

revoke all on table public.fact_methods from public, anon, authenticated;
grant select on table public.fact_methods to anon, authenticated;
grant select, insert, update, delete on table public.fact_methods to service_role;

do $$
begin
  if (select count(*) from public.facts) <> 0 then
    raise exception 'facts is not empty; method_id needs a backfill before it can be required';
  end if;
end $$;

alter table public.facts
  drop constraint facts_place_layer_version_key;

alter table public.facts
  add column method_id text not null references public.fact_methods (id);

alter table public.facts
  add constraint facts_place_layer_version_method_key
  unique (place_id, layer, layer_version, method_id);

comment on column public.facts.layer is
  'Recipe id of the sprout layer.';
comment on column public.facts.layer_version is
  'Version folder of the sprout raster, matching the GeoTIFF version tag.';
comment on column public.facts.method_id is
  'Formula used for this row.';
comment on column public.facts.area_km2 is
  'Cropland square kilometres inside the place, at full precision.';
comment on column public.facts.percent is
  '100 times cropland area divided by valid area. 0 when the valid area is 0.';
comment on column public.facts.valid_coverage is
  'Valid square kilometres divided by the place area.';
