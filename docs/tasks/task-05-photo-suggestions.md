# Task 05 — Photo suggestions

Parcel: [Molding Places](../parcels/molding-places.md)

Repository: naturewatch-app. Task 04 is merged and archived.

## Goal

`supabase/suggest_photos.py` finds Wikimedia Commons photographs for each published World Heritage Site and stores up to 3 per site as `suggested`, with the pipeline name and a score. A rerun adds nothing twice. An admin works through them from a Photo queue, opened from the Profile panel and listed in the Places panel on the map: a list of places with suggestions, each opening on its Photos tab, to approve, reject, choose the main photograph, and use the photographs of related recognitions.

Decided 14 November 2026 by the user:

- **Up to 12 suggestions per site**, in this order: the Wikidata image (P18), files in the site's Commons category (P373), then a Commons search by the place's name.
- **The queue shows one place at a time.** The places with suggestions are listed on the left. Choosing one shows the existing Photos editor for that place on the right, with **Next place**.

Changed 15 November 2026 by the user, during evaluation:

- **The queue is on the map, not on `/admin`.** Reviewing a photograph beside the place on the map is faster. The Places panel gets a **Photo queue** button for admins. It lists the places with suggestions as place cards, with their counts. Choosing one opens the place as the Places list does, in Edit mode, on its Photos tab. The Photos tab then has **Next place**. `/admin` and its menu item are removed.
- **Three suggestions per site, not 12**, so approving stays a manageable manual task. More can be added later.
- **A suggestion's caption is one sentence**, the first sentence of the Commons description, as the alt text is.
- **Clicking a thumbnail in the Photos editor opens the photo viewer** at that photograph, stepping through its group. A suggested photograph has **Approve** and **Reject** there, which move to the next one and close the viewer after the last.
- **The first approved photograph becomes the main one.** `set_place_image` makes an approved link main when the place has none. When the main one is rejected, the next approved one in gallery order becomes main.
- **The editor reads "Suggested by Sooty"** for a pipeline's suggestion. `suggested_by_pipeline` keeps `suggest_photos/1`.
- **The place card shows the area and the count of suggestions as separate tags.**
- **Admin controls are in the Profile panel.** It gets an **Edit mode** switch with a pencil icon, replacing View and Edit on the place profile, and the **Photo queue** button, replacing the one in the Places panel. Photo queue turns on Edit mode and opens the Places panel with the queue list.

## Facts already stored

From the code and the hosted database on 14 November 2026:

- 207 World Heritage Sites are published, and each has a confirmed `wdpa_site_id` row in `place_source_ids`. Wikidata property P809 is the WDPA id, which is that SITE_ID.
- `images` holds 1 row and `place_images` 1 approved link, added during task 04. No link is `suggested`.
- `images` and `place_images` are in `20261124100000_place_images.sql`. `place_images` already has `suggested_by_pipeline`, `suggestion_score`, and `alt_text` not null. A Commons image has `source_id` `wikimedia-commons`, `source_record_id` `File:…`, `source_url` its file page, and `external_url` the file. The unique index on `(source_id, source_record_id)` stores a Commons file once. Pipelines leave `uploaded_by` null.
- `set_place_image` already approves or rejects a `suggested` link and puts an approved one last in the gallery. Admins already read every row of both tables.
- `PlacePhotosEditor.vue` takes only `placeId`, emits `changed`, and already shows **Suggested** photographs with **Approve** and **Reject**, their pipeline name, and **From recognitions** / **From conservation areas**.
- `src/places/commons.ts` maps a Commons `LicenseShortName` to a licence id and turns `Artist` and `ImageDescription` into plain text. The Python script needs the same rules.
- `derive_recognises.py` connects as the importer does: `DATABASE_URL` locally, or `SUPABASE_ACCESS_TOKEN` for a short-lived hosted login role. It writes its results to a file in `WDPA_WORK_DIR` before a separate `load` writes the database.
- `AuthStore` has `isAdmin`. The router has no `/admin` route. `AccountButton.vue` is the signed-in menu.
- The Wikidata Query Service and the Commons API are free and need no key. Wikimedia asks automated clients for a descriptive User-Agent.

## Do this

1. **`supabase/suggest_photos.py`**, with three commands, as `derive_recognises.py` has:
   - `fetch` only reads the database: the published World Heritage Sites, their names, and their SITE_IDs. One Wikidata SPARQL request finds the items with those P809 values and their P18 and P373. For each site, in order: the P18 file, the files in the P373 category, and a Commons search in the File namespace by the place's name. It reads each file's `imageinfo` (`url|size|mime|extmetadata`) in batches of 50. It keeps a file only if it is JPEG, PNG, or WebP, at least 1,000 px wide, under a licence in `licences` (the rules of `commons.ts`), with a creator, and its title does not contain `map`, `logo`, `flag`, or `locator`. It keeps the first 3 per site, without repeats. The score is 1.0 for P18, 0.7 for a category file, and 0.4 for a search result, less 0.01 per place in its list. The alt text is the first sentence of the Commons description, at most 300 characters, or else the file name without `File:` and its extension. The caption is the same first sentence. It writes `suggest_photos.tsv` to the work directory and prints, per origin, the sites with a Wikidata item, the files found, the files kept, and the sites with none. A second start reuses the cached API responses in the work directory. It pauses between requests and honours `maxlag` and `Retry-After`.
   - `counts` only reads. It prints how many rows of the file `load` would add, and how many it would skip because the file is already linked to that place in any status.
   - `load` writes the file in one transaction. It reuses the `images` row of a Commons file already stored, or inserts one with `uploaded_by` null. It inserts a `place_images` link as `suggested`, with `suggested_by_pipeline` `suggest_photos/1`, the score, the alt text, and the caption, unless the place already has a link to that image. It prints what it added. A rerun adds nothing twice, and a rejected link stays rejected.
   - The User-Agent is generic (`suggest-photos/1`) unless `SUGGEST_PHOTOS_USER_AGENT` is set. It carries no name, email, or project URL.
2. **Tests, `supabase/tests/test_suggest_photos.py`.** Without the network, from stored Wikidata and Commons responses: the licence mapping, the size, type, and title filters, the order and the cap of 3, the scores, and the alt text and caption. On the local stack, as in `test_derive_recognises_local.py` and rolled back: `load` stores a Commons file once across two places, writes `suggested` links with the pipeline and score, and a second `load` adds nothing, including where a link was rejected.
3. **Migration `20261125100000_photo_queue.sql`.** It also replaces `set_place_image` so an approved link becomes main when the place has none, and the next approved link becomes main when the main one is rejected. `photo_queue(p_limit integer, p_offset integer)`, `security definer` with `set search_path = ''`, raising unless `has_role('admin')`, executable by `authenticated` only. It returns each published place with at least one `suggested` link: its id, display name (curated name first), place type, countries, area, and the count of suggested links, ordered by name, with the total count. `photo_queue_count()` too, or a total column, whichever matches the existing window reads.
4. **Client.**
   - `src/places/images.ts`: `loadPhotoQueue(limit, offset)`. `photo_queue` also returns the place's countries and area from `place_summaries`, for the cards.
   - `PhotoQueueList.vue`, in the Places panel, opened by an admin-only **Photo queue** button in the Profile panel. Choosing a place type or typing a search closes it. It lists the places with suggestions as `PlaceCard`s, 20 at a time with **Show more**, each with its main photograph and a separate tag such as "3 suggested". Choosing one selects the place as the Places list does, turns on Edit mode, and opens the Photos tab. After a change on the Photos tab the counts refresh. A place with no suggestions left leaves the list and stays open.
   - The Profile panel has the **Edit mode** switch and the **Photo queue** button for admins. The place profile no longer has View and Edit.
   - In the Photos editor a thumbnail opens `PlacePhotoGallery`, with **Approve** and **Reject** for a suggested photograph. A pipeline's suggestion reads "Suggested by Sooty".
   - The profile takes the tab to open with, and, while the queue is open, shows **Next place** at the top of the Photos tab. It opens the next place in the queue the same way.
5. **Tests.** `PhotoQueueList.spec.ts`: no button for a visitor; the cards and counts; choosing a place selects it, turns on Edit mode, and asks for the Photos tab; a change reloads the list. `PlaceProfileComponent.spec.ts`: the profile opens on the tab given, and **Next place** emits. Run pytest for `supabase/tests`, the catalog suite, the component tests, `npm run type-check`, and `npm run lint`.
6. **Local run.** Apply the migration locally, run `fetch` against the hosted database read-only, and `load` into the local stack with the hosted World Heritage Sites seeded as needed, or with a few fixture places, so the queue can be checked locally.
7. **Browser check.** Run the `browser-check` skill on `/`, wide and narrow, signed in with suggestions loaded: the Photo queue list, and a place opened from it on its Photos tab.
8. **User evaluation.** Start the dev server on `http://localhost:5173` against the local stack and give the URL to the user, who signs in through Inbucket and works part of the queue before the pull request is opened.
9. **Docs.**
   - `supabase/README.md`: how to run `suggest_photos.py`, what it reads and writes, and the hosted run's counts and date.
   - `docs/user/using-the-map.md`: the **Edit mode** switch and the **Photo queue** in the Profile panel, and the photo viewer in the Photos editor.
   - `docs/user/data.md`: suggested photographs are found automatically on Wikimedia Commons, and only those an admin approves show.
   - design.md §4.6: `photo_queue` in place, and the pipeline name in `suggested_by_pipeline`. §6: add `photo_queue` to the privileged RPCs.
   - `docs/blueprint.md`: what the photo queue reads.
10. **Hosted steps, after approval.** Open the pull request first. Then, after approval of the migration: `supabase migration list` and `supabase db push`. Run `fetch` and `counts` against the hosted database and report the counts. After approval of those counts, run `load`. Check read-only how many `images` rows and `suggested` links were added, and that `anon` cannot call `photo_queue` or read a suggested link. After the merge deploys `naturewatch`, the user opens the Photo queue there and reviews photographs. Record the dates and counts in the pull request.

## Do not

- Do not approve, reject, or make main any photograph from the script. Pipelines only suggest (record 23).
- Do not change or delete an existing `images` or `place_images` row.
- Do not copy Commons files into Storage.
- Do not suggest photographs for any place that is not a published World Heritage Site, or use sources other than Wikidata and Commons.
- Do not add tagline suggestions or their queue. That is task 06.
- Do not change the Photos editor's controls, except what the queue needs to reuse it and the viewer above.
- Do not call the FastAPI backend.
- Do not apply the migration, or `load` into the hosted database, before approval.
- Do not start task 06.

## Done when

- The migration is applied to the hosted database, and the hosted `load` has run with approved counts.
- The user can open the Photo queue on the `naturewatch` Fly app, go through places, approve, reject, choose the main photograph, and use a recognition's photograph.
- A second `load` adds nothing.
- The tests, type check, lint, and browser check pass, with no console errors.
- supabase/README.md, using-the-map.md, data.md, design.md, and blueprint.md match the result.
- One pull request into `develop`, merged after its checks pass and the user approves.

## How to work

Branch from `develop`. Do this task only. Do not commit secrets. Do not add an AI or tool attribution to a commit or a pull request.
