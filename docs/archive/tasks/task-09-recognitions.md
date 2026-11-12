# Task 09 — Recognitions

Parcel: [Database Honing](../../parcels/database-honing.md)

Repositories: naturewatch-app and naturewatch-analysis. Start only after task 08 has merged into `develop` (pull request #409, merged 12 November 2026; hosted results in #410).

## Goal

Move the places that are recognitions out of the conservation areas and into recognition types of their own. Import WDPCA `DESIG_TYPE`. Add `place_relationships` and the admin overlap function, and derive the first `recognises` links. Publish a recognitions PMTiles archive, and rebuild the places archive from the current boundaries of the remaining published conservation areas. Decide the stale South Africa rollback copy in `places/protected-areas/v1/`.

The map layer, the Places buttons, and the profile badges are task 09b. This task changes what the data says, not what a person sees, except that recognitions leave the Protected areas list and its boundaries.

Decided 12 November 2026 by the user, from the designation review page (private Artifact, data in the scratchpad, not committed):

- **Which designations are recognitions.** 32 designations, 11,480 published places, in six groups. Every other designation (948, 39,457 places) stays a conservation area. Grouping is by `DESIG_ENG` text, so it includes national-coded copies of the same scheme (for example `Natura 2000 SCI`, `RAMSAR Sites`).

  | Group | Place type | Designations (`DESIG_ENG`) | Places | Own Places button (09b) |
  | --- | --- | --- | --- | --- |
  | World Heritage | `world_heritage_site` | World Heritage Site (natural or mixed) | 207 | yes |
  | Ramsar | `ramsar_site` | Wetland of International Importance (Ramsar Site); RAMSAR Sites; RAMSAR Wetland; RAMSAR | 1,087 | yes |
  | UNESCO-MAB Biosphere | `biosphere_reserve` | UNESCO-MAB Biosphere Reserve | 220 | yes |
  | Natura 2000 | `natura_2000_site` | Special Areas of Conservation (Habitats Directive); Special Protection Area (Birds Directive); Site of Community Importance (Habitats Directive); Natura 2000 SCI; Natura 2000 SPA; Natura 2000; ZPS - Natura 2000; ZSC - Natura 2000 | 8,770 | no |
  | Emerald Network | `emerald_site` | Emerald Network; Emerald Sites | 1,029 | no |
  | Other regional | `other_recognition` | ASEAN Heritage Park; Specially Protected Area (Cartagena Convention); Marine Protected Area (OSPAR); and the nationally coded biosphere reserves: Biosphere Reserve; Biosphere polygon; biosphere reserve - transition area; biosphere reserve; biosphere reserve - buffer zone; biosphere reserve - core area; Biosphere Park; State Biosphere Reserve; Biosphere Reserve (RB); Biosphere reserve; Biosphere Reserve and Indigenous Territory; Biosphere Reserve-National; Biosphere Reserve-National & UNESCO-MAB | 167 | no |

- **The national biosphere reserves stay in Other regional.** The `biosphere_reserve` type and its button hold only the 220 UNESCO-MAB records.
- **Links are derived, and clear ones confirmed.** The overlap function proposes `recognises` links. Links where a large enough share of the park lies inside the recognition are confirmed. The threshold is chosen by the user from the hosted counts, before any row is confirmed. The rest stay `proposed`.
- **Frontend is task 09b.** Recognitions draw as their own outline toggle. World Heritage, Ramsar, and UNESCO-MAB get their own Places buttons. A park's profile shows its recognitions as badges under the title.

## Facts already stored

From the hosted database, the code, and the WDPCA geodatabase on 12 November 2026:

- 50,937 places are published, all of type `conservation_area`, using 980 distinct `designation` values. `designation_type` is null on every `conservation_area_details` row.
- `place_categories` has only `conservation_area`. `place_types` has only `conservation_area`, with `details_kind = 'conservation_area'`. A trigger on each details table checks the place type's `details_kind` (`20261112100000_types_and_details.sql`).
- `place_summaries` takes `designation`, `iucn_category`, `iso3`, `realm`, and `site_id` from `conservation_area_details` only. `listed_places` filters only `conservation_area` on realm and area (`20261116100000_generic_place_reads.sql`). The frontend lists `place_window('conservation_area', …)`. A profile reads `place_summaries` for any published place.
- `recognition_details`, `place_relationship_types`, and `place_relationships` are designed (design.md 4.1 and 4.5) but not built.
- Of the stored places' SITE_PIDs, 50,533 are in the WDPA polygons of the October 2026 geodatabase. The other 468 are OECM records. They are in the importer's pinned `WDPA_WDOECM_Oct2026_Public.zip`, which has `DESIG_TYPE` and `INT_CRIT` for every record. By `DESIG_TYPE` the stored set is about 39,700 national, 9,283 regional, 1,506 international, and a few not applicable.
- Overlap from the review page (local, shapes simplified to 100 m, the single largest overlapping place with another designation): Natura 2000 parcels mostly lie on each other, with the median Special Protection Area 84% inside a Special Area of Conservation. 47% of World Heritage Sites and 45% of Ramsar sites are at least half inside one other place, most often a National Park. On the hosted database the exact overlap of the 207 World Heritage Sites took 106 s.
- `import_wdpa.py` keeps `DESIG_ENG` in its filtered file, not `DESIG_TYPE` or `INT_CRIT`. It writes only when every record reconciles as `unchanged` or `reshaped`.
- In naturewatch-analysis `main` (`77f3310`), `places/protected_areas.py` reads the current boundaries of published places of one `source.place_type`, and `cookbook/recipes/places-protected-areas.yaml` names `conservation_area`. The archive is `gs://nature-watch-tiles/places/protected-areas/v1/places.pmtiles`, built on 31 October 2026 from `places.geom` by Batch job `places-places-protected-areas-20261031103015`: spot `e2-standard-8`, about 37 minutes, about $0.06 (estimate). `places.previous.pmtiles` beside it is the 3.4 MiB South Africa build of 29 October. `submit --replace` refuses to overwrite it.

## Do this

### naturewatch-app

1. **Migration `20261120100000_recognitions.sql`: tables and functions.**
   - Category `recognition`. Six place types from the table above, each `details_kind = 'recognition'`, titled with the group name.
   - `recognition_details`: `place_id` PK, `designation`, `designation_type` (same CHECK as conservation areas), `criteria` (WDPCA `INT_CRIT`, null when not applicable), `iso3` text[], `realm`, the provenance columns of `conservation_area_details`, timestamps, and the details-kind trigger. This replaces design.md's `scheme` (the place type says it) and `inscribed_on` (deferred with `STATUS_YR`).
   - `place_relationship_types` with the four rows of design.md 4.5, and `place_relationships` as designed, plus `object_coverage` (the share of the object's area inside the subject), with the same CHECK as `subject_coverage`. For `recognises` the subject is the recognition and the object the conservation area, so `object_coverage` is the share of the park that is recognised.
   - `place_overlaps(p_place_id uuid)`: admin-only (`service_role`), returns each published place whose current boundary intersects the given place's, with the intersection's area, `subject_coverage`, and `object_coverage`, using the GiST index. Nothing stored.
   - `place_summaries` takes `designation`, `iso3`, `realm`, and `site_id` from whichever details table the place has. `listed_places` is unchanged.
   - RLS, revokes, and grants as in earlier migrations. `anon` reads `recognition_details` of published places, and `place_relationships` where `status = 'confirmed'` and both places are published.
2. **Migration `20261120110000_recognition_places.sql`: move the places.** One transaction. For each published conservation area whose `designation` is in the table above: set its `place_type_id`, insert its `recognition_details` from its `conservation_area_details`, and delete that row. Ids, boundaries, source ids, and stats stay. It fails and changes nothing unless the counts per type match the table (on the hosted database), or every count is zero (an empty local stack). The designation list is written once in this migration.
3. **Importer: `DESIG_TYPE` and `INT_CRIT`.** Keep both in the filtered file. A new command `import_wdpa.py attributes` sets `designation_type` on both details tables, and `criteria` on `recognition_details`, by SITE_PID, in committed batches. It writes nothing else, and reports the rows it changed and any stored place whose SITE_PID it did not find. Test it in `supabase/tests/test_import_wdpa.py`.
4. **Runner `supabase/derive_recognises.py`.** For each published recognition, in batches, call `place_overlaps` and insert a `derived`, `proposed` `recognises` row to each conservation area where the intersection is at least 1% of either place. It records the boundary versions and both coverages. A rerun skips pairs that already have a row. It prints how many rows have `object_coverage` of at least 25%, 50%, 75%, and 90%, per recognition type. `--confirm-at <share>` then sets `status = 'confirmed'` on derived rows at or above it, and changes nothing else.
5. **Tests.** Extend `records_fixture.sql`: a conservation area, a World Heritage Site over it, and a Ramsar site over part of it. Check the move, the details trigger, `place_summaries` for both kinds, `place_overlaps`, the relationship constraints, and that `anon` sees only confirmed links. Run the local database steps in `supabase/README.md`, the importer and reconciliation tests, and the catalog suite.
6. **Docs.**
   - `docs/database/design.md`: categories, types, `recognition_details`, `object_coverage`, and `place_overlaps` *in place*.
   - `docs/database/decisions.md`: record 21, which designations are recognitions and why grouping is by designation text.
   - `docs/blueprint.md`: the recognitions archive and its layer.
   - `docs/user/data.md`: Places lists conservation areas only. Recognitions are stored but not shown until task 09b.
   - The parcel: tick nothing yet; rewrite task 09's goal, add task 09b, and in **I. Deferred** add `STATUS_YR` / `inscribed_on`, review of the proposed links, and links between recognitions.

### naturewatch-analysis

7. **Places script and recipes.** One branch from `main`, one pull request into `main`, linked from the app pull request.
   - `source.place_type` also accepts a list. The `stats:` block becomes optional.
   - The archive carries `place_type_id` when the recipe lists it as a property.
   - New recipe `cookbook/recipes/places-recognitions.yaml`: the six recognition types, archive `gs://nature-watch-tiles/places/recognitions/v1/recognitions.pmtiles`, layer `recognitions`, properties `id`, `area_km2`, `place_type_id`, and the area minzoom bands of the places recipe.
   - Update `cookbook/test_recipe.py` and `places/test_places.py`. Run `prove --bbox` for both recipes against the local Supabase stack loaded with the fixture.
   - `places/README.md`: the recognitions recipe, and the run record after the hosted step.

### Hosted, in this order, each after approval

8. **Database.** Before: per-type counts, a backup newer than task 08's push, `supabase migration list`. Push both migrations. Check the per-type counts and that `place_window('conservation_area', …)` counts 39,457 places minus those outside `listed_places`.
9. **`DESIG_TYPE`.** Run `import_wdpa.py attributes` against the hosted database. Report rows changed and rows not found.
10. **Links.** Run `derive_recognises.py` in batches. Report its run time and the coverage counts. The user picks the threshold. Then run `--confirm-at`.
    - *12 November 2026:* `derive` ran the hosted database out of memory after 875 recognitions and 1,162 links, on a Natura 2000 site of 862,145 vertices, and Postgres restarted. The user chose to compute the remaining links on a workstation instead: `derive_recognises.py compute` reads the places from the database and the shapes from the import's filtered file, in EPSG:6933, and `load` inserts the rows. The links already inserted stay. The same 1% rule applies.
11. **Rollback copy.** Delete the stale South Africa `places.previous.pmtiles` in `places/protected-areas/v1/`, so that `submit --replace` keeps the current global archive as the rollback copy. Removing a 3.4 MiB object costs nothing.
12. **Archives.** Two Batch jobs as in `places/README.md`, each estimated under $0.10 and a few cents a month of storage: the places recipe with `submit --replace`, then the recognitions recipe with `submit`. Record each job id, output, status check, and how to cancel it, then return. Do not wait in the chat. When they finish, record the run in `places/README.md`, and check that the 64 merged parcels draw as their kept places and that no recognition is in the places archive.

## Do not

- Do not change the frontend, the catalog, or what the Places panel shows, beyond recognitions leaving the conservation area list. That is task 09b.
- Do not create new places or change any place id, boundary, source id, or stat.
- Do not store spatial overlap other than reviewed or derived `place_relationships` rows. Do not link recognitions to each other, or conservation areas to each other.
- Do not confirm a link before the user has picked the threshold.
- Do not import `STATUS`, `STATUS_YR`, `GOV_TYPE`, or `PA_DEF`.
- Do not add profiles, roles, images, eligibility, or `stat_run_issues`.
- Do not push a migration, run the importer or runner against the hosted database, delete a bucket object, or start a Batch job without approval.
- Do not commit a database URL, a token, or a password.
- Do not start task 09b or task 10.

## Done when

- The hosted database has the recognition types, the 11,480 moved places with `recognition_details`, `designation_type` on every matched details row, `place_relationships` with derived links, the chosen threshold confirmed, and `place_overlaps`.
- The fixture checks, the importer and reconciliation tests, the catalog suite, and the analysis tests pass.
- `places/protected-areas/v1/places.pmtiles` is rebuilt from current boundaries of published conservation areas, with the global build as its rollback copy. `places/recognitions/v1/recognitions.pmtiles` exists. Both runs are recorded.
- design.md, decisions.md, blueprint.md, data.md, the parcel, and the analysis README match the result.
- One pull request into `develop` here and one into `main` in naturewatch-analysis, linked to each other, merged after their checks pass and the user approves.

## How to work

Branch from `develop` here and from `main` in naturewatch-analysis. Do this task only. Get approval before each hosted step. Do not commit secrets. Do not add an AI or tool attribution to a commit or a pull request.
