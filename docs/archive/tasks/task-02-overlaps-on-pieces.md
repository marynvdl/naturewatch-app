# Task 02 — Overlaps on pieces

Parcel: [Shaping Boundaries](../parcels/shaping-boundaries.md).

Repository: naturewatch-app. Start from `develop`. Task 01 merged in #471.

## Goal

`place_overlaps(place_id)` returns the same columns and the same areas, but its memory stays bounded for any boundary. It cuts both shapes into pieces and intersects piece by piece, with nothing stored. The overlap queue in task 04 can call it for one place at a time.

## Facts already stored

From the code and the hosted database on 27 November 2026:

- **The function today** (`20261120100000_recognitions.sql`) intersects whole current boundaries. The neighbours are found through the GiST index (`&&`) and kept when `st_intersects`. Only published places are returned. It is `stable`, with `set search_path = ''`, and execute is granted to `service_role` only.
  - One call ran the hosted Micro database out of memory on 12 November 2026, on a Natura 2000 site of 862,145 vertices. Since then the links have been computed on a laptop (`derive_recognises.py compute`, `derive_ecoregion_links.py`).
- **Callers.** `derive_recognises.py derive` calls it, and `records_fixture.sql` tests it. The fixture checks a WHS that covers a park, a Ramsar site over half of it, and that draft and far-away places are left out. Task 04 will call it for one place at a time.
- **Hosted.** The database is 4.1 GB, of which `place_boundaries` is 3.7 GB.
  - The heaviest current boundaries, about 1.9 million vertices each:
    - `7963122c-6b67-4605-88c7-e6eb929767e6` (Natura 2000);
    - `f22094e2-c43e-4d23-9243-0d582402f778` (Natura 2000);
    - `16b1d97b-42f4-4ae7-a5db-9ac096d6fc5a` (conservation area).
- The local database holds the 846 ecoregions only.

## Decided

- **Cut on the fly** (the user, 27 November 2026).
  - `ST_Subdivide` cuts the subject and each neighbour into pieces of at most 256 vertices.
  - Pieces are paired through `&&`, and each pair's intersection area is summed per neighbour.
  - The pieces of a polygon do not overlap, so the sum equals the area of the whole intersection.
  - No pieces table is stored, and the database does not grow.
- **Tested locally, then with one hosted call** (the user).

## Result of the local heavy test

The test ran on 27 November 2026 on the local stack. It used the three heaviest hosted boundaries and the 278 neighbours whose boxes meet theirs, 257 MB in all. The copied rows were removed afterwards.

- **The first version had no index.** It joined the pieces in two CTEs. It took 584 s on `7963122c`, which cut into 21,197 pieces against 131,027 neighbour pieces, about 2.8 billion box tests. The neighbours' pieces now go into a temporary table with a GiST index, so the function is `plpgsql` and volatile.

| Subject | Neighbours | Old: time, peak memory | New: time, peak memory |
| --- | --- | --- | --- |
| `7963122c` (Natura 2000) | 108 | 99.6 s, 1,890 MB | 53.3 s, 592 MB |
| `f22094e2` (Natura 2000) | 108 | 97.5 s, 1,884 MB | 53.4 s, 602 MB |
| `16b1d97b` (conservation area) | 6 | 21.4 s, 885 MB | 9.5 s, 293 MB |

- **The same places came back.**
  - For overlaps of 0.1 km² or more, the areas agree within 0.007%.
  - For overlaps of 0.01 km² or more, they agree within 0.14%.
  - The coverages differ by at most 0.00002.
- **Three slivers below 0.005 km² differ more.** Along a shared border, the old function gave about 0.00001 km² and the new one about 0.0013 km². Shapely, on the whole shapes, gives 0.0022 and 0.0041 km². No method agrees on such slivers. They are far below the 1% share the derive scripts use.

## Hosted

The migration was applied on 27 November 2026, after the user approved it. Two calls were then made as the owner with `statement_timeout = '5min'`, the lighter one first. Neither restarted the database.

- `16b1d97b`: 4 overlaps, 22,124 km², in 19.7 s.
- `7963122c`: 106 overlaps, 3,534 km², in 133 s.

Locally these gave 6 and 108 overlaps. The local copy held each ecoregion twice: the local one and the one copied from hosted.

## Do this

1. **Migration `20261207100000_overlaps_on_pieces.sql`.**
   - `create or replace` `place_overlaps(uuid)`, with the same signature, columns, grants, and comment intent.
   - The subject's pieces come from its current boundary.
   - The neighbours are the current boundaries of other published places whose `geom && subject.geom`. Each neighbour is cut into its own pieces.
   - Each pair of pieces that meets through `&&` and `st_intersects` adds `st_area(st_intersection(a, b)::geography, true)`.
   - The coverages are worked out as today, from `area_km2`. Rows with a shared area of 0 are left out.
   - Update the comment on the function: it cuts into pieces, and is safe on any boundary size.
2. **Local heavy test.** This is a one-off and not committed.
   - Copy into the local database:
     - the three heaviest hosted boundaries;
     - the current boundaries of the published places whose box meets theirs.

     These are copied as places of their own types under the local `wdpca` release. It is read-only on hosted, at most a few hundred MB of egress.
   - Call the old function and the new one on each of the three. Compare:
     - the rows, with areas within 0.1%;
     - the time;
     - the backend's peak memory (`VmHWM` of the backend process in the database container).
   - Then remove the copied rows.
3. **Tests.**
   - The `records_fixture.sql` checks pass unchanged.
   - Add one fixture case where the subject is cut into several pieces, a polygon of over 256 vertices. Its shared area must match a known value.
4. **Hosted.** After the user approves, apply it with `supabase db push --linked` (dry run first). Then make one call, `select count(*), sum(intersection_km2) from place_overlaps('7963122c-…')`, as the owner with `statement_timeout = '5min'`, and report the time and result.
5. **Docs.** In `docs/database/design.md` §4.5, say that `place_overlaps` cuts into pieces and is safe on any boundary, with the migration.

## Do not

- Do not store pieces or add a table.
- Do not change the signature, the columns, or who may call it.
- Do not change `derive_recognises.py` or `derive_ecoregion_links.py`.
- Do not build the overlap queue. That is task 04.
- Do not push the migration, or make the hosted call, before the user approves.

## Done when

- The migration is applied to the local and hosted databases.
- The local heavy test shows the same overlaps as before, within 0.1% for overlaps of 0.1 km² or more, at a much lower peak memory, and the numbers are recorded in this file.
- The one hosted call finished within the timeout.
- The fixture and supabase tests pass.
- design.md is updated.
- The task is archived on this branch.
