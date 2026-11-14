# Task 03 — Relationships

Parcel: [Molding Places](../../parcels/molding-places.md)

Repository: naturewatch-app. Task 02 is merged and archived.

## Goal

An admin in edit mode sees all of a place's links on a **Links** tab, including `proposed`, `rejected`, and retired ones. The admin adds a link by choosing a type and finding a place by search, and confirms, rejects, or retires a link. Each change is one `set_place_relationship` call and one `audit_log` row. Every place has a **Related** tab that lists the places it has a confirmed link with, as cards grouped by relationship. Every place card shows its type as a coloured label.

Decided 14 November 2026 by the user:

- **All four types.** The add form offers `recognises`, `overlaps`, `located_in`, and `part_of`, each read from this place's side: Recognises, Recognised by, Overlaps, Located in, Contains, Part of, Has part. The choice sets which place is the subject.
- **A Links tab in edit mode only.** **Add +** at its top right opens the add form in a popover (changed 14 November 2026 by the user, during evaluation). Under it, the links are grouped as Proposed, Confirmed, Rejected, and Retired, 20 at a time with **Show more**.

Changed 14 November 2026 by the user, during evaluation, so that every place type works the same way:

- **A Related tab for every place.** It replaces a recognition's Areas tab and the Related places list in Overview. It sits after Overview, and lists every confirmed link as place cards, grouped by relationship from this place's side, in the order Recognised by, Recognises, Located in, Contains, Part of, Has part, Overlaps. Each group is largest first, 20 at a time with **Show more**. While it is open, the map draws the conservation areas it lists, as the Areas tab did. A park's recognition badges under its title stay.
- **A coloured type label on every place card.** The shared `PlaceCard` shows the place type as a pill in the map's colour for it: Conservation area green, World Heritage ochre, Ramsar blue, UNESCO-MAB purple, and Natura 2000, Emerald, and Regional grey. It replaces the type before the country on search cards. This applies to the Places list, search, and the Related tab.

## Facts already stored

From the code and the hosted database on 14 November 2026:

- `place_relationship_types`, `place_relationships`, and `place_overlaps()` are in `20261120100000_recognitions.sql`, specified in [design.md §4.5](../../database/design.md#45-relationships). Rows are unique per (subject, type, object) while not retired. A trigger stores a symmetric link with the smaller id as its subject, and refuses the reverse of an active asymmetric link. `created_by` and `reviewed_by` are not columns yet.
- The public select policy returns only confirmed, unretired links between published places.
- The hosted table holds 14,765 rows. All are derived `recognises` links: 8,015 confirmed and 6,750 proposed. None are manual, rejected, or retired. Most places have at most 10 links. One recognition has 1,024.
- Published places are 39,457 conservation areas and 11,480 recognitions. Countries are not places, so `located_in` and `part_of` have few targets for now.
- `supabase/derive_recognises.py` inserts derived proposed rows and confirms them by `object_coverage`. `object_coverage` on a `recognises` row is the share of the park inside the recognition.
- `loadPlaceRecognitions` and `loadRecognisedPlaces` in `src/places/api.ts` read confirmed `recognises` links, then names from `place_summaries` in chunks of 150. `loadPlaceSearchWindow` searches `listed_places`, which holds conservation areas only.
- `curate_place` in `20261122100000_place_curations.sql` is the pattern for an admin RPC. `audit_row()` is from `20261121100000_people_and_audit.sql`. `20261122100000_place_curations.sql` is the latest migration.
- `PlaceSuggestInput.vue` is a reka-ui combobox over a list of strings. `PlaceEditField.vue` is the one-field editor from task 02.

## Do this

1. **Migration `20261123100000_relationship_review.sql`.**
   - Add `created_by` and `reviewed_by` to `place_relationships`, `uuid` FK → `profiles`, null.
   - `set_place_relationship(p_subject_place_id uuid, p_relationship_type_id text, p_object_place_id uuid, p_status text)`: `security definer`, `set search_path = ''`, raises unless `has_role('admin')`. `p_status` is `proposed`, `confirmed`, `rejected`, or `retired`. For a symmetric type it orders the two ids. If an active row exists for the triple, it sets the status, or sets `retired_at` for `retired`, and sets `reviewed_by`. Otherwise, for `confirmed` or `proposed`, it inserts a `manual` row with `created_by` and `reviewed_by`. Rejecting or retiring a link that does not exist raises. An unknown type or status, a missing place, or the same place twice raises. The direction trigger's error reaches the caller. It returns the row. Execute granted to `authenticated` only.
   - The `audit_row()` trigger on `place_relationships`, keyed by `id`. It also records the rows `derive_recognises.py` writes, with a null actor.
   - An admin select policy on `place_relationships`: `(select public.has_role('admin'))`, so edit mode reads proposed, rejected, and retired rows.
2. **Database tests, `supabase/tests/test_relationships_local.py`.** On the local stack, as in `test_curations_local.py`: a non-admin and `anon` cannot call the RPC or read a proposed row; an admin adds a link and it is `manual` and `confirmed` with `created_by` set; confirming, rejecting, and retiring a derived link set `reviewed_by`; an `overlaps` link given in either order is stored once; the reverse of an active `recognises` link raises; rejecting a missing link raises; retiring and adding again gives a new row; each call writes one `audit_log` row with the actor.
3. **Client, `api.ts`.**
   - `loadPlaceLinks(id)`: every link with the place as subject or object, read in pages of 1,000, with the other place's name and type from `place_summaries` in chunks. A place missing from `place_summaries` shows as an unpublished place.
   - `searchPlaces(text)`: up to 8 published places of any type from `place_summaries` whose name or source name contains the text. Check its time on the hosted database read-only. If it is over one second, stop and ask.
   - `setPlaceRelationship(subject, type, object, status)`.
   - `loadRelatedPlaces(id)`: every confirmed link with the other place's card values, for the Related tab. It replaces `loadRecognisedPlaces`.
4. **Profile, edit mode: the Links tab.**
   - The add form: a type select with the labels above, a place search built on a reka-ui combobox, and **Add**. A new link is `confirmed`. A failed save keeps the form open with the error.
   - Each link shows the label from this place's side, the other place's name and type, the origin, and the coverage for a derived link. Proposed links have **Confirm** and **Reject**. Confirmed links have **Reject** and **Retire**. Rejected links have **Confirm** and **Retire**. Retired links have no actions.
   - After a change, the list, the recognition badges, and the Related tab refresh.
   - The Landscape and Measure panel style. Every existing control keeps its place.
5. **Profile, view mode.** The Related tab as decided above, for every place type, in place of Areas. An empty tab says the place has no related places yet. `PlaceCard` takes the place type and shows the coloured label, in the Places list and search too.
6. **Tests.** Extend `PlaceProfileComponent.spec.ts`: no Links tab for a visitor or in view mode; links grouped by status with the right actions; adding, confirming, rejecting, and retiring call `setPlaceRelationship` with the right subject and object for each label; the Related tab groups cards by relationship, opens a card's place, and tells the map which conservation areas it lists; a card shows its type label. Run pytest for `supabase/tests`, the catalog suite, the component tests, `npm run type-check`, and `npm run lint`.
7. **Browser check.** Run the `browser-check` skill on the Related tab of a park and of a recognition, and on the Places list, wide and narrow, on the local stack.
8. **User evaluation.** Start the dev server on `http://localhost:5173` against the local stack and give the URL to the user, who signs in through Inbucket, adds and reviews links, and evaluates before the pull request is opened.
9. **Docs.**
   - `docs/user/using-the-map.md`: the Links tab in edit mode, the Related tab in place of Areas, and the type label on cards.
   - `docs/user/data.md`: a link can be derived or added by Sooty Earth, and only confirmed links show.
   - design.md §4.5: `created_by` and `reviewed_by` in place, naming the migration and `set_place_relationship`. §6: add `set_place_relationship` to the privileged RPCs.
   - `docs/blueprint.md`: a profile reads its confirmed links of every type.
10. **Hosted steps, after approval.** Open the pull request first. Then, after approval: `supabase migration list` and `supabase db push`. Check read-only that the row count of `place_relationships` is unchanged, that `anon` cannot call `set_place_relationship` or read a proposed row, and that `audit_log` has no rows for `place_relationships` yet. After the merge deploys `naturewatch`, the user adds and reviews a link there and sees it in view mode and in `audit_log`. Record the date applied in the pull request.

## Do not

- Do not delete a relationship row. Retiring keeps it.
- Do not change `place_overlaps()`, `derive_recognises.py`, or the coverage values. Overlap review and `place_overlaps()` fixes are in [Shaping Boundaries](../../parcels/shaping-boundaries.md).
- Do not suggest links from `place_overlaps()` in the profile.
- Do not add countries as places.
- Do not rebuild the PMTiles or change the analysis repo.
- Do not add photographs, the `/admin` route, or tagline suggestions. Those are tasks 04 to 06.
- Do not call the FastAPI backend.
- Do not apply the migration before approval.
- Do not start task 04.

## Done when

- The migration is applied to the hosted database.
- The user can add a link on the `naturewatch` Fly app, and confirm, reject, and retire links, and see the result in view mode and in `audit_log`.
- The tests, type check, lint, and browser check pass, with no console errors.
- using-the-map.md, data.md, design.md, blueprint.md, and the parcel match the result.
- One pull request into `develop`, merged after its checks pass and the user approves.

## How to work

Branch from `develop`. Do this task only. Do not commit secrets. Do not add an AI or tool attribution to a commit or a pull request.
