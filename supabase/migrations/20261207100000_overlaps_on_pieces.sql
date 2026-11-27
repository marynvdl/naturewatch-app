-- Shaping Boundaries task 02: place_overlaps() on pieces.
-- The whole-shape intersection ran the hosted Micro database out of memory on
-- 12 November 2026. Both shapes are now cut with ST_Subdivide into pieces of at
-- most 256 vertices, and the areas of the pieces that meet are summed. The pieces
-- of a polygon do not overlap, so the sum is the area of the whole intersection.
-- The neighbours' pieces go into a temporary table with a GiST index, so each
-- subject piece finds the pieces it meets through the index. The table lives only
-- for the transaction. Same signature, columns, and grants. It is volatile now,
-- because it writes that table.

create or replace function public.place_overlaps(p_place_id uuid)
returns table (
  place_id uuid,
  place_type_id text,
  subject_boundary_id uuid,
  object_boundary_id uuid,
  intersection_km2 double precision,
  subject_coverage double precision,
  object_coverage double precision
)
language plpgsql
set search_path = ''
as $$
declare
  subject_id uuid;
  subject_place uuid;
  subject_km2 double precision;
  subject_geom extensions.geometry;
begin
  select b.id, b.place_id, b.area_km2, b.geom
  into subject_id, subject_place, subject_km2, subject_geom
  from public.place_boundaries as b
  where b.place_id = p_place_id
    and b.is_current;
  if subject_id is null then
    return;
  end if;

  if to_regclass('pg_temp.overlap_pieces') is null then
    create temporary table overlap_pieces (
      boundary_id uuid not null,
      piece extensions.geometry not null
    ) on commit drop;
    create index overlap_pieces_piece_idx on pg_temp.overlap_pieces using gist (piece);
  else
    truncate pg_temp.overlap_pieces;
  end if;

  insert into pg_temp.overlap_pieces (boundary_id, piece)
  select cut.id, cut.piece
  from (
    select other.id, extensions.st_subdivide(other.geom, 256) as piece
    from public.place_boundaries as other
    join public.places
      on places.id = other.place_id
      and places.publication_status = 'published'
    where other.is_current
      and other.place_id <> subject_place
      and other.geom operator(extensions.&&) subject_geom
  ) as cut
  where cut.piece operator(extensions.&&) subject_geom;
  analyze pg_temp.overlap_pieces;

  return query
  with subject_pieces as (
    select extensions.st_subdivide(subject_geom, 256) as piece
  ),
  shared as (
    select
      pieces.boundary_id,
      sum(
        extensions.st_area(
          extensions.st_intersection(subject_pieces.piece, pieces.piece)::extensions.geography,
          true
        )
      ) / 1e6 as km2
    from subject_pieces
    join pg_temp.overlap_pieces as pieces
      on pieces.piece operator(extensions.&&) subject_pieces.piece
      and extensions.st_intersects(pieces.piece, subject_pieces.piece)
    group by pieces.boundary_id
  )
  select
    other.place_id,
    places.place_type_id,
    subject_id,
    other.id,
    shared.km2,
    least(shared.km2 / nullif(subject_km2, 0), 1),
    least(shared.km2 / nullif(other.area_km2, 0), 1)
  from shared
  join public.place_boundaries as other on other.id = shared.boundary_id
  join public.places on places.id = other.place_id
  where shared.km2 > 0;
end;
$$;

comment on function public.place_overlaps(uuid) is
  'Published places whose current boundary overlaps the given place''s, with the shared km2 and the share of each. Both shapes are cut into pieces of at most 256 vertices, joined through a GiST index on a temporary table, so memory stays bounded on any boundary. Admin only. Not stored.';

revoke all on function public.place_overlaps(uuid) from public, anon, authenticated;
grant execute on function public.place_overlaps(uuid) to service_role;
