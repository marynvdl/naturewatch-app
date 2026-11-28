# Task 04 — Overlap review queue

Parcel: [Shaping Boundaries](../parcels/shaping-boundaries.md).

Repository: naturewatch-app. Start from `develop`. Task 03b merged in #480.

## Goal

An admin, in edit mode, filters the places list to the places that have proposed links. A proposed link is a `recognises` link below the confirmation share, or a new `overlaps` link between two conservation areas. On the Related tab, each proposed link gets one decision in one click, through `review_overlap`: **Keep link**, **Not related**, or, for two conservation areas, **Same place, hide it**. The overlapping conservation-area pairs are computed on a laptop and loaded as proposed links, as the `recognises` links were. This settles the parcel's open question on where the pairs come from.

## Facts already stored

From the code and the hosted database on 28 November 2026:

- **Hosted links.** All of them are derived and active.

  | Type | Confirmed | Proposed |
  | --- | --- | --- |
  | `recognises` | 8,017 | 6,748 |
  | `located_in` (ecoregions) | 57,914 | 3,813 |
  | `overlaps` | 0 | 0 |

  The proposed `recognises` links by type: Natura 2000 4,658, Ramsar 659, Emerald 594, World Heritage 369, UNESCO-MAB 243, other regional 225. They are the parks less than 75% inside the recognition (`object_coverage`).
- **Hosted places.** 39,457 published conservation areas have a current boundary.
- **`derive_recognises.py compute`** finds the links on a laptop, from the importer's filtered WDPCA file, in EPSG:6933, with an STRtree on the boxes. It keeps a pair when the shared area is at least 1% of either place, and writes a TSV. `load` inserts the TSV as derived, proposed rows, and skips a link whose boundary is no longer current or whose pair already has an active row. The work directory (`WDPA_WORK_DIR`, default `$TMPDIR/wdpa-work`) is no longer on this laptop. `import_wdpa.py build` downloads the pinned zip again and checks it.
- **Record 11** says that computed overlap is not stored, and that only a reviewer's decision is.
- **`place_relationships`.** `overlaps` is symmetric: a trigger requires `subject_place_id < object_place_id`. A derived row records both boundary versions and both coverages. `set_place_relationship(subject, type, object, status)` sets `proposed`, `confirmed`, or `rejected`, or `retired`.
- **`PlaceLinksEditor.vue`** is the Related tab in edit mode. Proposed links come first, with **Confirm** and **Reject**. A confirmed link has Reject and Retire, and a rejected one Confirm and Retire. The line under a card gives the origin and the share of this place inside the other. Proposed links are not drawn.
- **The list filter pattern** is task 03b's. `boundary_review_place_ids(p_view)` is a private, `security definer` helper that returns nothing to a non-admin. The six list reads take `p_boundary_review`. `PlacesFilterDialog.vue` has the Boundary review group, `PlacesStore.boundaryReview` holds it, and a card click opens the Status tab.
- **Hide from map** is `set_place_publication` with a free-text reason of at most 80 characters. A hidden place is not counted in Stats, because `stats_eligible_boundaries` keeps published places only. **Leave out of Stats** is `review_boundary(id, 'leave_out', note)`, and **Back to review** is its `undo`.

## Decided

With the user, 28 November 2026:

- **The pairs come from a laptop script**, loaded as derived, proposed `overlaps` links. Record 11 changes: a proposed candidate is stored, as the `recognises` links already are. Only conservation areas are paired with each other.
- **The share is chosen from the counts.** The script prints how many pairs reach 25%, 50%, 75%, and 90% of the smaller place. The user picks the share, and only pairs at or above it are loaded.
- **The queue is a filter on the places list**, as in task 03b. A card opens the place on Related, in edit mode.
- **Three decisions on a proposed link**, through `review_overlap`:
  - **Keep link**: the link becomes `confirmed`.
  - **Not related**: the link becomes `rejected`, so it is not suggested again.
  - **Same place, hide it**, only for an `overlaps` link between two conservation areas. The link becomes `confirmed`, and the place on the card is hidden from the map with the reason "Same place as <name>" (cut to 80 characters). Its current boundary is left out of Stats, with the same text as the note. To hide the other one, the admin opens it and decides from its side.
  - **Back to review** on a reviewed derived link puts it back to `proposed`. After Same place, it also shows the hidden place on the map again and puts its boundary back to review.

## Do this

1. **Migration `20261210100000_overlap_review.sql`.**
   - `review_overlap(p_link_id uuid, p_decision text, p_hide_place_id uuid default null)`, admin only, for an active link.
     - `keep`: `confirmed`. `not_related`: `rejected`. Both refuse a link that is not `proposed`.
     - `same_place`: refuses unless the link is a proposed `overlaps` link and both places are conservation areas. `p_hide_place_id` must be one end of the link. It confirms the link, withdraws that place with the reason, and sets its current boundary to `excluded` with the reason as the note. The writes match `set_place_publication` and `review_boundary`, so the audit trigger records them.
     - `undo`: refuses a link that is not derived or is `proposed`. It sets `proposed`. When the link's other end was withdrawn with the Same place reason that names this link's place, it restores that place and sets its boundary back to `pending`, as `review_boundary`'s `undo` does.
     - It sets `reviewed_by`, and returns the link's status.
   - **The list filter.** A private, `security definer` helper, `overlap_review_place_ids(p_view text)`, returns both ends of the active, proposed links of one kind, and none to a non-admin:
     - `recognises`: proposed `recognises` links;
     - `overlaps`: proposed `overlaps` links.

     The six list reads take `p_overlap_review text default null` and keep `place_id = any (helper(...))` when it is set, as `p_boundary_review` does.
   - `overlap_review_notes(p_place_ids uuid[])`, admin only. For each place, it returns the number of proposed links, and the other place's name and the share of this place inside it for the largest of them. The cards use it.
   - Update `set_place_relationship`'s comment only if `review_overlap` changes what it says.
2. **`supabase/derive_overlaps.py`**, using the shapes and helpers of `derive_recognises.py`, as that script uses `import_wdpa.py`.
   - `compute`: every pair of published conservation areas whose shapes meet, once, with the smaller id as subject. It keeps pairs at 1% of either place or more, writes `derive_overlaps_links.tsv`, resumes where it stopped, and prints the counts at 25%, 50%, 75%, and 90% of the smaller place, and its peak memory. Read-only on the database.
   - `load SHARE`: inserts the pairs whose larger share is at or above SHARE as derived, proposed `overlaps` rows, in one transaction. It skips a stale boundary and a pair with an active row, as `derive_recognises.py load` does.
3. **Frontend.**
   - **`src/places/overlapReview.ts`**: `reviewOverlap(linkId, decision, hidePlaceId)` and `loadOverlapNotes(placeIds)`.
   - **`PlaceLinksEditor.vue`.**
     - A proposed link has **Keep link** and **Not related**. A proposed `overlaps` link between two conservation areas also has **Same place, hide it**.
     - A reviewed derived link also has **Back to review**. The other buttons stay as they are.
     - The line under a derived card gives both shares: "40% of this place inside · 92% of it inside this place".
   - **`PlacesFilterDialog.vue`**: a **Link review** group for admins in edit mode, with **Recognitions** and **Overlaps**. None chosen means no filter. `PlacesStore.overlapReview` holds the choice, and `src/places/api.ts` passes it to the list reads. Choosing it clears Boundary review, and the other way round, so only one review filter is on at a time.
   - **Cards.** In the filtered list, each card's note reads "3 proposed links · 62% inside <name>", from `loadOverlapNotes`. A click opens the place on Related in edit mode.
4. **Tests.**
   - **pytest.**
     - Each decision and `undo`, including `undo` after Same place.
     - Refusals: a non-admin, a retired link, Same place on a `recognises` link or on a non-conservation area, and a hide id that is not one end.
     - The two filter views. A visitor's list read still works and is not filtered.
     - The notes RPC.
     - `derive_overlaps.py`: each pair once, the 1% floor, and `load` with a share, a stale boundary, and an existing row.
   - **vitest.** The buttons and the shares line in `PlaceLinksEditor.spec.ts`, the group in `PlacesFilterDialog.spec.ts`, and the card notes and click in `PlacesBarComponent.spec.ts`.
   - Run the catalog suite, the full vitest suite, `npm run type-check`, and `npm run lint`.
5. **Browser check** against the local stack, wide and narrow. The local database holds the 846 ecoregions only, so copy a few overlapping conservation areas and one recognition from hosted, read-only, with a proposed link of each kind. Afterwards, remove the copied rows.
   - Filter to Recognitions, then to Overlaps, and open a place from a card.
   - Choose Keep link, then Back to review. Choose Not related.
   - Choose Same place, hide it, read the hidden place's Stats line, then Back to review.
   - Check that Sort, Filter, In view, and the type buttons stay visible and work.
6. **Hosted.**
   - Run `supabase db push --linked --dry-run`, then push only after the user approves.
   - Run `import_wdpa.py build`, then `derive_overlaps.py compute` on this laptop. Report the counts, the time, and the peak memory. The user picks the share.
   - Run `derive_overlaps.py load SHARE` only after the user approves. Record the counts in this file.
7. **Docs.**
   - `docs/user/using-the-map.md`: the Link review filter, the decisions, and the shares line.
   - `docs/database/design.md` §4.5: `review_overlap`, the helper, the notes RPC, and `derive_overlaps.py` with the share chosen. §6: the RPC list.
   - [Record 11](../database/decisions.md#11-relationships-are-semantic-spatial-overlap-is-computed-and-nothing-adds-up): a proposed candidate may be stored, computed on a laptop. The database still does not compute all pairs.
   - `docs/blueprint.md`: the Link review filter, in the sentence on the photo filter.
   - This parcel: the open question on candidate pairs is settled.

## Do not

- Do not call `place_overlaps` from the app, or compute all pairs on hosted.
- Do not pair recognitions with each other, or ecoregions with anything. The proposed `located_in` links are not in the queue.
- Do not change `derive_recognises.py`'s output, `set_place_publication`, `review_boundary`, or `stats_eligible_boundaries`.
- Do not draw proposed links on the map.
- Do not add bulk decisions. Each decision is one link.
- Do not review links on hosted. The admin does that in the app.
- Do not push the migration, or load the pairs, before the user approves.

## Done when

- The migration is applied to the local and hosted databases.
- The conservation-area pairs are loaded on hosted at the chosen share, and the counts are recorded here.
- In edit mode, an admin filters the places list to Recognitions or Overlaps, with Sort, In view, the types, and Filter working on it.
- On Related, an admin keeps a link, marks it not related, or hides a duplicate, in one click, and can undo it.
- The tests and the browser check pass.
- The docs are updated.
- The task is archived on this branch.

## How to work

- The map lags the database. Hiding a place takes it off the map at once through `withdrawn_place_ids()`, until the places archive is rebuilt without it (task 05).
- If the counts show far more pairs than an admin can review at any share, stop and ask before loading.
