# Task 03 — Polygon review queue

Parcel: [Shaping Boundaries](../parcels/shaping-boundaries.md).

Repository: naturewatch-app. Start from `develop`. Task 02 merged in #473.

## Goal

An admin in edit mode opens a Boundaries list from the Account menu. It lists the current boundaries that are still `pending` or were `excluded`, with their findings. Choosing one opens the place on its Status tab. A Boundary section there shows the findings. The admin can accept the warnings, which sets `qc_status` to `accepted`, and can set the boundary to `eligible`, `excluded`, or back to `pending`, with a reason. Every change is audited. Nothing on the map changes.

Done on 27 November 2026. The migration was applied to the local database with psql, because the local history lacks the corrections migration's row, and to hosted after the user approved it. The browser check ran against the local stack and restored the rows it changed. No boundary on hosted was reviewed.

## Facts already stored

From the code and the hosted database on 27 November 2026:

- **Hosted counts.** There are 51,783 current boundaries.
  - 51,000 are `passed` and `eligible`.
  - 650 are `flagged` and `pending`. 496 of them warn on `small_components`, 304 on `holes`, and 104 also on `vertex_count`.
  - 133 are `passed` and `pending`, because they are over the 100,000-vertex cap.
- **Schema** (`20261206100000_boundary_qc.sql`).
  - `boundary_checks` is append-only. Admins can select it. Each check has its `measured_value`, `threshold_used`, and `details`, such as `parts` and `small_parts`.
  - `set_stats_eligibility(boundary_id, eligibility, reason)` is admin only. It needs a reason for `excluded`, and for `eligible` when `qc_status` is not `passed`. It refuses `eligible` unless QC is `passed` or `accepted`.
  - No function sets `qc_status` to `accepted` yet.
  - The QC and eligibility columns of `place_boundaries` are granted to `authenticated`, and `geom` is not. Admins can select every row.
- **Audit.** `audit_row(key columns…)` writes the whole row as JSON. design.md §4.6 says the trigger on `place_boundaries` leaves out `geom` and comes with this task. One geometry can be about 1.9 million vertices.
- **Admin lists.**
  - `AccountButton.vue` has the buttons Needs attention, Withdrawn, and Corrections. Each one sets `PlacesStore.adminList`, and `PlacesBarComponent.vue` shows the list in the Places panel.
  - `AdminPlaceList.vue` shows `PlaceCard`s with a `note`, a count, and Show more. Choosing a card calls `openFromAdminList`, which opens the place on its Status tab in edit mode. `adminListVersion` makes the lists read again.
  - `AdminCorrectionList.vue` has the segmented status switch.
  - `PlaceStatusEditor.vue` is the Status tab, with the Withdrawal and Attention forms.
- The latest migration is `20261207100000_overlaps_on_pieces.sql`.

## Decided

With the user, 27 November 2026:

- **Where the work is done.** The list is a fourth admin list, "Boundaries", in the Places panel. A card opens the place on its Status tab, where a Boundary section holds the findings and the actions.
- **The list has two views.** A segmented switch chooses between Pending, the default, and Excluded. Eligible boundaries are not listed. They are reached through their place.
- **Accepting is its own step.** "Accept warnings" sets `flagged` to `accepted`. `eligible` becomes possible only after that, with a reason, as `set_stats_eligibility` already requires. An accepted boundary is not set back to `flagged`.
- **The audit leaves out `geom`.** `audit_row` learns that an argument starting with `-` names a column to leave out of `old_values` and `new_values`. The trigger fires only when the QC or eligibility columns change.

## Do this

1. **Migration `20261208100000_boundary_review.sql`.**
   - `audit_row()`: arguments starting with `-` name columns to leave out. The key columns work as before.
   - Trigger `audit_place_boundaries_review`: `after update of qc_status, stats_eligibility, stats_eligibility_reason` on `place_boundaries`, when one of them is distinct. It calls `audit_row('id', '-geom')`.
   - `accept_boundary_qc(p_boundary_id uuid)`: admin only. It sets a `flagged` current boundary to `accepted` and returns the boundary's id and `qc_status`. Any other status is refused with a clear error.
   - `admin_boundary_list(p_eligibility text, p_limit int, p_offset int)`: admin only. `p_eligibility` is `pending` or `excluded`. It lists the current boundaries of published places by name. Each row has:
     - the place's id, name, type, `iso3`, and area, from `place_summaries`;
     - the boundary's id, `qc_status`, and `stats_eligibility_reason`;
     - the `check_id`s whose latest finding is `warn` or `fail`;
     - the latest `vertex_count` value;
     - the total.
   - The new functions are `security definer` with `set search_path = ''`. Execute is granted to `authenticated` only.
2. **`src/places/boundaryReview.ts`.**
   - `loadBoundaryList(eligibility, limit, offset)`.
   - `loadBoundaryReview(placeId)`: reads the current boundary's QC and eligibility columns and its `boundary_checks`, with the latest row per `check_id`, straight from the tables.
   - `acceptBoundaryQc(boundaryId)`.
   - `setStatsEligibility(boundaryId, eligibility, reason)`.
   - A finding's text, for example "Small parts: 412 of 600 parts under 0.01 km²", "Holes: 80 of 95 under 0.001 km²", and "Vertices: 412,000, over the cap of 100,000".
3. **`AdminBoundaryList.vue`** in the Places panel.
   - The Pending and Excluded switch, then a count, `PlaceCard`s, and Show more, as in `AdminPlaceList`.
   - A card's note names the warnings and the vertex count. On Excluded, it shows the reason.
   - Choosing a card opens the place on its Status tab in edit mode.
   - `AccountButton.vue` gets the "Boundaries" button. `PlacesStore.adminList` accepts `boundaries`.
4. **`PlaceBoundaryReview.vue`**, a Boundary section on the Status tab, above Withdrawal.
   - The QC status, the eligibility with its reason, who set it, and when. Then each finding with its outcome.
   - "Accept warnings" is shown while the boundary is `flagged`.
   - A plain reason field, at most 1,000 characters. It is required where `set_stats_eligibility` asks for a reason.
   - The buttons Eligible, Excluded, and Back to pending, shown for the states the boundary can move to.
   - After a change, it reads the boundary again and raises `adminListVersion`.
   - A place with no current boundary shows nothing.
5. **Tests.**
   - Extend `supabase/tests/test_boundary_qc_local.py`:
     - `accept_boundary_qc` for an admin and a non-admin, and its refusal of `passed` and `accepted`;
     - the list's filter, warnings, vertex count, total, and refusal for a non-admin;
     - the audit rows hold no `geom`, and an update of other columns writes no audit row.
   - `AdminBoundaryList.spec.ts`, `PlaceBoundaryReview.spec.ts`, and the new button in `AccountButton.spec.ts`.
   - Run the catalog suite, the full vitest suite, `npm run type-check`, and `npm run lint`.
6. **Browser check** against the local Supabase, wide and narrow.
   - Give a local boundary a `small_components` warning and the `flagged` status by hand.
   - Open Boundaries and see it under Pending. Open it, and see the findings on the Status tab.
   - Accept the warnings, set it eligible with a reason, and see it leave the list.
   - Set another boundary to excluded, find it under Excluded, and set it back to pending.
   - Afterwards, restore the rows that were changed by hand.
7. **Hosted.** Run `supabase db push --linked --dry-run`, then push only after the user approves. No data is written to hosted.
8. **Docs.**
   - `docs/user/using-the-map.md`: the Boundaries list and the Boundary section.
   - `docs/database/design.md`: §4.2 for `accept_boundary_qc` and `admin_boundary_list`; §4.6 for the trigger and the `-` arguments of `audit_row`; and the §6 RPC list.

## Do not

- Do not review the boundaries on hosted in this task. The admin does that in the app afterwards.
- Do not change the map, the tiles, or `stats_eligible_boundaries`.
- Do not add a way to set `accepted` back to `flagged`. Do not write `boundary_checks` from the app.
- Do not add overlaps, uploads, or map editing. Those are tasks 04 to 06.
- Do not push the migration to hosted before the user approves.

## Done when

- The migration is applied to the local and hosted databases.
- An admin can list pending and excluded boundaries, read their findings, accept the warnings, and set the eligibility with a reason, and each change is audited without `geom`.
- The local tests, the vitest suites, type-check, and lint pass, and the browser check is reported.
- The docs are updated.
- The task is archived on this branch.
