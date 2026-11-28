# Task 03b — Plain boundary review

Parcel: [Shaping Boundaries](../../parcels/shaping-boundaries.md).

Repository: naturewatch-app. Start from `develop`. Task 03 merged in #477.

## Goal

The Status tab and the review list use plain words for the decisions an admin makes. A boundary gets one verdict in one click: **Shape is right, count it**, **Needs fixing**, or **Leave out of Stats**. The place's own controls become **Hide from map** and **Flag for follow-up**. One line says whether the place is counted in Stats, and why. The review list becomes a filter on the places list, so Sort, In view, the place types, and Filter apply to it. The database keeps its names. Only the screen changes, plus the one value and the one RPC that the verdicts need.

Done on 27 November 2026. The migration was applied to the local database with psql and to hosted after the user approved it. On hosted, the task 03 functions are gone, and the 2 accepted boundaries are unchanged. The browser check ran against the local stack and restored every row it changed. In it, a long card note overflowed its tag on a narrow screen, so `PlaceCard` now keeps a note to one line with an ellipsis.

Afterwards, at the user's request, the 43 ecoregions under To review were counted at once on hosted, as owner, with one note: "Shape is right: all ecoregions in To review counted at once, at the admin's request, 27 Nov 2026." All 846 ecoregion boundaries are now counted.

## Facts already stored

From the code and the hosted database on 27 November 2026:

- **Task 03** (`20261208100000_boundary_review.sql`) added `accept_boundary_qc`, `admin_boundary_list`, and the audit trigger on `place_boundaries` without `geom`. `AdminBoundaryList.vue` is a fourth admin list. `PlaceBoundaryReview.vue` is the Boundary section of the Status tab, with Accept warnings, Eligible, Excluded, and Back to pending.
- **Values.** `qc_status` is `unchecked`, `passed`, `flagged`, or `accepted`. `stats_eligibility` is `pending`, `eligible`, or `excluded`. A CHECK allows `eligible` only when QC is `passed` or `accepted`. `set_stats_eligibility` asks for a reason for `excluded`, and for `eligible` when QC is not `passed` ([record 8](../../database/decisions.md#8-stats-eligibility-is-stored-and-changed-only-on-purpose)).
- **What Stats reads.** `stats_eligible_boundaries` keeps current, eligible boundaries of published places. So a withdrawn place is never counted, and a flag (`place_attention`) does not affect Stats.
- **Hosted counts.** 51,000 boundaries are eligible, all of them under 100,000 vertices. 783 were left pending: 650 flagged and 133 heavy. 2 were accepted in the app after task 03.
- **`check_boundaries.py load`** keeps an `accepted` status on a rerun, and sets a flagged boundary that was eligible back to pending.
- **The photo filter is the pattern for a list filter** (`20261202100000_photo_queue_and_licences.sql`).
  - `p_photo_suggestions` is a parameter of `place_matched`, `place_window`, `place_window_count`, `place_rank`, `place_kept_ids`, and `place_extent`.
  - These functions are `security invoker`.
  - `PlacesFilterDialog.vue` shows the filter to admins in edit mode, and `PlacesStore.photoSuggestions` holds it. The photo queue's own list was dropped when the filter came.
  - The QC columns are granted to `authenticated` but not to `anon`. A visitor's call must not touch them.
- **Place status.** `set_place_publication` (Withdraw and Restore) and `set_place_attention` (Flag and Clear) are in `PlaceStatusEditor.vue`. The Account menu lists are Needs attention and Withdrawn (`admin_place_list`). A withdrawn or flagged place has a tag under its name in edit mode.

## Decided

With the user, 27 November 2026:

- **Words on screen name the decision.** QC, warnings, accepted, eligible, excluded, and pending are not shown. The database keeps its names.
- **The Boundary section gets three verdicts:**
  - **Shape is right, count it**: a flagged boundary becomes `accepted` and `eligible`, and a passed one becomes `eligible`. A note is required when the checks warned.
  - **Needs fixing**: the shape is wrong, but the place is real. Stats does not count it until a fixed boundary replaces it (tasks 05 and 06).
  - **Leave out of Stats**: the place should not be counted. A note is required.
  - **Back to review**, shown once a verdict is set, undoes it.
- **"Leave out of Stats" stays on the boundary**, in the database and on screen. A replaced boundary comes back to review.
- **Cost is not a verdict.** A heavy boundary with a right shape gets "Shape is right, count it". The Stats run applies the vertex cap from the `vertex_count` finding, and records it in its `selection`. Heavy boundaries get a later run of their own, priced and approved first.
- **Place controls.**
  - Withdraw becomes **Hide from map**, and Restore becomes **Show on map**.
  - Needs attention becomes **Flag for follow-up**.
  - The Account menu lists become **Hidden** and **Follow-up**.
- **A Stats line** sits at the top of the Status tab, for example:
  - "Not counted in Stats: hidden from map."
  - "Counted in Stats."
  - "Counted in Stats, in a separate run: over 100,000 points."
  - "Not counted in Stats: the shape needs fixing."
  - "Not counted in Stats: left out. <note>"
  - "Not counted in Stats yet: not reviewed."

  It replaces the "Eligible for Stats" line, so each fact is shown once.
- **The review list becomes a filter**, as photo suggestions did. Sort, In view, the type buttons, and Filter then apply to it.

- **"Needs fixing" is a new `qc_status`, `rejected`** (approved with this file). It is a verdict on the shape, beside `accepted`. Eligibility stays `pending`, and a replacement starts `unchecked` and `pending`.
- **The Boundaries button leaves the Account menu** (approved with this file). The filter lives in Filter, under "Boundary review", as the photo queue did.

## Do this

1. **Migration `20261209100000_plain_boundary_review.sql`.**
   - `qc_status` also allows `rejected`. Update the CHECK and the column comment.
   - `review_boundary(p_boundary_id uuid, p_verdict text, p_note text)`, admin only, for a current boundary. It handles four verdicts:
     - `count`: `flagged` becomes `accepted`, then `eligible`. It refuses `rejected` or `unchecked` QC. A note is required when QC was `flagged`.
     - `fix`: `qc_status` becomes `rejected`, and eligibility `pending`. The note is optional.
     - `leave_out`: eligibility becomes `excluded`, and QC is unchanged. A note is required.
     - `undo`: eligibility goes back to `pending` with no reason. `accepted` or `rejected` QC goes back to what the latest findings say: `flagged` if a technical or modelling check warns or fails, else `passed`.

     It writes the same `stats_eligibility_set_by` and `_set_at` columns as `set_stats_eligibility`, and returns the boundary's `qc_status` and eligibility.
   - Drop `accept_boundary_qc` and `admin_boundary_list`. Nothing else calls them.
   - **The list filter.**
     - A private, `security definer` helper, `boundary_review_place_ids(p_view text)`. It returns the place ids of current boundaries in a view, and returns none to a non-admin:
       - `to_review`: `pending`, and not `rejected`;
       - `needs_fixing`: `rejected`;
       - `left_out`: `excluded`.
     - The six list reads take `p_boundary_review text default null` and keep `place_id = any (helper(...))` when it is set, as `p_photo_suggestions` does.
   - `boundary_review_notes(p_place_ids uuid[])`, admin only. For each place, it returns the checks whose latest finding warns or fails, the vertex count, the vertex cap used, and the reason. The list's cards use it.
2. **`supabase/check_boundaries.py`**: `load` keeps `rejected`, as it keeps `accepted`.
3. **Frontend.**
   - **`src/places/boundaryReview.ts`.**
     - `reviewBoundary(id, verdict, note)`.
     - `loadBoundaryNotes(placeIds)`.
     - Plain finding texts: "Many tiny pieces: 82 of 129 under 0.01 km²", "Many tiny holes: …", "412,000 points", and "Shape not valid".
     - `statsLine(placeStatus, review)`.
     - Remove what nothing calls any more.
   - **`PlaceBoundaryReview.vue`.**
     - The heading is **Boundary**.
     - The shape check lists the findings, with ✓ or ⚠.
     - The verdict buttons are shown for the states they apply to, with a Note field and **Back to review**.
     - It shows "Not reviewed", "Shape is right", "Needs fixing", or "Left out of Stats", with when and by whom.
   - **`PlaceStatusEditor.vue`.**
     - The Stats line goes at the top.
     - A **Place** heading goes over Hide from map and Flag for follow-up, with the new labels and help texts.
     - The profile tags read "Hidden: <reason>" and "Follow-up: <reason>".
   - **`PlacesFilterDialog.vue`**: a **Boundary review** group for admins in edit mode. It has To review, Needs fixing, and Left out, and none chosen means no filter. `PlacesStore.boundaryReview` holds the choice, and `src/places/api.ts` passes it to the list reads.
   - **Cards.** In the filtered list, each card's note shows the warnings and points, or the note on Left out, from `loadBoundaryNotes`. A click opens the place on its Status tab in edit mode, as the photo filter opens Photos.
   - **`AccountButton.vue`.**
     - Remove Boundaries.
     - Rename the list buttons to Hidden and Follow-up.
     - Remove `boundaries` from `PlacesStore.adminList`, and delete `AdminBoundaryList.vue`.
4. **Tests.**
   - **pytest.**
     - Each verdict and `undo`, including `undo` after `count` on a flagged boundary.
     - The note rules, and refusal for a non-admin and a non-current boundary.
     - The three filter views.
     - A visitor's list read still works and is not filtered.
     - The notes RPC.
     - `load` keeps `rejected`.
   - **vitest.**
     - `PlaceBoundaryReview.spec.ts`, rewritten.
     - The Stats line for each case.
     - The filter group in `PlacesFilterDialog.spec.ts`.
     - The card notes and the click in `PlacesBarComponent.spec.ts`.
     - The renamed lists in `AccountButton.spec.ts`.
   - Run the catalog suite, the full vitest suite, `npm run type-check`, and `npm run lint`.
5. **Browser check** against the local stack, wide and narrow. Afterwards, restore the rows that were changed.
   - Filter to To review, sort by size, and open a flagged place.
   - Choose Shape is right, count it, then Back to review.
   - Choose Needs fixing, and see it under Needs fixing.
   - Leave a place out, then hide a place, and read the Stats line each time.
   - Check that Sort, Filter, In view, and the type buttons stay visible and work.
6. **Hosted.** Run `supabase db push --linked --dry-run`, then push only after the user approves. No data is written. The 2 accepted boundaries stay as they are.
7. **Docs.**
   - `docs/user/using-the-map.md`: the Boundary and Place sections, the Stats line, the filter, and the renamed lists.
   - `docs/database/design.md`:
     - §4.2: `rejected`, `review_boundary`, the helper, and the notes RPC, with the task 03 functions marked as dropped;
     - §4.6: the renamed lists, as labels only;
     - §6: the RPC list.
   - [Record 8](../../database/decisions.md#8-stats-eligibility-is-stored-and-changed-only-on-purpose): one line saying `review_boundary` changes eligibility on purpose too, and that eligibility no longer implies being under the vertex cap.
   - The [Stats Ledger](../../parcels/stats-ledger.md) parcel, Design: the run applies the vertex cap from the `vertex_count` finding and records it in its `selection`.
   - This parcel: add this task before task 04.

## Do not

- Do not rename tables, columns, or stored values, apart from adding `rejected`.
- Do not change `set_place_publication`, `set_place_attention`, or `stats_eligible_boundaries`.
- Do not add bulk actions. Each verdict is one boundary.
- Do not review boundaries on hosted. The admin does that in the app.
- Do not push the migration to hosted before the user approves.

## Done when

- The migration is applied to the local and hosted databases.
- In edit mode, an admin can filter the places list to To review, Needs fixing, or Left out, with Sort, In view, the types, and Filter working on it.
- On the Status tab, an admin gives a boundary its verdict in one click, can undo it, and reads whether the place is counted in Stats.
- The tests and the browser check pass.
- The docs are updated.
- The task is archived on this branch.
