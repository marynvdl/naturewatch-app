# Task 04 — Photographs

Parcel: [Molding Places](../parcels/molding-places.md)

Repository: naturewatch-app. Task 03 is merged and archived.

## Goal

An admin in edit mode adds a photograph to a place on a **Photos** tab, by upload or by a Wikimedia Commons URL. A Commons URL fills in the creator, the licence, and the size from the Commons API. The admin approves or rejects photographs, chooses the main one, and orders the rest. The tab also lists the photographs of the recognitions that the place lies at least 75% inside, and **Use here** links one to this place too. In view mode the profile shows the approved photographs through the existing `PlacePhotos`, main one first.

Decided 14 November 2026 by the user:

- **Uploads go to Supabase Storage**, in a new public bucket `place-images`. Anyone can read an object. Only an admin can write one, through Storage policies that check `has_role('admin')`. Uploads come from the browser with the signed-in session, as the other admin writes do.
- **A Commons photograph is linked, not copied.** `images.external_url` holds the Commons file, and the browser loads it from Commons. A photograph from any other site must be uploaded. URLs from other sites are not accepted.
- **Licences:** `cc0-1.0`, `public-domain`, and `cc-by` and `cc-by-sa` in versions 2.0, 2.5, 3.0, and 4.0. No NC or ND licences.
- **A Photos tab in edit mode only**, like Links, with **Add +** at its top right opening the add form in a popover.

## Facts already stored

From the code and the hosted database on 14 November 2026:

- `images` and `place_images` are specified in [design.md §4.6](../database/design.md#46-people-images-audit) and are not in the database. [Record 14](../database/decisions.md#14-shared-images-linked-per-entity) explains why one image can link to many places.
- `licences` holds only `wdpa-terms`. `sources` holds `wdpca` and `glad-annual-cropland`. Both are in `20261111100000_sources.sql`, specified in design.md §4.3.
- The hosted project has no Storage buckets. `supabase/config.toml` has Storage enabled, with a 50 MiB file limit and no buckets.
- `PlacePhotos.vue` and `PlacePhotoGallery.vue` take `PlacePhoto[]` (`src/places/photos.ts`) and show the first as the main image. `PlaceProfileComponent` has a `photos` prop that nothing fills yet, so every profile shows "Camouflaged for now". Place cards show a placeholder photograph.
- All 8,015 confirmed `recognises` links have `object_coverage` of at least 0.75. On a `recognises` row the subject is the recognition, and `object_coverage` is the share of the park inside it.
- `set_place_relationship` in `20261123100000_relationship_review.sql` is the latest admin RPC and migration. `PlaceLinksEditor.vue` is the Links tab, with its add popover.
- The Commons API (`commons.wikimedia.org/w/api.php`, `prop=imageinfo`, `iiprop=url|size|extmetadata`) returns the file URL, the size, `Artist`, `LicenseShortName`, `LicenseUrl`, and `ImageDescription`. It accepts browser calls with `origin=*`. Check this in the browser before building on it.

## Do this

1. **Migration `20261124100000_place_images.sql`.**
   - The licences above, each with its title, URL, and flags. The sources `wikimedia-commons` (`platform`) and `sooty-earth-contributors` (`contributors`), with no default licence.
   - `images` and `place_images` as in design.md §4.6. Also `alt_text` not null, a partial unique index on `images (source_id, source_record_id)` where `source_record_id` is set, so a Commons file is stored once, and a unique partial index on `place_images (place_id)` where `is_primary`. For a Commons image, `source_record_id` is the file title (`File:…`) and `source_url` is its file page. For an upload, `source_id` is `sooty-earth-contributors` and `uploaded_by` is set.
   - The `place-images` bucket: public, 10 MB at most, `image/jpeg`, `image/png`, and `image/webp` only. Storage policies on `storage.objects` let an admin insert, update, and delete objects in that bucket. An upload's path is `uploads/<sha256>.<ext>`.
   - Select policies: anyone reads an `active` image that has an approved link to a published place, and an approved link to a published place. An admin reads every row of both.
   - RPCs, each `security definer` with `set search_path = ''`, raising unless `has_role('admin')`, and executable by `authenticated` only:
     - `add_place_image(p_place_id uuid, p_image jsonb)` stores the image, or reuses the one with the same `sha256` or Commons file, and links it as `approved` with `reviewed_by` set. It raises for an unknown licence or source, for a row with neither or both of `storage_path` and `external_url`, or if the link already exists. It returns the link with its image.
     - `link_place_image(p_place_id uuid, p_image_id uuid)` links an existing image as `approved`. It is used by **Use here**.
     - `set_place_image(p_place_id uuid, p_image_id uuid, p_values jsonb)` changes `status`, `caption`, `alt_text`, or `is_primary`. Making one main photograph clears the others. Rejecting a main photograph clears its flag. A non-approved photograph cannot be the main one. It sets `reviewed_by` and `reviewed_at`.
     - `order_place_images(p_place_id uuid, p_image_ids uuid[])` sets `gallery_position` from the order given. The ids must be exactly the place's approved images.
   - The `audit_row()` trigger on `place_images`, keyed by `(place_id, image_id)`, and on `images`, keyed by `id`.
2. **Database tests, `supabase/tests/test_place_images_local.py`.** On the local stack, as in `test_relationships_local.py`: `anon` and a non-admin cannot call the RPCs, read a suggested or rejected link, or upload to the bucket; an admin adds a Commons image and an upload; the same Commons file or `sha256` added to a second place reuses the image; an unknown licence raises; one main photograph per place; rejecting the main photograph clears it; ordering with a missing or extra id raises; each call writes its `audit_log` rows with the actor; a visitor reads the approved link of a published place and its image.
3. **Client.**
   - `src/places/commons.ts`: read a Commons file title from a file page URL, an `upload.wikimedia.org` URL, or a `Special:FilePath` URL. Fetch its details, turn `Artist` and `ImageDescription` into plain text, and map `LicenseShortName` to a licence id. Refuse a licence that is not in `licences`. Build display and thumbnail addresses with `Special:FilePath/<name>?width=`. Unit tests with stored API responses, without the network.
   - `api.ts`: `loadPlaceImages(id)`, which returns every link to the place for an admin and the approved ones for a visitor, with the image, its source, and its licence. Also `loadRecognitionImages(id)`, which returns the approved photographs of the recognitions on confirmed `recognises` links where this place is the object and `object_coverage` is at least 0.75, leaving out those already linked to this place. Plus `uploadPlaceImage(file)`, `addPlaceImage`, `linkPlaceImage`, `setPlaceImage`, and `orderPlaceImages`. An upload computes its `sha256` and its width and height in the browser before it is stored.
   - A mapping from a link to `PlacePhoto`: the creator as photographer, the source title linked to `source_url`, the licence title linked to its URL, the caption as title, and the alt text.
4. **Profile, edit mode: the Photos tab.**
   - The add form, with two choices: **Upload** (a file input) or **Commons URL**. A Commons URL shows a preview with the creator and licence it found. An upload asks for the creator and a licence from a select, with "Sooty Earth contributors" as the source. Both ask for alt text, which is required, and an optional caption. A Commons description fills the caption. A new photograph is `approved`. A failed save keeps the form open with the error.
   - Approved photographs in gallery order, each as a thumbnail with its credit and licence. The main one is marked. The others have **Make main**, **Move up**, **Move down**, and **Reject**. Suggested photographs have **Approve** and **Reject**. Rejected photographs have **Approve**.
   - **From recognitions**: the photographs from `loadRecognitionImages`, grouped by recognition name, each with **Use here**.
   - After a change, the tab and the header photograph refresh.
   - The Landscape and Measure panel style. Every existing control keeps its place.
5. **Profile, view mode.** The profile loads the approved photographs and passes them to `PlacePhotos`: the main one first, then by `gallery_position`. A place without any keeps "Camouflaged for now".
6. **Tests.** Extend `PlaceProfileComponent.spec.ts`: no Photos tab for a visitor or in view mode; photographs grouped by status with the right actions; adding by Commons URL and by upload, approving, rejecting, making main, moving, and **Use here** call the right functions; view mode passes approved photographs to `PlacePhotos` main first. Run pytest for `supabase/tests`, the catalog suite, the component tests, `npm run type-check`, and `npm run lint`.
7. **Browser check.** Run the `browser-check` skill on the local stack, wide and narrow, on the profile of a place with approved photographs: its header photograph, the gallery, and, signed in, the Photos tab.
8. **User evaluation.** Start the dev server on `http://localhost:5173` against the local stack and give the URL to the user, who signs in through Inbucket, adds photographs by upload and by Commons URL, reviews and orders them, and evaluates before the pull request is opened.
9. **Docs.**
   - `docs/user/using-the-map.md`: the Photos tab in edit mode, and the header photograph and gallery when a place has approved photographs, in place of the sentence that none are stored.
   - `docs/user/data.md`: photographs come from Wikimedia Commons or are uploaded by Sooty Earth, each with its creator and licence, and only approved ones show.
   - design.md §4.3: the licences and the two sources in place. §4.6: `images` and `place_images` in place, naming the migration, the RPCs, the bucket, and the columns and indexes added here. §6: add the four RPCs to the privileged RPCs.
   - `docs/blueprint.md`: the `place-images` bucket, its object path, and that a profile reads its approved photographs.
   - The parcel: the task 04 goal line says "by upload or by Commons URL". Under Deferred, add: copies of approved Commons photographs in Storage (`storage_path`); smaller copies of uploads for thumbnails; removing an image everywhere (`image_status` `removed`); deleting the files of rejected uploads; main photographs on place cards.
10. **Hosted steps, after approval.** Open the pull request first. Then, after approval: `supabase migration list` and `supabase db push`. Check read-only that the licences, the sources, and the bucket exist, that `images` and `place_images` are empty, and that `anon` cannot call the RPCs or upload. After the merge deploys `naturewatch`, the user adds a photograph there, approves and orders it, and sees it in view mode and in `audit_log`. Record the date applied in the pull request.

## Do not

- Do not delete an `images` or `place_images` row, or a stored file.
- Do not copy Commons files into Storage, or accept URLs from sites other than Commons.
- Do not search Commons or Wikidata for photographs, or suggest any. That is task 05.
- Do not add the `/admin` route, the photo queue, or tagline suggestions. Those are tasks 05 and 06.
- Do not change the gallery's design or controls from task 011.
- Do not add photographs to place cards.
- Do not add `species_images`.
- Do not call the FastAPI backend, or use Google Cloud Storage.
- Do not apply the migration before approval.
- Do not start task 05.

## Done when

- The migration is applied to the hosted database, and the bucket exists there.
- The user can add a photograph by upload and by Commons URL on the `naturewatch` Fly app, approve, reject, order, and choose the main one, use a recognition's photograph, and see the result in view mode and in `audit_log`.
- The tests, type check, lint, and browser check pass, with no console errors.
- using-the-map.md, data.md, design.md, blueprint.md, and the parcel match the result.
- One pull request into `develop`, merged after its checks pass and the user approves.

## How to work

Branch from `develop`. Do this task only. Do not commit secrets. Do not add an AI or tool attribution to a commit or a pull request.
