# Task 02 — Curated text

Parcel: [Molding Places](../parcels/molding-places.md)

Repository: naturewatch-app. Task 01 is merged and archived.

## Goal

An admin in edit mode corrects a place's display name, designation, and countries, and writes its tagline and description, in the place profile. Each field shows its source value beside it and can be reset to it. Visitors see the curated values everywhere the app reads `place_summaries` and `listed_places`: the profile, the list, the places page, and search. Search still finds a place by its source name. In view mode the tagline shows under the title, and the description shows at the top of Overview.

Decided 13 November 2026 by the user:

- **One field at a time.** Each field shows its value with a pencil. The pencil opens that field only, with **Save**, **Cancel**, the source value, and **Reset to source**. One save is one `curate_place` call and one `audit_log` row.
- **Designation suggestions.** The designation field suggests the designations places already show, as countries are suggested, and still accepts new text (added 13 November 2026 by the user, during evaluation).
- **Plain text, capped.** The tagline is one line of at most 120 characters. The description is plain text of at most 2,000 characters, with paragraphs split by blank lines. A CHECK constraint and the form both enforce this.

## Facts already stored

From the code and the repository on 13 November 2026:

- `place_curations` is specified in [design.md §4.6](../database/design.md#46-people-images-audit), and the override rule is [record 22](../database/decisions.md#22-curated-values-are-overrides-not-edits-to-source-columns). Admin writes go through `security definer` RPCs that check `has_role('admin')` ([design.md §6](../database/design.md#6-access-and-row-level-security)).
- Task 01 added `profiles`, `user_roles`, `has_role()`, `audit_log`, and the trigger function `audit_row()` in `20261121100000_people_and_audit.sql`. That is the latest migration.
- `place_summaries` was last replaced in `20261120100000_recognitions.sql`. It takes `name` from `places`, and `designation` and `iso3` from `conservation_area_details` or `recognition_details`. `iso3` is joined into one text with `;`. `source_name` is already the source's title. `listed_places` is `select *` from `place_summaries`.
- Search matches `name` in three places: `place_matched` on `listed_places` and on `places_in_extent` (`20261116100000_generic_place_reads.sql`), and `loadPlaceSearchWindow` in `src/places/api.ts`, which reads `listed_places` with `.ilike('name', …)`.
- `PlaceProfileComponent.vue` reads `place_summaries` through `loadPilotPlace` (`PLACE_COLUMNS` in `api.ts`). It shows the Edit/View toggle to admins, and `editMode` is in `AuthStore`. Overview lists designation, countries, and area. Country names come from `COUNTRY_NAMES` in `src/places/countryNames`.
- The map's PMTiles carry the source name. A map click opens the profile with that name until the stored record loads.

## Do this

1. **Migration `20261122100000_place_curations.sql`.**
   - `place_curations` as in design.md §4.6, with `updated_at timestamptz` too. CHECKs: `tagline` is at most 120 characters with no line break; `description` at most 2,000 characters; `display_name` and `designation` not blank; each `iso3` element matches `^[A-Z]{3}$`, and the array is not empty.
   - `curate_place(p_place_id uuid, p_values jsonb)`: `security definer`, `set search_path = ''`, raises unless `has_role('admin')`. The keys of `p_values` are the fields to change: `display_name`, `tagline`, `description`, `designation`, `iso3`. Any other key raises. Text is trimmed, and a blank or null value resets that field to the source. It sets `updated_by` and `updated_at`, and deletes the row once every value is null. It returns the row, or null. Execute granted to `authenticated` only.
   - The `audit_row()` trigger on `place_curations`, keyed by `place_id`.
   - `place_designations()`: each designation published places show, curated over source, with its place count, most used first. Execute granted to `authenticated` only.
   - RLS: `anon` and `authenticated` select rows of published places. No table writes from the browser.
   - `place_summaries` replaced: `name`, `designation`, and `iso3` take the curated value when set. New columns at the end: `tagline`, `description`, `source_place_name`, `source_designation`, `source_iso3`. `listed_places` is recreated so it picks them up.
   - `place_matched` matches the curated or the source name. Change `places_in_extent` to return what that needs.
2. **Database tests, `supabase/tests/test_curations_local.py`.** On the local stack, as in `test_people_local.py`: a non-admin and `anon` cannot call `curate_place`; an admin sets each field and `place_summaries` shows it with the source columns unchanged; a blank value resets; the last reset deletes the row; an unknown key and a too-long tagline raise; each call writes one `audit_log` row with the actor; `place_window` finds a renamed place by its old and new name.
3. **Client.** In `api.ts`: read the new columns in `PLACE_COLUMNS` and `PlaceDetail`, search the source name too in `loadPlaceSearchWindow`, and add `curatePlace(id, values)`.
4. **Profile, view mode.** The tagline under the title. The description at the top of Overview, one paragraph per blank-line block, as text.
5. **Profile, edit mode.** Display name, tagline, description, designation, and countries, each with a pencil, as decided above. The source value shows beside a curated one, with **Reset to source**. Countries are chips with a remove button, and an add field that suggests names from `COUNTRY_NAMES`. The designation field suggests from `place_designations()`, read once when it first opens. Both are built on reka-ui in the Landscape and Measure panel style. A failed save keeps the field open with the error. After a save, the profile shows the returned values. Every existing control keeps its place.
6. **Tests.** Extend `PlaceProfileComponent.spec.ts`: the tagline and description in view mode; no pencils for a visitor or in view mode; saving, cancelling, and resetting a field call `curatePlace` with the right values. Run pytest for `supabase/tests`, the catalog suite, the component tests, `npm run type-check`, and `npm run lint`.
7. **Browser check.** Run the `browser-check` skill on a place profile, wide and narrow, in view mode with a tagline and description on the local stack.
8. **User evaluation.** Start the dev server on `http://localhost:5173` against the local stack and give the URL to the user, who signs in through Inbucket, edits a place, and evaluates before the pull request is opened.
9. **Docs.**
   - `docs/user/using-the-map.md`: editing a place in edit mode.
   - `docs/user/data.md`: a curated name, designation, or countries can differ from the WDPCA record, and the tagline and description are written by Sooty Earth.
   - design.md §4.6: mark `place_curations` as in place, naming the migration and `curate_place`. §6: add `curate_place` to the privileged RPCs.
   - `docs/blueprint.md`: `place_summaries` shows curated values, and search matches both names.
10. **Hosted steps, after approval.** Open the pull request first. Then, after approval: `supabase migration list` and `supabase db push`. Check read-only that `place_curations` is empty, that `anon` cannot call `curate_place`, and that `place_summaries` returns the same row count as before. After the merge deploys `naturewatch`, the user edits a place there and sees it in view mode and in `audit_log`. Record the date applied in the pull request.

## Do not

- Do not change `places.name`, the details tables, or any source column.
- Do not rebuild the PMTiles or change the analysis repo. The map tiles keep the source name.
- Do not add relationships, photographs, the `/admin` route, or tagline suggestions. Those are tasks 03 to 06.
- Do not add Markdown or HTML to the description.
- Do not flag stale curated values. That is deferred in the parcel.
- Do not call the FastAPI backend.
- Do not apply the migration before approval.
- Do not start task 03.

## Done when

- The migration is applied to the hosted database.
- The user can edit each of the five fields on the `naturewatch` Fly app, reset one, and see the result in view mode, in the list, and in `audit_log`.
- Searching the old name of a renamed place still finds it.
- The tests, type check, lint, and browser check pass, with no console errors.
- using-the-map.md, data.md, design.md, blueprint.md, and the parcel match the result.
- One pull request into `develop`, merged after its checks pass and the user approves.

## How to work

Branch from `develop`. Do this task only. Do not commit secrets. Do not add an AI or tool attribution to a commit or a pull request.
