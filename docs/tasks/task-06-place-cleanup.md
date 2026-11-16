# Task 06 — Place cleanup

Parcel: [Molding Places](../parcels/molding-places.md)

Repository: naturewatch-app. Task 05 is merged and archived.

## Goal

The last task of the parcel. In Edit mode an admin can withdraw a place from the map with a reason, and flag a place as needing attention with a reason. Both lists are reachable from the Profile panel. Visitors can show several place types on the map at once. The place profile shows each fact once, and a selected outline is thinner.

Decided 16 November 2026 by the user:

- **Tagline suggestions are on ice.** The former task 06 moves to the parcel's Deferred section. This task replaces it.
- **Withdraw, with a reason, hidden on the map at once.** Withdrawing sets the existing `publication_status` to `withdrawn`, with a reason from a preset list and an optional note. The place leaves the list and search at once. The map hides it at once too, by reading the ids of withdrawn places, so no PMTiles rebuild is needed. Facts stop for it, because the cropland pipeline reads only published places. An admin can restore it. "Which places the map draws" moves here from [Shaping Boundaries](../parcels/shaping-boundaries.md).
- **Needs attention is a flag set by hand, with a preset reason and a note.** design.md §3 changes: the flag is stored now. Derived findings, such as boundary checks, still come with Shaping Boundaries.
- **Several place types at once, in one merged list.** Each type button toggles. The map draws every chosen type. The list merges them, and each card carries its type. Cropland filter and sort show only while conservation areas are the only type chosen.
- **Each fact is shown once on the place profile**, and the same principle applies to new screens. It is written in CLAUDE.md.

Changed 16 November 2026 by the user, during evaluation:

- **Reasons are free text with suggestions**, not fixed lists. Each reason field lists the reasons in use, most used first, then the presets, and takes a new reason typed in. `place_status_reasons(kind)` reads the reasons in use. A reason is at most 80 characters.

## Facts already stored

From the code and the migrations on 16 November 2026:

- `places.publication_status` is `draft`, `published`, `withdrawn`, or `merged`. The `places_select` policy, `place_summaries`, and `listed_places` keep only `published` rows, so an admin cannot yet open a withdrawn place.
- `place_window`, `place_window_count`, `place_rank`, `place_kept_ids`, `place_filter_stats`, `place_matched`, and `places_in_extent` (`20261116100000_generic_place_reads.sql`) each take one `text` place type.
- The PMTiles recipes in naturewatch-analysis keep `publication_status: published` at build time. A withdrawn place stays in the archives until the next rebuild.
- `stats/cropland.py` in naturewatch-analysis reads `public.listed_places`, so it skips any place that is not published.
- `PlacesStore.listType` is one type, or null. `PlacesBarComponent.placeType` is one button. `usePlaceBoundaries` shows conservation areas or one recognition type.
- The selected outline is 3 px for conservation areas and 3.5 px for recognitions. The hover outline is 2.5 and 3 px (`usePlaceBoundaries.ts`).
- The profile header shows country · designation and the area under the title. Overview's facts table shows designation, countries, and area again. The header's recognition badges and the Related tab's recognition group list the same recognitions.
- The Profile panel has the Edit mode button and, in Edit mode, the Photo queue button, which opens `PhotoQueueList` in the Places panel. There is no `/admin` route since task 05.

## Do this

1. **Migration `20261126100000_place_cleanup.sql`.**
   - On `places`: `withdrawal_reason` text, CHECK in `captured_by_other_places`, `not_a_place`, `boundary_unusable`, `other`; `withdrawal_note` text, at most 500 characters; `withdrawn_by` uuid → `profiles` `on delete set null`; `withdrawn_at` timestamptz. A CHECK keeps the reason set exactly when `publication_status = 'withdrawn'`.
   - `place_attention`: `place_id` uuid PK → `places` `on delete cascade`, `reason` text CHECK in `boundary_wrong`, `details_wrong`, `possible_duplicate`, `missing_photographs`, `other`, `note` text at most 500 characters, `flagged_by` → `profiles` `on delete set null`, `created_at`, `updated_at`. A row exists only while the place is flagged. `audit_row()` is on it. Admins read it. Visitors do not.
   - `set_place_publication(p_place_id, p_status, p_reason, p_note)`: admin only, moves a place between `published` and `withdrawn` only, sets or clears the four columns. `audit_row()` records it.
   - `set_place_attention(p_place_id, p_reason, p_note)`: admin only. A null reason clears the flag.
   - `withdrawn_place_ids()`: returns the ids of withdrawn places, to `anon` and `authenticated`. Only ids are exposed.
   - `admin_place_list(p_kind, p_limit, p_offset)`: admin only, `p_kind` in `attention` or `withdrawn`. Returns each place's id, display name, type, countries, area, reason, note, and the total, ordered by name, as `photo_queue` does.
   - `places_select` and `place_summaries` also show withdrawn places to admins (`has_role('admin')`), so a withdrawn place opens in Edit mode. `listed_places` and the list functions stay published only.
   - The list functions take `text[]` place types instead of `text`. The old signatures are dropped in the same migration.
2. **Profile, Edit mode.** A **Status** tab after Photos holds two short forms in the Landscape panel style: **Withdraw from the map**, with the reason select, the note, and Withdraw or Restore; and **Needs attention**, with the reason select, the note, and Flag or Clear. A withdrawn or flagged place shows a small tag under its title in Edit mode only.
3. **Admin lists.** In Edit mode the Profile panel gets **Needs attention** and **Withdrawn** buttons beside Photo queue. Each opens a list of `PlaceCard`s in the Places panel, built from the same pieces as `PhotoQueueList`, with the reason as a tag. Choosing one opens the place on its Status tab.
4. **Map.** `usePlaceBoundaries` reads `withdrawn_place_ids()` once per page load, and again after a withdraw or restore, and leaves those ids out of every place and recognition layer, except the selected outline while an admin has that place open.
5. **Several place types.** Each type button toggles independently, and the store holds a list of types. The map draws conservation areas when chosen, and each chosen recognition type. The list, count, rank, and filter charts read every chosen type. Each card shows its type, as Related cards do. Cropland filter and cropland sort show only while conservation areas are the only type chosen. Ecoregions and Countries keep their behaviour.
6. **Profile, each fact once.**
   - The header loses country · designation and the area tag. They stay in Overview's facts table.
   - The recognition badges stay in the header. The Related tab leaves out the recognition group they already show.
7. **Selected outline.** Conservation areas 2 px selected and 1.75 px hovered. Recognitions 2.5 px selected and 2 px hovered.
8. **Tests.** Component tests for the Status tab, the two admin lists, and several type buttons at once. Unit tests for the merged tile filter and the withdrawn-id filter. pgTAP or SQL tests, as for task 05, for the two RPCs, the CHECKs, the admin-only reads, and `withdrawn_place_ids()` for `anon`. Run the catalog suite, the component tests, `supabase/tests`, `npm run type-check`, and `npm run lint`.
9. **Browser check.** The `browser-check` skill on `/`, wide and narrow: World Heritage plus Conservation areas on together, a selected outline, and in Edit mode the Status tab and both lists.
10. **User evaluation.** Dev server on `http://localhost:5173` against the local stack, before the pull request.
11. **Docs.**
    - design.md §3: "Does it need attention?" is `place_attention`, set by hand. §4.1: the withdrawal columns and `withdrawn_place_ids()`. §6: the new privileged RPCs.
    - decisions.md: a record for the stored attention flag and for hiding withdrawn places on the map before a rebuild.
    - `docs/user/using-the-map.md`: choosing several types, and the Status tab and admin lists.
    - `docs/user/data.md`: a withdrawn place is hidden and gets no new facts.
    - `docs/blueprint.md`: what the map reads to hide withdrawn places.
    - CLAUDE.md: a short "Screens" rule: each fact is shown once on a screen.
    - Shaping Boundaries: remove "Which places the map draws" from its scope, pointing here.
12. **Hosted steps, after approval.** Open the pull request first. Then `supabase migration list` and `supabase db push` after approval of the migration. Check read-only that `anon` gets `withdrawn_place_ids()` and nothing from `place_attention`.

## Do not

- Do not rebuild PMTiles or run any Batch job.
- Do not add stats eligibility, boundary checks, or overlap review. They stay in Shaping Boundaries.
- Do not delete places or change `merged` places.
- Do not remove any existing control, apart from the duplicated header lines in step 6.
- Do not add tagline suggestions.
- Do not call the FastAPI backend.

## Done when

- The migration is applied to the hosted database.
- On the `naturewatch` Fly app the user can withdraw and restore a place, flag and clear one, find both through their lists, and show World Heritage Sites with Conservation areas together.
- The tests, type check, lint, and browser check pass, with no console errors.
- The docs above match the result.
- One pull request into `develop`, merged after its checks pass and the user approves. Its last commit ticks this task and moves this file to `docs/archive/tasks/`.
