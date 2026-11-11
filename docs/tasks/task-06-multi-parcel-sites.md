# Task 06 — Multi-parcel sites

Parcel: [Database Honing](../parcels/database-honing.md)

Repository: naturewatch-app. Start only after task 05b has merged into `develop` (pull request #402).

## Goal

Decide each of the 74 multi-parcel WDPCA sites: keep its parcels apart as separate places, or merge them into one. Record each decision in the database, so no `wdpa_site_id` row stays `proposed`.

Decided 11 November 2026 by the user: task 06 builds only what has a reader now. The parcel's task 06 also listed boundary checks, `qc_status`, the Stats eligibility columns and RPC, `stats_eligible_boundaries`, and one derived admin review queue. Those move to **I. Deferred**:

- Nothing reads eligibility or `stats_eligible_boundaries` while the Stats Pipeline is paused. Task 07 only backfills the 941 existing facts.
- A hand review of flagged boundaries cannot be done. A read-only count of the 51,001 current boundaries on 11 November 2026 found 3,885 with more than 10 parts, 603 with more than 100, 2,809 with more than 10 holes, and 198 with more than 100,000 vertices (largest 1,952,317). The thresholds were examples. Whether a flag matters depends on what Stats does with it, so the thresholds belong with the parcel that resumes Stats.
- There is no admin screen, and no roles until task 10. A queue view and a table of reviewer decisions would serve screens that do not exist yet.
- `geometry_valid` would only record passes: a constraint already makes every current boundary valid. It matters for `submit_boundary`, which has not been built.

## Facts already stored

From the migrations, the importer, and task 05a's hosted checks:

- 74 sites have more than one published parcel: 186 places, each with a confirmed `wdpa_site_pid` row and one current boundary. Each site has one `proposed` `wdpa_site_id` row, on its largest parcel. The site unions are kept as superseded boundary versions (task 05a).
- `match_status` is `confirmed`, `proposed`, or `retired`. A confirmed row is unique per `(source_id, id_kind, source_record_id)`. `place_source_ids` has no note or reviewer column. `matched_by` comes with `profiles` in task 10.
- The importer treats a `confirmed` or `proposed` `wdpa_site_id` as a known site. `reconcile` classes a new parcel of that site as `new_in_known_site` (`match_status <> 'retired'`). `check` requires one `confirmed` or `proposed` site row per stored site. So retiring a site row would break both. `upload` only updates `last_seen_release_id` on site rows.
- The parcel's backfill rules list the 7 sites that mix designations, including Gorongosa National Park and its buffer zone, and 10 zoned sites with one designation: 7 Mexican IUCN Ia cores inside category VI sites, 2 Argentine biosphere reserves with core and buffer zones, and 1 Russian biosphere reserve in four parts.
- Nothing in the frontend handles a `merged` place. The places PMTiles are built from `places.geom` by `places/protected_areas.py` in naturewatch-analysis. Task 07 points the places recipe at the current boundary. A merge now would leave the merged parcels drawn on the map, linking to places the reads no longer return.

## Do this

1. **Report, read-only.** Query the hosted database through the read-only Supabase connection. For each of the 74 sites, write one row per parcel: SITE_ID, SITE_PID, place id, name, designation, IUCN category, ISO3, area in km², the area it overlaps the site's other parcels, whether it holds the site row, and its Protected Planet URL. Write it as a CSV in the scratchpad, with a `decision` column (`keep_apart` or `merge`) and a `reason` column per site. Also publish it as a private Artifact page grouped by site, with a small map of each site's parcels drawn from simplified geometry (`st_simplifypreservetopology`, a few hundred vertices per site). Nothing is written to the database. Nothing is committed.
2. **Decide.** The user fills in the decision for each site. Wait.
3. **If any site is `merge`:** stop. Amend this task file with the merge function (record 20: keep one place, set the others to `merged` with `merged_into_place_id`, point their SITE_PIDs at the kept place, add a new current boundary version), how the frontend handles a merged id, and when the places PMTiles are republished. Get the amendment approved before building it.
4. **Migration `supabase/migrations/20261117100000_wdpa_site_decisions.sql`.** Data only. For each `keep_apart` site, set its `wdpa_site_id` row from `proposed` to `confirmed`. The row stays on the largest parcel. A confirmed site row on a site with several published places means a person decided to keep the parcels apart. The decisions are written as one `values` list of SITE_ID with its reason as a comment. The migration fails, and changes nothing, unless every listed row is `proposed` on a site with more than one published parcel, and the number of rows updated equals the list.
5. **Tests.** Extend `supabase/tests/records_fixture.sql`: a fixture site with two parcels and a `proposed` site row becomes `confirmed`. The migration fails on a site row that is not `proposed`. `reconcile` still classes a new parcel of a kept-apart site as `new_in_known_site`, and `check` still counts the site. Run the local database steps in `supabase/README.md` and the importer tests.
6. **Docs.**
   - `docs/database/design.md` 4.1: say what a confirmed `wdpa_site_id` means on a site with several places. 4.2: the checks, `qc_status`, eligibility, and `stats_eligible_boundaries` come with the parcel that resumes Stats, not task 06.
   - `docs/database/decisions.md` record 20: the review queue becomes "a person's decision, recorded in `match_status`". Records 7 and 8 stay: they still describe the design.
   - The parcel: rename task 06 to "Multi-parcel sites" and rewrite its goal. In **G. Backfill rules**, update the Sites bullet and the QC bullet. In **I. Deferred**, add: the four boundary checks, `qc_status`, the Stats eligibility columns and `set_stats_eligibility`, `stats_eligible_boundaries`, and the review of flagged boundaries, with the parcel that resumes Stats; the derived admin review queue, with Molding Places after task 10. Keep the existing "More review queue checks" bullet and point it at that parcel. Check that task 07's goal does not rely on anything moved.
7. **Hosted, after approval.** Open the pull request first. Then wait for approval.
   - `supabase migration list`, then push the migration.
   - Check read-only: no `wdpa_site_id` row is `proposed`; the number of confirmed site rows rose by the number of `keep_apart` sites; 51,001 places are still published.
8. Archive the task on this branch, as the `task` skill says.

## Do not

- Do not add `qc_status`, eligibility columns, `boundary_checks`, `stats_eligible_boundaries`, a review queue view, or a decisions table.
- Do not build the merge function or merge a place without the amendment in step 3.
- Do not retire a `wdpa_site_id` row, or move it to another parcel.
- Do not change the frontend, the importer, the analysis repo, or the PMTiles.
- Do not touch the stats tables (task 07).
- Do not push the migration before approval, and do not change compute or disk.
- Do not commit the report, a database URL, a token, a password, or a login role.
- Do not start task 07.

## Done when

- Every one of the 74 sites has a decision from the user, and no `wdpa_site_id` row is `proposed` on the hosted database.
- The fixture checks and the importer tests pass.
- The design, decisions, and parcel match the code, and the deferred items are listed in the parcel.
- The work is in one pull request into `develop`. Report its address and the required checks. Do not merge it.

## How to work

Branch from `develop`. Do this task only. Get approval before the hosted step. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
