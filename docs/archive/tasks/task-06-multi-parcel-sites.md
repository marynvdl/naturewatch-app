# Task 06 — Multi-parcel sites

Parcel: [Database Honing](../../parcels/database-honing.md)

Repository: naturewatch-app. Start only after task 05b has merged into `develop` (pull request #402).

## Goal

Decide each of the 74 multi-parcel WDPCA sites: keep its parcels apart as separate places, or merge them into one. Record each decision in the database, so no `wdpa_site_id` row stays `proposed`. Write the user's reasons down as criteria for future multi-parcel sites.

Decided 11 November 2026 by the user: task 06 builds only what has a reader now. The parcel's task 06 also listed boundary checks, `qc_status`, the Stats eligibility columns and RPC, `stats_eligible_boundaries`, and one derived admin review queue. Those move to **I. Deferred**:

- Nothing reads eligibility or `stats_eligible_boundaries` while the Stats Pipeline is paused. Task 07 only backfills the 941 existing facts.
- A hand review of flagged boundaries cannot be done. A read-only count of the 51,001 current boundaries on 11 November 2026 found 3,885 with more than 10 parts, 603 with more than 100, 2,809 with more than 10 holes, and 198 with more than 100,000 vertices (largest 1,952,317). The thresholds were examples. Whether a flag matters depends on what Stats does with it, so the thresholds belong with the parcel that resumes Stats.
- There is no admin screen, and no roles until task 10. A queue view and a table of reviewer decisions would serve screens that do not exist yet.
- `geometry_valid` would only record passes: a constraint already makes every current boundary valid. It matters for `submit_boundary`, which has not been built.

*Amended 11 November 2026, after the review (step 3).* The user decided 35 merges and 39 keep-aparts, and chose to merge now, to strip a part suffix from a merged place's name, and to keep apart the three sites whose parcels differ in IUCN category.

## Facts already stored

From the migrations, the importer, and task 05a's hosted checks:

- 74 sites have more than one published parcel: 186 places, each with a confirmed `wdpa_site_pid` row and one current boundary. Each site has one `proposed` `wdpa_site_id` row, on its largest parcel. The site unions are kept as superseded boundary versions (task 05a).
- `match_status` is `confirmed`, `proposed`, or `retired`. A confirmed row is unique per `(source_id, id_kind, source_record_id)`. `place_source_ids` has no note or reviewer column. `matched_by` comes with `profiles` in task 10.
- The importer treats a `confirmed` or `proposed` `wdpa_site_id` as a known site. `reconcile` classes a new parcel of that site as `new_in_known_site` (`match_status <> 'retired'`). `check` requires one `confirmed` or `proposed` site row per stored site. So retiring a site row would break both. `upload` only updates `last_seen_release_id` on site rows.
- `reconcile` compares each record with the current boundary of the place its SITE_PID points at, and flags `merged_place` when a place has several SITE_PIDs. After a merge, each parcel record is compared with the union, so it is classed `very_different`, and `upload` refuses before any write.
- The places PMTiles are built from `places.geom` of every place by `places/protected_areas.py` in naturewatch-analysis, with no publication filter. Task 07 points the places recipe at the current boundary.
- The profile (`/places/:id`, `loadPilotPlace` in `frontend/naturewatch/src/places/api.ts`) reads `protected_areas`, and the map reads `place_bounds`. Both return nothing for a merged place. `places_select` shows only published places to `anon`. Nothing in the frontend handles a merged place.
- `unmerge_wdpa_site_parcels()` undoes task 05's merge only. It is not a general undo.

From the review on 11 November 2026 (the review page and CSV are in the scratchpad, not committed):

- **Merge, 35 sites, 99 parcels, 64 places become `merged`.** Australia: 126438, 126975, 24133, 313745, 313835, 313836, 313845, 356566, 565, 63547, 63788. Canada: 302409, 302422, 302434, 302435, 302438, 555515600, 555515606, 555621565, 555758870, 555758871, 555758874, 611, 629, 65785. Mongolia: 124309, 145566, 313186, 313187, 555576563, 798, 93538, 93647. Argentina: 555635835, 555635836. Only 555758870 has parcels that overlap. None has facts.
- **Keep apart, 39 sites:** 16894, 23, 555599263, 555599266, 555599273, 555790551, 555759398, 555625644, 555759267, 2409, 555759266, 314990, 555790441, 555599267, 24496, 555759400, 555577374, 4170, 4171, 18612, 555558128, 23292, 555783753, 555783754, 555783756, 555783781, 555783786, 555783785, 555783790, 93566, 555705345, 555705202, 801, 555705344, 555703187, 209777, and 23282, 302415, 4168 (marked merge, kept apart because their IUCN categories differ).
- The kept place is the parcel that holds the site row, which is the largest in every merged site.
- **Names.** Strip a trailing ` /A/`, ` /B/`, or `-1`: Gobiin baga, Gobiin ikh, Onon-Balj, Siilkhemiin nuruu, Mongol daguur, Chingeltei khairkhan uul. Where the parcels share no name: 555635835 becomes "Iberá National Park", 555635836 "Iberá National Reserve", 93647 keeps "Sharga, Mankhan". The other 26 keep their names.
- **The user's criteria**, in order: different IUCN categories, keep apart; different designations, keep apart; zones of one reserve (core, buffer, transition), keep apart; the same name apart from a part suffix, with the same designation and IUCN category, merge; one management unit with one designation, merge. 555599263 notes that its two category VI parcels could be merged on their own later.

## Do this

1. **Report, read-only.** *Done 11 November 2026.* One row per parcel with designation, IUCN category, ISO3, area, overlap, the site row, and the Protected Planet URL, as a CSV in the scratchpad and a private Artifact page with a map per site.
2. **Decide.** *Done 11 November 2026.* See Facts.
3. **Migration `supabase/migrations/20261117100000_merge_wdpa_site.sql`.** Functions only.
   - **`merge_wdpa_site(p_site_id text, p_name text default null)`**, `security definer`, `set search_path = ''`, execute revoked from `public`, `anon`, and `authenticated`. In one transaction it refuses unless the site's `wdpa_site_id` row is `proposed` or `confirmed` and the site has at least two published parcels. Then:
     - The kept place is the one holding the site row. It gets the next boundary version: `st_multi(st_union(...))` of the site's published parcels' current boundaries, `approved`, current, source and release of the kept place's current boundary, `source_record_id` = SITE_ID, the site's Protected Planet URL. Its old current boundary becomes `is_current = false` with `superseded_at`.
     - Each other parcel: its current boundary is superseded the same way, its place becomes `merged` with `merged_into_place_id` = the kept place, and its `wdpa_site_pid` row points at the kept place. Its details row stays on its own place.
     - The site row becomes `confirmed`. When `p_name` is given, the kept place gets that name.
     - Returns the number of places merged.
     - Undo stays possible from stored data (each superseded parcel boundary holds its SITE_PID), but no unmerge function is built until one is needed.
   - **`place_merged_into(p_id uuid) returns uuid`**, `security definer`, `stable`: for a `merged` place, the published place it was merged into, following the chain. Null otherwise. Granted to `anon`, `authenticated`, and `service_role`.
4. **Migration `supabase/migrations/20261117110000_wdpa_site_decisions.sql`.** Data. One `values` list of SITE_ID, decision, and new name, with the user's reason as a comment on each line. `keep_apart` sets the `proposed` site row to `confirmed`. `merge` calls `merge_wdpa_site`. It fails, and changes nothing, unless every listed site row is `proposed` on a site with more than one published parcel, and the rows changed match the list. After it: no `wdpa_site_id` row is `proposed`, 64 places are `merged`, and every published place has exactly one current boundary.
5. **Frontend.** In `frontend/naturewatch/src/places/api.ts`, when `loadPilotPlace` finds no place, it calls `place_merged_into`. If that returns an id, the profile replaces the route with that id. Until task 07's tiles, a merged parcel is still drawn on the map, and a click on it opens the kept place. Add a unit test.
6. **Tests.**
   - Extend `supabase/tests/records_fixture.sql`: a fixture site with two parcels and a `proposed` site row becomes `confirmed` on keep apart. Another is merged: one current boundary that is the union, the other place `merged`, its SITE_PID on the kept place, the name set, `place_merged_into` returns the kept id, `protected_areas` and `place_bounds` return only the kept place. `merge_wdpa_site` refuses a single-parcel site and a site whose row is `retired`. The decisions migration's check fails on a row that is not `proposed`.
   - `reconcile` still classes a new parcel of a kept-apart site as `new_in_known_site`, and `check` still counts the site. A merged site's parcel records are classed `very_different` with `merged_place`, and `upload` refuses without writing.
   - Run the local database steps in `supabase/README.md`, the importer tests, the catalog suite, `npm run type-check`, and `npm run lint`.
7. **Docs.**
   - `docs/database/design.md` 4.1: what a confirmed `wdpa_site_id` means on a site with several places, and that `merge_wdpa_site` and `place_merged_into` are in place. 4.2: the checks, `qc_status`, eligibility, and `stats_eligible_boundaries` come with the parcel that resumes Stats, not task 06.
   - `docs/database/decisions.md` record 20: the review queue becomes "a person's decision, recorded in `match_status`". Add the user's criteria for a site decision, in order, and say that the 74 decisions of 11 November 2026 are the worked examples, in the decisions migration. Records 7 and 8 stay.
   - `supabase/README.md`: a merged place stops `upload` until the comparison in Deferred is built.
   - The parcel: rename task 06 to "Multi-parcel sites" and rewrite its goal. In **G. Backfill rules**, update the Sites bullet and the QC bullet. In **I. Deferred**, add: the four boundary checks, `qc_status`, the Stats eligibility columns and `set_stats_eligibility`, `stats_eligible_boundaries`, and the review of flagged boundaries, with the parcel that resumes Stats; the derived admin review queue, with Molding Places after task 10; `reconcile` comparing a merged place with the union of its parcel records, and keeping a merged place's name, with the next import; an unmerge function, with the first unmerge; the reconcile report suggesting a site decision from the criteria, with the next release that has new multi-parcel sites. Keep the existing "More review queue checks" bullet and point it at the Stats parcel. Add to task 07's goal: rebuild the places PMTiles so merged parcels draw as their kept place.
8. **Hosted, after approval.** Open the pull request first. Then wait for approval.
   - Before: record the counts of published and merged places and the first 50 ids of `protected_area_window` with the defaults.
   - `supabase migration list`, then push both migrations.
   - Check read-only: no `wdpa_site_id` row is `proposed`; 64 places are `merged`, 50,937 are published; every published place has one current boundary and every merged place none; `protected_areas` returns 50,937 rows; the 35 kept boundaries are valid.
9. Run the `browser-check` skill against the hosted database on `/places`, the profile of one kept place (Gobiin ikh), and the URL of one merged parcel, which must open its kept place, wide and narrow.
10. Archive the task on this branch, as the `task` skill says.

## Do not

- Do not add `qc_status`, eligibility columns, `boundary_checks`, `stats_eligible_boundaries`, a review queue view, a decisions table, or a reason column.
- Do not retire a `wdpa_site_id` row, or move it to another parcel.
- Do not change the importer's classes or writes, or build an unmerge function.
- Do not change the analysis repo or rebuild the PMTiles (task 07).
- Do not touch the stats tables (task 07).
- Do not push the migrations before approval, and do not change compute or disk.
- Do not commit the report, a database URL, a token, a password, or a login role.
- Do not start task 07.

## Done when

- Every one of the 74 sites has the user's decision in the hosted database: no `wdpa_site_id` row is `proposed`, and the 35 merged sites each have one published place with the union as its current boundary.
- The URL of a merged parcel opens its kept place.
- The fixture checks, the importer tests, the catalog suite, type-check, and lint pass. The browser check shows `/places` and the profiles working on a wide and a narrow screen.
- The criteria are in record 20. The design, decisions, README, and parcel match the code, and the deferred items are listed in the parcel.
- The work is in one pull request into `develop`. Report its address and the required checks. Do not merge it.

## How to work

Branch from `develop`. Do this task only. Get approval before the hosted step. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
