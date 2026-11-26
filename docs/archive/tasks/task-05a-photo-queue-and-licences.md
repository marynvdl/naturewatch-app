# Task 05a — Photo queue and licences

Parcel: [Wayfinding](../../parcels/wayfinding.md).

Repository: naturewatch-app. Start from `develop`. Task 04 merged in #461.

## Goal

An admin works through photo suggestions in the places list, with the same search, sort, types, In view, and Filter as any list. The separate photo queue goes. Rejected photographs are no longer shown. Rejected links older than 30 days are purged into `photo_refusals`, so a rerun still does not suggest them again. A Commons photograph under any CC BY or CC BY-SA version from 1.0 to 4.0, ported or not, can be added.

Decided 26 November 2026 by the user:

- **The filter is in the Filter window**, as a switch named "Has photo suggestions". It shows for admins in Edit mode only. With no place type on, it lists places of every type, as the queue does today.
- **The purge runs before each load.** `purge_rejected_photos()` runs at the start of `suggest_photos.py load`, in the same transaction, and can also be run by hand. There is no pg_cron.
- **Every CC port gets a row.** The upload licence picker lists only the generic versions.

Applied to the hosted database on 26 November 2026, after the user approved it. It added 194 licence rows (202 CC BY and BY-SA rows in all) and dropped `photo_queue`. The first `purge_rejected_photos()` deleted nothing, as no rejected link was 30 days old. `place_kept_ids` with the photo filter keeps 743 World Heritage Sites and ecoregions. The checked switch is charcoal, as the `--on` colour read as off on the white Filter window.

## Facts already stored

From the code and the hosted database on 26 November 2026:

- **Hosted counts.** 2,015 `suggested` links on 743 places, 547 `approved` on 291, and 286 `rejected` on 178. No rejected link is older than 30 days yet. No image is an upload (`storage_path` is null on every row). `place_images.image_id` is the only foreign key to `images`.
- **Licences in use.** `cc-by-sa-4.0` 858, `cc-by-sa-3.0` 527, `public-domain` 301, `cc-by-2.0` 278, `cc0-1.0` 247, `cc-by-4.0` 189, `cc-by-sa-2.0` 162, `cc-by-3.0` 146, `cc-by-sa-2.5` 24, `cc-by-2.5` 12.
- **The queue.**
  - `photo_queue(limit, offset)` was added in `20261125100000_photo_queue.sql` and replaced in `20261126100000_place_cleanup.sql`.
  - `PhotoQueueList.vue` reads it through `loadPhotoQueue` in `src/places/images.ts`. It is opened by **Photo queue** in `AccountButton.vue`, through `PlacesStore.adminList === 'photos'`.
  - The store keeps `photoQueueIds`, `photoQueueIndex`, `photoQueueVersion`, `nextInPhotoQueue`, and `openFromPhotoQueue`. `MapComponent.vue` passes `has-next` to the profile for **Next place** on the Photos tab.
  - `usePlaceBoundaries.ts` draws only the chosen place while the queue is open (`queueOnly`).
- **The list read.**
  - `place_matched` (`20261128100000_ecoregion_filter.sql`) feeds `place_window`, `place_window_count`, `place_rank`, and `place_kept_ids`. It is `security invoker`.
  - `place_images` row security shows admins every link and everyone else only approved ones.
  - With no type on, `loadPlaceSearchWindow` reads `listed_places` directly and ignores In view.
- **Rejected photos.**
  - `PlacePhotosEditor.vue` groups photographs as Approved, Suggested, and Rejected (`GROUPS`). A rejected one has **Approve**.
  - `suggest_photos.py load` skips a place that already has a link to the file in any status, which is what keeps a rejected file from coming back.
- **Licences.**
  - `IMAGE_LICENCES` in `src/places/commons.ts` lists 10 ids. `commonsLicenceId` accepts a Commons `License` code only if it is in that list. `licenceShortName` reads `cc-(by|by-sa)-N.N`.
  - `loadImageLicences` in `images.ts` reads the rows in `IMAGE_LICENCES` for the upload picker.
  - `suggest_photos.py` accepts any id in the `licences` table, so new rows widen it with no code change.

## Do this

1. **Migration.**
   - **The filter.** Drop and recreate `place_matched`, `place_window`, `place_window_count`, `place_rank`, and `place_kept_ids` with `p_photo_suggestions boolean default false`. When it is true, a place is kept only if it has a `suggested` link. Row security already limits this to admins.
   - **The queue.** Drop `photo_queue`.
   - **`photo_refusals`.** `place_id` uuid → `places` `on delete cascade`, `commons_title` text, `refused_at` timestamptz, with PK `(place_id, commons_title)`. Admins read it. Only the purge and `service_role` write it.
   - **The purge.** `purge_rejected_photos()` is admin or `service_role` only. It finds `rejected` links with `reviewed_at` more than 30 days ago and writes a `photo_refusals` row for each Commons file. It then deletes the links, and deletes each `images` row that no link uses any more. It returns the number of links and images it deleted.
   - **Licences.** Add rows for every CC BY and BY-SA version from 1.0 to 4.0 that is missing: 1.0, and every jurisdiction port CC published. 2.1 was only published as ports. Use ids such as `cc-by-sa-3.0-de`, titles such as "Creative Commons Attribution-ShareAlike 3.0 Germany", and the URLs on creativecommons.org.
   - Add a local test beside `test_place_images_local.py` for the filter, the purge (links, refusals, shared images kept), and the licence rows.
2. **Script, `supabase/suggest_photos.py`.** `load` calls `purge_rejected_photos()` first, and skips files in `photo_refusals` for that place. `counts` reports the refusals it would skip. Update `test_suggest_photos.py`.
3. **Licences, `src/places/commons.ts`.**
   - `IMAGE_LICENCES` lists every generic version: CC0, public domain, and BY and BY-SA 1.0, 2.0, 2.5, 3.0, and 4.0.
   - `commonsLicenceId` also accepts a port that matches `cc-by(-sa)?-N.N-xx`, and the database still checks that the row exists.
   - `licenceShortName` gives `CC BY-SA 3.0 DE` for a port.
   - The upload picker keeps reading only `IMAGE_LICENCES`.
4. **The filter, frontend.**
   - In the Filter window, admins in Edit mode see a switch, "Has photo suggestions". It is part of the list query and of `placesStore.filtering`. Leaving Edit mode turns it off.
   - With the switch on and no type on, the list reads `place_window` with every type that has a button, so In view and the other filters apply.
   - With the switch on, each card has a tag with the number of suggested photographs, read from `place_images` for the listed ids. A click opens the place on its Photos tab.
   - **Next place** stays on the Photos tab and opens the next card of the list. Reviewing a photograph refreshes the counts. A place whose last suggestion is reviewed leaves the list and stays open.
5. **Remove the queue.** Remove `PhotoQueueList.vue` and its spec, `loadPhotoQueue`, the Photo queue entry in `AccountButton.vue`, `'photos'` from `adminList`, and `queueOnly` in `usePlaceBoundaries.ts`. The list then draws its places as any list does. Needs attention and Withdrawn stay as they are.
6. **Hide rejected photos.** `PlacePhotosEditor.vue` drops the Rejected group, and rejected links are not loaded.
7. **Tests.**
   - Update `PlacePhotos.spec.ts`, `PlacesFilterDialog.spec.ts`, `PlacesBarComponent.spec.ts`, `AccountButton.spec.ts`, `PlaceProfileComponent.spec.ts`, and `commons.spec.ts`.
   - Run the catalog suite, the component and places tests, the local pytest, `npm run type-check`, and `npm run lint`.
8. **Browser check.** Run the `browser-check` skill on `/`, wide and narrow, as an admin in Edit mode, with the filter on, with and without a type, and with In view. Open a card on its Photos tab.
9. **Hosted.** Apply the migration to the hosted database after the user approves. Report how many licence rows it added. Run `purge_rejected_photos()` once, which deletes nothing today.
10. **Docs.**
    - `docs/user/using-the-map.md`: replace the Photo queue paragraph with the filter, and drop Rejected from the Photos tab paragraph. Point "as the photo queue does" in the Needs attention paragraph at the list instead.
    - `docs/database/design.md`: `photo_refusals`, the purge, the filter argument, and that `photo_queue` was dropped.
    - `supabase/README.md`: the purge at the start of `load`, and the refusals.
    - `docs/blueprint.md` only if it names the queue.

## Do not

- Do not delete a rejected link before 30 days, or one that is not rejected.
- Do not add pg_cron or a scheduled job.
- Do not change how suggestions are found. That is task 05b.
- Do not change the Needs attention or Withdrawn lists.
- Do not apply the migration to the hosted database before the user approves.
- Do not start task 05b.

## Done when

- An admin in Edit mode filters the places list to places with photo suggestions, with search, sort, types, In view, and Filter, and sees how many are suggested on each card.
- `photo_queue` and `PhotoQueueList.vue` are gone.
- Rejected photographs are not shown.
- `purge_rejected_photos()` turns old rejected links into `photo_refusals`, and `load` honours them.
- Every CC BY and BY-SA version from 1.0 to 4.0, with its ports, has a `licences` row, and a Commons file under one can be added.
- The migration is applied to the hosted database after approval.
- The tests, type check, lint, and browser check pass with no console errors.
- `using-the-map.md`, `design.md`, and `supabase/README.md` match the result.
- One pull request into `develop`, merged after its checks pass and the user approves.

## How to work

Branch from `develop`. Do this task only. Do not commit secrets. Do not add AI or tool attribution to a commit or a pull request.
