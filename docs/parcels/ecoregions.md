# Parcel: Ecoregions

The terrestrial ecoregions of RESOLVE Ecoregions 2017, stored as Places and shown on the map. An ecoregion has its own profile, lists the conservation areas inside it, and appears as a tag on their profiles.

*Written 21 November 2026.*

## Goal

As a user, on the map, I can:

- turn on **Ecoregions** in the Places panel and see them on the map;
- select an ecoregion and open its profile, with a short description, its size, and photos I can click through;
- open the **Related** tab of an ecoregion to see the conservation areas inside it;
- see a conservation area's ecoregions as tags on its profile, and open one from its tag;
- filter by ecoregion, so the list and the map keep only the places related to the ecoregions I choose.

## Sources

| Use | Source | Licence |
| --- | --- | --- |
| Boundaries, names, biome, realm | [RESOLVE Ecoregions 2017](https://ecoregions.appspot.com/) (Dinerstein et al. 2017, *BioScience*), `Ecoregions2017.zip` | CC BY 4.0 |
| Short description | The ecoregion's English Wikipedia lead, suggested and approved by an admin | CC BY-SA 4.0 |
| Photos | Wikimedia Commons, through the ecoregion's Wikidata item, its Commons category, and a name search | per file, from `licences` |
| Further reading | A link to the ecoregion's page on [One Earth](https://www.oneearth.org/), for example `/ecoregions/east-sudanian-savanna/` | link only |

One Earth's text and photos are not copied. Its terms (updated 15 April 2026) forbid automated copying and give no reuse licence. Its photo credits mix unversioned "Creative Commons" with stock photos.

## Design

**Places.** A new category, `ecology`, with the type `ecoregion` and a new `details_kind`, `ecoregion`. Each of the 846 ecoregions is one place with a version 1 boundary, from the RESOLVE polygon. Rock and Ice (ECO_ID 0) is not imported. `place_source_ids` holds `ECO_ID` with `id_kind` `eco_id`. `ecoregion_details` holds the biome and realm, provenance, and the raw source row in `source_attributes`. `place_summaries` reads `realm` from it too. The size on the profile is the current boundary's `area_km2`, as for every place.

**Links.** A conservation area or a recognition is `located_in` an ecoregion, as a `derived` link, with `subject_coverage` (the share of the park inside the ecoregion) and `object_coverage`. The links are derived from the current boundaries. They are computed on a laptop from the hosted boundaries, with the shapes cut on a 1° grid, and not in the database: one `place_overlaps()` call ran the hosted database out of memory on 12 November 2026. The user chooses the coverage at which a link is confirmed from the hosted counts, as in [Database Honing task 09](../archive/tasks/task-09-recognitions.md). Only confirmed links show as tags and in Related.

**Text.** A pipeline matches each ecoregion to its Wikidata item and English Wikipedia article, and suggests the lead as the description. The suggestion is cut at a paragraph or sentence end to fit the 2,000-character limit. An admin approves or edits it in edit mode, and it is stored in `place_curations.description`. Under the text the profile shows "From Wikipedia" with the article link and the CC BY-SA licence, so the text keeps its source and licence. An unmatched ecoregion is listed for an admin to match by hand.

**Photos.** `suggest_photos.py` takes ecoregions as well as World Heritage Sites. It finds them through the Wikidata item matched for the text. Suggestions go to the existing photo queue.

**Tiles.** A third archive, `gs://nature-watch-tiles/places/ecoregions/v1/ecoregions.pmtiles`, layer `ecoregions`, from a new recipe `places-ecoregions.yaml` that follows `places-recognitions.yaml`. Its properties are `id`, `area_km2`, and whatever the chosen paint needs.

**Map.** The Ecoregions button lists ecoregions with the same cards, count, Sort, Filter, and In view as a recognition type, by size only. It draws the ecoregions archive. A click inside an ecoregion opens its profile. The paint is chosen from a local preview of two styles: a fill in RESOLVE's colour per ecoregion, or outlines only, like recognitions.

**Filter.** The filter dialog of every listed place type (Conservation areas and the recognition types) gets an **Ecoregion** field. You type an ecoregion's name and can choose more than one. The list, the count, and the map then keep only the places with a confirmed `located_in` link to a chosen ecoregion. This combines with the size and cropland ranges. The list reads (`place_window`, `place_window_count`, `place_rank`, `place_filter_stats`) take the chosen ecoregion ids. The map keeps the matching ids, as In view does through `shownAreaIds`. The field is kept when you switch place type, as the size filter is.

## Open questions

- Paint: RESOLVE colour fill or outlines (task 04 shows both).
- The confirmation coverage for `located_in` (task 02 shows the counts).
- Whether a park tag needs a minimum share as well, so a park that only touches an ecoregion at its edge is not tagged.

## Deferred

- Biome and realm shown on the profile, or used as filters.
- Stats per ecoregion, such as cropland. They wait for the parcel that resumes Stats.
- Biomes, bioregions, and realms as places.
- Marine ecoregions, and Rock and Ice.
- One Earth text or photos, if One Earth gives written permission.
- Country places.
- A production release. App work merges into `develop` only.

## Tasks

Do one task at a time, in this order. Start a task only after the one above it has merged. Each task is one branch and one pull request into `develop` in naturewatch-app, or into `main` in naturewatch-analysis. Task files are written when a task starts.

- [x] [Task 01 — Ecoregion places](../archive/tasks/task-01-ecoregion-places.md) — naturewatch-app
  - *Goal:* Add the `ecology` category, the `ecoregion` type, `ecoregion_details`, and the source, release, and licence rows. Extend `place_summaries`. Write `supabase/import_ecoregions.py`: download the pinned zip with a checksum, then load places, version 1 boundaries, and `eco_id` source ids. Load it locally, then on the hosted database after approval. Check the count, the areas against RESOLVE's, and that every boundary is valid.
- [ ] [Task 02 — Ecoregion links](../tasks/task-02-ecoregion-links.md) — naturewatch-app
  - *Goal:* Derive `located_in` links from conservation areas and recognitions to ecoregions, with subdivided ecoregion shapes. Write them as `proposed`. Show the user the coverage counts. Confirm the links at the threshold the user chooses.
- [ ] Task 03 — Ecoregions PMTiles — naturewatch-analysis
  - *Goal:* Add `places-ecoregions.yaml` and build `places/ecoregions/v1/ecoregions.pmtiles` from the current boundaries of the published ecoregions. Record the run cost.
- [ ] Task 04 — Ecoregions on the map and profile — naturewatch-app
  - *Goal:* The Ecoregions button lists and draws ecoregions, and a click opens a profile. The paint is chosen from a local preview. The profile shows the size and the One Earth link. Related lists the conservation areas inside, 20 at a time. A conservation area's Overview shows its ecoregions as tags that open them. Update `docs/user/using-the-map.md`, `docs/user/data.md`, and `docs/blueprint.md`. Run the tests and a browser check, and have the user evaluate the local app.
- [ ] Task 05 — Filter by ecoregion — naturewatch-app
  - *Goal:* Add a migration so the list reads take ecoregion ids. Add the Ecoregion field to the filter dialog, and filter the map to the matching places. Update `docs/user/using-the-map.md`. Run the tests and a browser check, and have the user evaluate the local app.
- [ ] Task 06 — Ecoregion photos — naturewatch-app
  - *Goal:* Match each ecoregion to its Wikidata item. Extend `suggest_photos.py` to ecoregions, and load the suggestions on the hosted database after approval. The admin reviews them in the photo queue.
- [ ] Task 07 — Ecoregion descriptions — naturewatch-app
  - *Goal:* Suggest each ecoregion's Wikipedia lead as its description. An admin approves or edits it in edit mode. The profile shows the Wikipedia source and the CC BY-SA licence under the text.

## Done when

A person can turn on Ecoregions, open any of the 846 ecoregions, and see its size. They can read an approved description with its Wikipedia credit, click through its approved photos, and follow the One Earth link. They can list the conservation areas inside an ecoregion and see a park's ecoregions as tags. They can filter any Places list, and the map, by one or more ecoregions. The tests pass, and every hosted write and billable run was approved first. No production deploy.
