# Task 05a — Places cleanup

Parcel: [Database Honing](../parcels/database-honing.md)

Repository: naturewatch-app. Start only after task 05 has merged into `develop` (pull request #397, merged 10 November 2026).

## Goal

Make every stored WDPCA parcel its own Place again, by undoing task 05's merge of 186 places into 74 sites. Mark each multi-parcel site as undecided, so a person can later decide whether its parcels become one Place. Supersede record 19 of [decisions.md](../database/decisions.md) with a new record. Apply it to the hosted database after approval.

Decided 11 November 2026 by the user, replacing the planned "one place per designation". A fixed rule kept merging places worth watching on their own, such as Gorongosa National Park into its buffer zone and the IUCN Ia cores of the Mexican category VI sites.

The review queue is designed in task 06. It covers multi-parcel sites, boundary checks, and later the recognition and duplicate checks of task 09. Nothing in this task builds it (decided 11 November 2026).

## Facts already stored

Checked read-only on the hosted database on 11 November 2026:

- 51,001 places: 50,889 `published` and 112 `merged`. 50,889 boundaries in `place_boundaries`, one current per published place. No place has a null `places.geom`.
- The 74 kept places' current boundary is version 1, the union of their site's parcels. The 112 merged places have no boundary row. Their own shapes are still in `places.geom`, which stays until task 08.
- `places.source_id` (SITE_PID) was dropped in task 04. After the merge, all 186 confirmed `wdpa_site_pid` rows point at the kept places. Each kept place's `conservation_area_details.source_attributes.parcels` lists its parcels with SITE_PID, name, designation, IUCN category, and area. Matching each entry to a place in the same site on name, designation, and area within 1e-9 relative gives exactly one place per SITE_PID, for all 186. An exact float match finds only 3, because the area went through JSON.
- Every parcel keeps its own `conservation_area_details` row, with its designation and IUCN category.
- No kept place and no merged place has a fact.
- `place_source_ids_confirmed_key` makes a confirmed `(source_id, id_kind, source_record_id)` unique. `match_status` allows `confirmed`, `proposed`, and `retired`. Each site has one `wdpa_site_id` row, on its largest parcel.
- The published places PMTiles still has the 186 parcels as separate features. Clicking one of the 112 opens "missing" today. After this task each one opens again.
- Only parcels of at least 10 km² were imported. The rule applies per parcel again, as when they were imported.
- About 186 geometries are copied. Micro compute was enough for task 05's merge.

## Do this

1. **Migration `supabase/migrations/20261114100000_unmerge_wdpa_parcels.sql`.** It refuses to run unless the 186 parcels match their places one-to-one, as above.
   - **Places.** Set the 112 merged places back to `published`, with `merged_into_place_id` null.
   - **Source ids.** Point each `wdpa_site_pid` row back at its parcel's place. Set the 74 multi-parcel sites' `wdpa_site_id` rows to `proposed`. They stay on the largest parcel. A `proposed` row means a person has not decided yet (record 4). It is the only flag this task adds.
   - **Boundaries.** For each of the 112, add a version 1 boundary from `places.geom`. For each of the 74 kept places, set version 1 (the site union) to `is_current = false` with `superseded_at`, then add version 2 from `places.geom`. Each new row: `approved`, current, source WDPCA October 2026, `source_record_id` = SITE_PID, the Protected Planet page as `source_url`. An invalid geometry stops the migration and names the place. Do not repair it.
   - **Details.** Remove `parcels` and `designations_differ` from the kept places' `source_attributes`.
   - Delete nothing. Do not change any `places.id`. A second run changes nothing.
2. **Local checks.** Extend the multi-parcel site in `supabase/tests/records_fixture.sql`. Check that the un-merge gives one current boundary per published place, moves every SITE_PID back, sets the site's `wdpa_site_id` to `proposed`, and that a second run changes nothing. Run the local database steps in `supabase/README.md`, the importer tests, the catalog suite, `npm run type-check`, and `npm run lint`. The frontend should need no change. If it does, stop and say why.
3. **Docs.**
   - In `decisions.md`, add record 20: a conservation area Place is one WDPCA parcel, and merging parcels is a person's decision, through the review that task 06 designs. Give the reason, the alternatives (record 19, and one place per designation), and the cost. Mark record 19 superseded by it, and keep it. In record 4, point "Site or parcel" at record 20, and key its table on SITE_PID.
   - In `design.md`, say a place is one parcel where it says a place is a site, and that a `proposed` `wdpa_site_id` marks an undecided site.
   - In the parcel:
     - Rewrite the backfill rules **Sites**, **Mixed designations**, and **Zoned sites** to say what this task did. Add the read-only query that lists the undecided sites.
     - Point task 05b's reconciliation at SITE_PID.
     - Rename task 06 "Boundary QC and review queue". In its goal, say that its task file designs one derived admin queue over every check's findings. The queue starts with multi-parcel sites, `small_components`, `holes`, and vertex count. The merge function arrives with the first merge.
     - Under **I. Deferred**, list the later checks: likely recognitions and likely duplicates (task 09); reported area far from mapped area (`REP_AREA` against `GIS_AREA`); a status other than designated; a boundary mostly outside its `ISO3`; a missing or placeholder name.
   - Update `docs/blueprint.md` and `supabase/README.md` only where they say a place is a site.
4. **Hosted, after approval.** Open the pull request first. Then report the hosted counts and wait for approval.
   - Confirm point-in-time recovery or a backup. `supabase migration list`, then push the migration.
   - Check read-only: 51,001 places, all `published`; 51,001 current boundaries; 186 confirmed `wdpa_site_pid` rows, each on its own place; 74 `proposed` `wdpa_site_id` rows; 941 facts, all on published places; `protected_areas` returns 51,001 rows.
5. Run the `browser-check` skill against the hosted database on the map, the "In view" list, and the profiles of Gorongosa National Park and the Gorongosa Buffer Zone (SITE_ID 801), wide and narrow. Report the list's size, and each profile's area and map zoom.
6. Archive the task on this branch, as the `task` skill says.

## Do not

- Do not add a review table, a queue view, or merge functions. Task 06 designs the queue.
- Do not review or merge any site.
- Do not write, null, or drop `places.geom`. Task 08 does that.
- Do not delete a place, a boundary, a details row, a source id row, or a fact.
- Do not change the importer or add the generic reads (task 05b), the boundary checks (task 06), or the frontend. Do not republish PMTiles.
- Do not repair a geometry. Stop and report.
- Do not push the hosted migration before approval, and do not change compute or disk.
- Do not commit a database URL, token, password, or login role.
- Do not start task 05b.

## Done when

- Every one of the 186 parcels is a published place with its own current boundary and SITE_PID, locally and on the hosted database. The 74 site unions remain as superseded version 1 boundaries, and the 74 `wdpa_site_id` rows are `proposed`.
- Record 20 is in `decisions.md`, and record 19 is marked superseded. `design.md` and the parcel match the database, and the parcel names task 06 as the review queue.
- The fixture checks, the importer tests, the catalog suite, type-check, and lint pass.
- The map, the list, and both Gorongosa profiles work on a wide and a narrow screen.
- The work is in one pull request into `develop`. Report its address and the required checks. Do not merge it.

## How to work

Branch from `develop`. Do this task only. Get approval before the hosted step. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
