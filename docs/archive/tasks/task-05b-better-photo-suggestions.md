# Task 05b — Better photo suggestions

Parcel: [Wayfinding](../../parcels/wayfinding.md).

Repository: naturewatch-app. Start from `develop`. Task 05a merged in #463.

## Goal

Photo suggestions find the English Wikipedia lead image, which P18 can miss. Maps, information boards, and signs are left out, and so are most search results. An ecoregion is also suggested the approved photographs of the places inside it. The existing suggestions that the new rules would refuse are withdrawn after the user sees the counts. The script then runs again on the hosted database.

Decided 26 November 2026 by the user:

- **Photos from places inside are suggested links.** `suggest_photos.py` writes them as `suggested`, with a new column `place_images.suggested_from_place_id`. The Photos tab shows "From <place>" on them instead of "Suggested by Sooty". The photo filter counts them like any suggestion.
- **Up to 3 extra.** An ecoregion gets at most 3 photographs from places inside, on top of its 3 Commons suggestions.

On the hosted database, after the user approved each step:

- **26 November 2026.** The migration was applied. `withdraw --write` withdrew 438 of the 2,015 `suggest_photos/1` suggestions, all on ecoregions: 378 extra search results, 58 by Commons category (mostly maps, such as "Biogeographical maps of Europe" and "IBRA maps", and one sign), and 2 by title (signs). 1,577 suggestions were left.
- **26–27 November 2026.** `fetch` sent about 3,100 requests. Commons asked for a wait of about 40 seconds on most of them under `maxlag`, so the first run took over 5 hours. That run found no lead image, because the Wikidata queries did not select `?article`. The fix reran from the cache with 106 new requests. The file has 2,591 rows. World Heritage Sites have 266 rows on 195 of 207 sites: 170 from search, 40 from a category, 38 from P18, and 18 lead images. Ecoregions have 2,325 rows on 829 of 846: 679 from a category, 507 from P18, 481 from places inside, 424 from search, and 234 lead images. European Atlantic mixed forests now gets its lead photograph first.
- **27 November 2026.** `load` added 695 `suggested` links and 211 `images` rows. It skipped 1,896 rows as already linked, and the purge deleted nothing. Waiting for review: 1,577 from `suggest_photos/1`, and from `suggest_photos/2` 478 photographs from places inside on 225 ecoregions, 189 other ecoregion files on 182, and 28 on 25 World Heritage Sites.

## Facts already stored

From the code and the hosted database on 26 November 2026:

- **Hosted suggestions.** Every one of the 2,015 `suggested` links is on an ecoregion. By score, 461 came from P18 (453 places), 748 from a category (361), and 806 from search (399). World Heritage Sites have 397 approved and 204 rejected links, and none suggested. Ecoregions have 142 approved and 82 rejected.
- **Places inside.** Confirmed, current `located_in` links join 202 World Heritage Sites and 7 conservation areas that have approved photographs to 225 ecoregions, with 592 approved links among them. `derive_ecoregion_links.py` writes these links, and `subject_coverage` is the share of the place inside the ecoregion.
- **The script, `supabase/suggest_photos.py`.**
  - `fetch` takes, in order, P18 (score 1.0), up to 50 files in the P373 category (0.7), and up to 30 Commons search results (0.4). It keeps the first 3 per place (`PER_PLACE`). The score falls by 0.01 for each file kept before it from the same origin, so a link's origin can be read from its score.
  - `excluded_title` refuses titles with map, logo, flag, or locator. For an ecoregion it also refuses the word ecoregion and WWF codes such as PA1219. Categories are not read.
  - `file_infos` reads `imageinfo` with `extmetadata` `Artist|License|ImageDescription`, 50 titles a request. Every response is cached in the work directory.
  - `load` skips a place that already has a link to the file in any status, so a `withdrawn` link also stops a rerun from suggesting it again.
- **The Photos tab.** `PlacePhotosEditor.vue` shows "Suggested by Sooty" on a link with `suggested_by_pipeline`. The links are read by `readLinks` in `src/places/images.ts`.

## Do this

1. **Migration.** Add `place_images.suggested_from_place_id` uuid, null, → `places` `on delete set null`. Add it to `docs/database/design.md`.
2. **The lead image.**
   - The Wikidata queries also return the item's English Wikipedia article (`schema:about`, `schema:isPartOf <https://en.wikipedia.org/>`).
   - `fetch` reads `pageprops` `page_image_free` from the English Wikipedia API for those articles, 50 a request, cached like the rest.
   - The file is a candidate with origin `lead` and score 1.0, after P18 and before the category.
3. **Refuse maps and signs.**
   - `file_infos` also reads the `Categories` extmetadata.
   - A file is refused, as `title` or `category`, when its title or one of its categories names a map, information board, sign, signboard, plan, diagram, or panel. Words are matched whole, so "Panelas" or "Signal Hill" are kept. The words are one list in the script.
4. **Fewer search results.** A place takes at most 1 search result. The rule first written, at most 1 once a place has 2 better files, changed nothing under the cap of 3, so the user chose this one on 26 November 2026. On the hosted suggestions it withdraws 407 of the 806 search links.
5. **Photos from places inside.**
   - For each ecoregion, `fetch` reads the approved links of the published World Heritage Sites and conservation areas with a confirmed, current `located_in` link to it. Each place's main photograph comes first, then the rest, with places ordered by `subject_coverage`, largest first.
   - It keeps up to 3, on top of the 3 Commons files, with origin `child`, score 0.8, and the place's id and name. The image and its alt text and caption are reused.
   - `load` writes them with `suggested_from_place_id`. They are skipped like any file the ecoregion already has or refused.
6. **Withdraw the old ones.** A new command, `withdraw`, applies the rules of 3 and 4 to the existing `suggested` links from `suggest_photos/1`.
   - Without `--write` it only reads, and prints how many links it would withdraw, by reason and by place type, with a few titles of each.
   - With `--write` it sets them to `withdrawn`, in one transaction, through the same path the admin RPCs use, so `reviewed_at` and the audit are set.
   - The pipeline name becomes `suggest_photos/2`.
7. **The Photos tab.** A link with `suggested_from_place_id` reads "From <place name>" in place of "Suggested by Sooty". `readLinks` returns the place's display name.
8. **Tests.** Update `test_suggest_photos.py` for the lead image, the category and title refusals, the search cap, the children, and `withdraw`. Add the column and a child load to the local test. Update `PlacePhotos.spec.ts`. Run the local pytest, the catalog suite, the places and component specs, `npm run type-check`, and `npm run lint`.
9. **Browser check.** Run the `browser-check` skill on `/` as an admin in Edit mode: an ecoregion's Photos tab with a suggestion from a place inside, wide and narrow.
10. **Hosted, each step after the user approves it.**
    - Apply the migration.
    - Run `withdraw` and show the counts. Run `withdraw --write` only after the user agrees.
    - Run `fetch` for both types and `counts`, and show them. Run `load` only after the user agrees.
    - Record the counts in this file.
11. **Docs.** `supabase/README.md` for the lead image, the refusals, the search cap, the children, and `withdraw`. `docs/user/using-the-map.md` for "From <place>" on the Photos tab. `docs/database/design.md` for the column.

## Do not

- Do not withdraw an `approved` or `rejected` link, or a suggestion not made by the pipeline.
- Do not write to the hosted database without the user's approval of that step.
- Do not add a button or a scheduled run for suggestions. That is deferred.
- Do not change the photo filter or the purge from task 05a.
- Do not start task 06.

## Done when

- `fetch` suggests the Wikipedia lead image, refuses maps, boards, and signs by title or category, takes at most 1 search result per place, and suggests ecoregions up to 3 photographs from places inside.
- Those photographs read "From <place>" on the Photos tab.
- The existing suggestions the new rules refuse are withdrawn on the hosted database, after the user saw the counts.
- The rerun is loaded on the hosted database after approval, and its counts are recorded here.
- The tests, type check, lint, and browser check pass with no console errors.
- `supabase/README.md`, `using-the-map.md`, and `design.md` match the result.
- One pull request into `develop`, merged after its checks pass and the user approves.

## How to work

Branch from `develop`. Do this task only. The Wikimedia APIs are free; send the generic User-Agent unless `SUGGEST_PHOTOS_USER_AGENT` is set. Do not commit secrets. Do not add AI or tool attribution to a commit or a pull request.
