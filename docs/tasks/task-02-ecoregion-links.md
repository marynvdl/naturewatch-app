# Task 02 — Ecoregion links

Parcel: [Ecoregions](../parcels/ecoregions.md).

Repository: naturewatch-app. Start from `develop`. Task 01 merged in #449.

## Goal

Store a derived `located_in` link from each published conservation area and recognition to each ecoregion it lies in, with both coverages, as `proposed`. Show the user the coverage counts from the hosted links, then confirm the links at the share the user chooses. Nothing a person sees changes until task 04, except that `anon` can read the confirmed links.

Decided 21 November 2026 by the user:

- **The overlap is computed on the laptop, from the hosted boundaries.** The hosted database is only read: the current boundaries of the published places, as WKB. The laptop cuts the ecoregions into pieces and intersects them there. The database then takes the links in one insert. `place_overlaps()` is not called, because it ran the hosted Micro database out of memory on 12 November 2026.

## Facts already stored

From the code and the hosted database on 21 November 2026:

- `place_relationship_types` already has `located_in` ("Located in", inverse "Contains", not symmetric) (`20261120100000_recognitions.sql`). `place_relationships` takes `derived` rows with both boundary ids and both coverages, has one active row per (subject, type, object), and refuses an active reverse link. `anon` and `authenticated` read only confirmed, unretired links between published places. An admin reads every link (`20261123100000_relationship_review.sql`). Every change is audited, with a null actor for script writes. No migration is needed.
- For `located_in` the subject is the park and the object the ecoregion. `subject_coverage` is the share of the park inside the ecoregion. `object_coverage` is the share of the ecoregion inside the park.
- 51,783 places are published: 846 ecoregions, 39,457 conservation areas, and 11,480 recognitions. The database is 3,737 MB, `place_boundaries` 3,642 MB, on Micro compute (1 GB).
- The ecoregions hold 13,972,976 vertices, at most 496,541 in one shape, with 39 above 100,000. The largest park shape is a Natura 2000 site of 862,145 vertices.
- `derive_recognises.py` has the pattern to follow. `compute` writes a links TSV in the work directory and resumes from a done file. Its `polygonal()` and `shared_area()` handle repair and topology errors. `load` copies the TSV into a temp table and inserts only rows whose boundaries are still current and whose places are still published, skipping active pairs. `counts` and `confirm SHARE` come after. On 12 November 2026 its EPSG:6933 coverages matched `place_overlaps()` within 0.0002. The user confirmed `recognises` at 75% of the park.
- `import_wdpa.py` holds `open_connection` and the short-lived hosted login role. The other scripts load it with `importlib`.
- The WDPA and ecoregion work directories from earlier tasks are gone from this laptop (16 GB of memory).

## Do this

1. **Runner `supabase/derive_ecoregion_links.py`.** Reuse `import_wdpa.py` and the shape helpers of `derive_recognises.py` with `importlib`. The work directory is `ECOREGIONS_WORK_DIR`, defaulting to the system temp directory.
   - `compute`: read-only on the database. Read the published ecoregions' current boundaries once, project them to EPSG:6933, cut each on a 1° grid, and put the pieces in an `STRtree`. Then read the current boundaries of the published conservation areas and recognitions, with a server-side cursor in batches, never all at once. For each park, sum its intersection with the pieces of each ecoregion. Write a link when the shared area is at least 1% of either place: the park and ecoregion ids, both boundary ids, the shared km², and both coverages. Resume from a done file. Print the park count, the links, the parks with no link, the run time, and the peak memory.
   - `load`: insert the TSV as `derived`, `proposed` `located_in` rows, in one transaction, as `derive_recognises.py load` does. The subject must be a published conservation area or recognition and the object a published ecoregion. A rerun inserts nothing.
   - `counts`: read-only, from the database. For conservation areas, and for each recognition type: the links, and the parks, with `subject_coverage` of at least 1%, 5%, 10%, 25%, and 50%. Also the parks with no link at or above each share, and the median number of ecoregions per park at each share.
   - `confirm SHARE`: set `confirmed` on derived, proposed `located_in` rows with `subject_coverage` at or above SHARE. Change nothing else.
2. **Tests.** `supabase/tests/test_derive_ecoregion_links_local.py`, on the empty local stack in a rolled-back transaction, like `test_derive_recognises_local.py`. Use a park split 70/30 across two ecoregions, a recognition inside one ecoregion, a park that only touches an ecoregion's edge, a park outside every ecoregion, and an unpublished ecoregion. Check `compute`, then `load` twice, the coverages, `counts`, and that `confirm 0.5` confirms only the 70% link and `anon` then reads only that link. Add a unit test for the grid cut: the pieces' areas add up to the shape's area. Run pytest for `supabase/tests` and the catalog suite.
3. **Docs.**
   - `supabase/README.md`: an "Ecoregion links" section with the commands, why it runs on the laptop, and the hosted result.
   - `docs/database/design.md` 4.5: derived `located_in` links from parks to ecoregions are *in place*, with the chosen share.
   - The parcel's Design: the shapes are cut on the laptop, not with `ST_Subdivide`. Under Open questions, record the confirmation share, and whether a park tag needs a minimum share, as answered.

### Hosted, each after approval

4. **Compute.** Before: the database size and the `place_relationships` counts per type and status. Run `compute` against the hosted database. It reads about 3.6 GB of boundaries once. Show the user the counts from the file.
5. **Load.** Run `load`, then `counts`. Record the table size after.
6. **Confirm.** The user chooses the share from the hosted counts. Run `confirm SHARE`. Record in `supabase/README.md` the run time, peak memory, links stored, the share chosen, and the confirmed and proposed counts.

## Do not

- Do not call `place_overlaps()` or run any overlap in the hosted database.
- Do not add a migration, a table, or a function.
- Do not link ecoregions to each other, or parks to parks.
- Do not change the frontend, the catalog, tiles, or `docs/user/`.
- Do not confirm a link before the user has chosen the share.
- Do not run `compute`, `load`, or `confirm` against the hosted database without approval.
- Do not commit the TSV, the shapes, a token, a database URL, or a password.
- Do not start task 03.

## Done when

- The hosted database holds the derived `located_in` links from published parks and recognitions to ecoregions, with both coverages, the chosen share confirmed, and the rest `proposed`.
- The new local tests, the other `supabase/tests`, and the catalog suite pass.
- design.md, `supabase/README.md`, and the parcel match the result.
- One pull request into `develop`, merged after its checks pass and the user approves.

## How to work

Branch from `develop`. Do this task only. Get approval before each hosted step. Do not commit secrets. Do not add AI or tool attribution to a commit or a pull request.
