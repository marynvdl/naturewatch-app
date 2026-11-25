# Task 06 — Ecoregion photos

Parcel: [Ecoregions](../parcels/ecoregions.md).

Repository: naturewatch-app. Start from `develop`. Task 05 merged in #453.

## Goal

Each published ecoregion is matched to its Wikidata item where one can be found, and the match is stored as a confirmed source id. `suggest_photos.py` then suggests up to 3 Wikimedia Commons photographs per ecoregion, as it does for World Heritage Sites. The suggestions are loaded on the hosted database after approval, and an admin reviews them in the existing Photo queue. Task 07 reuses the Wikidata match to find the Wikipedia article.

Decided 22 November 2026 by the user:

- **Automatic matches are confirmed.** The ecoregions with no automatic match are written to a file. The user fills in the Wikidata items they know in a hand-match file kept in the repo, and that file is loaded too. An ecoregion with no match still gets photographs from a Commons search by its name.
- **Range maps are excluded.** For ecoregions, a title that contains the word `ecoregion` or a WWF code such as `PA1219` is refused as well.

## Facts already stored

From the code, the hosted database, and the Wikidata Query Service on 22 November 2026:

- 846 ecoregions are published. Each has a confirmed `resolve-ecoregions` / `eco_id` row in `place_source_ids`. `ecoregion_details.source_attributes` holds the RESOLVE row, with `ECO_NAME`, `ECO_ID`, `REALM`, and `ECO_BIOME_` (realm and biome code, such as `AF07`). RESOLVE holds no WWF code and no Wikidata id.
- Wikidata has 881 items with a WWF ecoregion code (P1294, such as `AT0722`), and 1,153 with a One Earth ecoregion ID (P12161, a slug such as `namib-desert`). RESOLVE's realm codes differ from WWF's: `AF`→`AT`, `NE`→`NA`, `NO`→`NT`, `IN`→`IM`, `AU`→`AA`. `PA`, `OC`, and `AN` are the same.
- A trial match: the ecoregion's normalised name against the item's English label and aliases, or else the name as a slug against P12161, kept only if one of the item's P1294 codes has the ecoregion's realm. This matched 725 ecoregions and left 121 unmatched, with 4 ambiguous. Of the matched items, 648 have a P18 and 602 a P373. 32 of the P18 files are range maps titled `Ecoregion <code>`.
- `place_source_ids` has a unique index on `(source_id, id_kind, source_record_id)` where `match_status` is `confirmed`. `sources` has no `wikidata` row.
- `suggest_photos.py` reads only World Heritage Sites (`SITES`) and finds their items by WDPA id (P809). `fetch`, `counts`, and `load`, the filters, the cap of 3, the scores, the cache, and the User-Agent are described in `supabase/README.md`. `photo_queue` lists any published place with `suggested` links, whatever its type.
- Hosted: 600 `images` rows, no `suggested` links, and no `place_images` link to an ecoregion.

## Do this

1. **Migration, `supabase/migrations/20261129100000_wikidata_source.sql`.** Add the `wikidata` source (`Wikidata`, Wikimedia Foundation, `https://www.wikidata.org/`, `cc0-1.0`). Extend the `place_source_ids.id_kind` comment with `wikidata_item`, a Wikidata item id such as `Q131377`. Load it locally.
2. **`supabase/match_ecoregion_wikidata.py`**, with `fetch`, `counts`, and `load`, connecting as `suggest_photos.py` does:
   - `fetch` only reads the database: the published ecoregions, their names, `ECO_ID`, and `ECO_BIOME_`. One SPARQL request reads every item with P1294, with its codes, English label and aliases, P12161, and English Wikipedia article. An ecoregion matches an item when its normalised name equals the label or an alias, or else its name as a slug equals the P12161, and one of the item's codes has the ecoregion's realm. If more than one item matches, or one item matches more than one ecoregion, they are ambiguous and left unmatched. Rows from the hand-match file `supabase/ecoregion_wikidata.tsv` (`eco_id`, `wikidata_item`, `note`) take precedence over the automatic match. It writes `ecoregion_wikidata.tsv` (matches, with how each was found) and `ecoregion_wikidata_unmatched.tsv` (name, realm and biome code, and the candidates for an ambiguous one) to the work directory, and prints the counts by method. The response is cached as in `suggest_photos.py`.
   - `counts` only reads: how many matches `load` would add, how many are already stored, and how many differ from a stored match.
   - `load`, in one transaction, inserts each match as a confirmed `wikidata` / `wikidata_item` row. A stored match is left as it is. A match that differs from a stored one is reported and not written.
3. **Hand matching.** After the local `fetch`, give the user the unmatched file. The user adds the items they know to `supabase/ecoregion_wikidata.tsv`, which is committed. Run `fetch` again.
4. **`suggest_photos.py`.** It also reads the published ecoregions with their confirmed `wikidata_item`, and the World Heritage Sites as now. An ecoregion's P18 and P373 are read by item id in one SPARQL request. The search, filters, cap, scores, and alt text are as for a site. For an ecoregion, a title with the word `ecoregion` or a WWF code (two capitals and four digits) is refused too. An ecoregion with no item gets the search only. The printed counts are per place type. The pipeline name stays `suggest_photos/1`.
5. **Tests.** `supabase/tests/test_match_ecoregion_wikidata.py`, without the network, from stored responses: name normalisation, the realm mapping, the alias and slug matches, the ambiguous cases, and the hand file winning. On the local stack and rolled back: `load` writes confirmed rows and a second `load` adds nothing. Extend `test_suggest_photos.py`: an ecoregion found by item id, the range-map titles refused, and an ecoregion with no item using the search only. Run pytest for `supabase/tests`.
6. **Local run.** Apply the migration locally. Run both `fetch` commands against the hosted database, read-only. Then `load` both into the local stack, with the hosted ecoregions as the local database already holds them, and check a few ecoregions in the Photo queue on `http://localhost:5173`.
7. **Docs.**
   - `supabase/README.md`: how to run `match_ecoregion_wikidata.py` and the hand-match file. Update the `suggest_photos.py` paragraph for ecoregions. Add the hosted counts and the date.
   - `docs/database/design.md`: the `wikidata_item` id kind, where `place_source_ids` is described.
   - `docs/user/data.md`: ecoregion photographs are suggested from Wikimedia Commons, and only approved ones show.
8. **Hosted steps, after approval.** Open the pull request first. Then `supabase migration list` and `supabase db push` after approval. Run `match_ecoregion_wikidata.py counts` and report, then `load` after approval. Run `suggest_photos.py fetch` and `counts` and report, then `load` after approval. Check read-only how many `wikidata_item` rows, `images` rows, and `suggested` links to ecoregions were added. Record the dates and counts in the pull request. After the merge deploys `naturewatch`, the user reviews ecoregion photographs in the Photo queue.

## Do not

- Do not approve, reject, or make main a photograph from a script. Pipelines only suggest.
- Do not change or delete an existing `images`, `place_images`, or `place_source_ids` row.
- Do not read the Wikipedia article text or write a description. That is task 07.
- Do not build an admin screen for matching by hand.
- Do not use One Earth text or photos, or any source other than Wikidata and Commons.
- Do not change the Photo queue or the Photos editor.
- Do not apply the migration, or `load` into the hosted database, before approval.
- Do not start task 07.

## Done when

- The migration is applied to the hosted database, and both hosted `load`s have run with approved counts.
- A second `load` of either script adds nothing.
- The user can open ecoregions in the Photo queue on the `naturewatch` Fly app and review their photographs.
- pytest passes.
- supabase/README.md, design.md, and data.md match the result.
- One pull request into `develop`, merged after its checks pass and the user approves.

## How to work

Branch from `develop`. Do this task only. Do not commit secrets. Do not add AI or tool attribution to a commit or a pull request. Wikimedia's User-Agent stays generic unless `SUGGEST_PHOTOS_USER_AGENT` is set.
