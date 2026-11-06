-- The "In view" list option still timed out after matching on bounding boxes,
-- because Postgres reads the whole stored boundary to test a box, and the
-- places table holds 3.4 GB of boundaries. A place's box is four numbers, so
-- keep them beside the row and match the view against those. The boundary
-- itself is not read.

alter table public.places
  add column bbox_west double precision,
  add column bbox_south double precision,
  add column bbox_east double precision,
  add column bbox_north double precision;

comment on column public.places.bbox_west is
  'West edge of the boundary box. Set from geom by a trigger.';
comment on column public.places.bbox_south is
  'South edge of the boundary box. Set from geom by a trigger.';
comment on column public.places.bbox_east is
  'East edge of the boundary box. Set from geom by a trigger.';
comment on column public.places.bbox_north is
  'North edge of the boundary box. Set from geom by a trigger.';

create or replace function public.places_set_bbox()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.bbox_west := extensions.st_xmin(new.geom);
  new.bbox_south := extensions.st_ymin(new.geom);
  new.bbox_east := extensions.st_xmax(new.geom);
  new.bbox_north := extensions.st_ymax(new.geom);
  return new;
end;
$$;

create trigger places_set_bbox
  before insert or update of geom on public.places
  for each row execute function public.places_set_bbox();

-- Existing rows are filled in batches outside this file, because reading every
-- boundary takes longer than a migration may run. Until they are filled, the
-- list still matches the view with protected_areas_in_extent as it stands.
