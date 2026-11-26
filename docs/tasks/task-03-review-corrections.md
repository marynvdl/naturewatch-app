# Task 03 — Review queue, map outlines, and photos

Parcel: [Corrections](../parcels/corrections.md).

Repository: naturewatch-app. Start from `develop`. Task 02 merged in #467.

## Goal

An admin in edit mode opens a Corrections list from the Account menu. It shows the submitted, approved, or rejected corrections, and each one can be approved, rejected, or set back to submitted. Submitted and approved corrections are outlined on the map. Photos can be added in the Flag form and added or removed later from the list.

## Facts already stored

From the code on 26 November 2026:

- **Table and RPCs.** `layer_corrections` (`20261204100000_corrections.sql`) has `photo_paths text[]`, `review_status`, `reviewed_at`, and `review_note` (at most 500 characters). Only admins can select it, and nobody but `service_role` can update it directly. `review_correction(id, status, note)` sets the status and returns the row.
- **Bucket.** `correction-photos` is private, accepts JPEG, PNG, or WebP up to 10 MB, and only admins can read, upload, update, or delete in it.
- **Admin lists.** In edit mode, `AccountButton.vue` shows buttons for the lists in `lists` (Needs attention, Withdrawn). They set `PlacesStore.adminList`, which makes `MapComponent.vue` open the Places panel. `PlacesBarComponent.vue` then shows `AdminPlaceList.vue`. `admin_place_list(kind, limit, offset)` returns one page of rows plus the total.
- **Uploads.** `uploadPlaceImage` in `src/places/images.ts` checks the type and size with `uploadProblem`, then names the object by its SHA-256. `PlacePhotosEditor.vue` holds the upload controls.
- **Map.** `MapComponent.vue` adds its sources and layers again on `style.load`, after a basemap change.
- **Flag form.** `CorrectionForm.vue` saves through `submit_correction` and emits `saved` with the id. `MeasureComponent.vue` shows "Correction saved for review".

## Decided

With the user, 26 November 2026:

- **The queue is a third admin list.** In edit mode, a "Corrections" button sits in the Account menu beside Needs attention and Withdrawn. The list opens in the Places panel, as those two do.
- **The list has three views.** A segmented control switches between Submitted, Approved, and Rejected, and Submitted is the default. A reviewed correction can be set back to submitted.
- **Outlines.** For an admin in edit mode, approved corrections have a solid outline and submitted ones a dashed outline. Rejected corrections are not drawn, except the one chosen in the list. Visitors see nothing, because only admins can read the table.
- **Photos in both places.** The Flag form takes photos before Save. In the list, a chosen correction shows its photos, and an admin can add or remove them.
- **Photo paths** are `<correction id>/<sha256>.<ext>`. Form photos are uploaded after `submit_correction` returns the id. If an upload fails, the correction is still saved, and the notice says how many photos were not added. A correction holds at most 6 photos.
- **Photos are shown through signed URLs** valid for one hour, because the bucket is private.

## Do this

1. **Migration** `supabase/migrations/20261205100000_correction_queue.sql`:
   - `admin_correction_list(p_statuses text[], p_limit int, p_offset int)`: newest first. For each row it returns `id`, `layer_id`, `layer_version`, `years`, `action`, `value`, `note`, `photo_paths`, `review_status`, `review_note`, `created_at`, `reviewed_at`, the geometry as GeoJSON, and `total`. Admin only. The map calls it with `submitted` and `approved`, and the list calls it with one status.
   - `set_correction_photos(p_id uuid, p_paths text[])`: replaces `photo_paths`. It refuses more than 6 paths, and any path that is not under `<id>/`. Admin only.
   - Both RPCs are `security definer` with `set search_path = ''`, and execute is granted to `authenticated` only.
   - Extend `supabase/tests/test_corrections_local.py`: the list's filters and total, refusal for a non-admin, the photo limit, and the path prefix.
   - **Hosted.** Run `supabase db push --linked --dry-run`, then push only after the user approves.
2. **`src/corrections/api.ts`:** `loadCorrections(statuses, limit, offset)`, `reviewCorrection(id, status, note)`, `setCorrectionPhotos(id, paths)`, `uploadCorrectionPhoto(id, file)` (reusing `uploadProblem` and the SHA-256 naming), `removeCorrectionPhoto`, and `photoUrls(paths)` (signed URLs).
3. **`src/store/CorrectionsStore.ts`:** `chosenId`, and a `version` that goes up after a save, a review, or a photo change. The list and the outlines reload when it changes.
4. **`CorrectionPhotosField.vue`:** thumbnails, an "Add photos" file input, and Remove. Both the Flag form (files waiting to be uploaded) and the list (stored photos) use it.
5. **`CorrectionForm.vue`:** add a Photos field below Reason. On Save, submit, then upload, then `set_correction_photos`. `MeasureComponent.vue` shows "Correction saved for review", or "Correction saved for review. 1 photo was not added." when an upload fails.
6. **`AdminCorrectionList.vue`** in the Places panel:
   - The status switch, then a count, a list, and Show more, as in `AdminPlaceList`.
   - Each entry shows the layer title, the action label and value, the years (as a range when they run on), the reason, and the date.
   - Choosing an entry flies the map to its polygon, sets `chosenId`, and opens its detail: photos, a review note (at most 500 characters), and Approve and Reject buttons. A reviewed entry has a Back to submitted button instead.
   - `AccountButton.vue` gets the "Corrections" list button, and `PlacesStore.adminList` accepts `corrections`.
7. **Outlines** in `MapComponent.vue` (or a small `src/corrections/outlines.ts` it calls): a GeoJSON source and line layers, approved solid and submitted dashed, with the chosen correction drawn thicker. They are added again on `style.load`, removed when edit mode is left, and reloaded when `version` changes. They are not clickable.
8. **Tests:**
   - `AdminCorrectionList.spec.ts`: switching status, entry text, review calls, and reload on `version`.
   - `CorrectionPhotosField.spec.ts`, and Photos in `CorrectionForm.spec.ts` (upload after submit, and the notice when one upload fails).
   - `AccountButton.spec.ts`: the new button.
   - Run the catalog suite, the full vitest suite, `npm run type-check`, and `npm run lint`.
9. **Browser check** against the local Supabase, wide and narrow:
   - Flag a correction with a photo.
   - Open Corrections and see the dashed outline.
   - Approve the correction and see the solid outline.
   - Set it back to submitted, then reject it.
   - Delete the test rows and objects afterwards.
10. **Docs:**
    - `docs/user/using-the-map.md`: the Corrections list, outlines, and photos.
    - `docs/database/design.md` §4.7 and the §6 RPC list.
    - The parcel: tick task 03, and add clickable outlines to Deferred.

## Do not

- Do not apply corrections to layers, tiles, or stats. That is the Stats Ledger.
- Do not make outlines clickable, or show corrections to visitors.
- Do not edit a correction's polygon, layer, action, value, or years after it is saved.
- Do not push the migration to hosted before the user approves.
