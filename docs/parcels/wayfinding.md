# Parcel: Wayfinding

Finding your way between places on the map: moving from a place to its related places and back, seeing what is drawn, and the same tools in view and edit mode. It also cleans up the photo queue and the ecoregion lines.

*Written 25 November 2026, from the user's notes after using the map.*

## Goal

As a user, on the map, I can:

- open a place, go to Related, open a related place from the map or the list, and step back with a back button;
- keep the related places drawn while I open one of them, and pin that set so it stays while I move on;
- rest the pointer on a place on the map and see its name;
- open another place on the same tab I was on;
- turn on Ecoregions together with other place types, and open Filter before choosing a type;
- see the globe centred in the space the panels leave free;
- see ecoregions as soft fills in their RESOLVE colours, which stay calm when zoomed out.

As an admin, I can:

- use every view feature in edit mode, with the edit controls added on top;
- work through photo suggestions in the places list, with the same search, sort, types, In view, and Filter;
- stop seeing rejected suggestions, and get fewer maps and signboards;
- add a Commons photo under any CC BY or CC BY-SA version, including 1.0.

## Design

**The profile's tab.** The open tab is kept in `PlacesStore`, not in the profile. Opening another place keeps it. If the new place has no such tab, the profile opens on Overview. The one-off `startTab` goes.

**Back.** `PlacesStore` keeps a history of `{id, tab, sets}`. Each selection adds to it. A back button in the profile header returns to the previous entry. A short breadcrumb shows the last two or three places.

**Sets on the map.** The store holds a list of `mapSets`, each `{id, label, kind, placeIds, pinned}`. Today the only kind is `related`. `shownAreaIds` is the union of all sets. The sets draw together with the list's places, with a darker outline above them. With Places closed, only the sets draw.

- A temporary set appears while a place's Related tab is drawn. Its chip shows a link icon and the place's initials, such as SSD, and reads "Related to <place>" on hover. It stays while you open places inside the set, from the map or from its cards. It goes when you open a place outside it, clear the selection, or press ×. There is one temporary set at most.
- A pin on the chip makes the set pinned. A pinned set stays until you press ×. There can be several.
- The chips sit on the right, under Landscape, in the Landscape and Measure panel style. The type buttons stay the only place that shows which place types are on.

**Names on the map.** Resting the pointer on a drawn place shows its name in a tooltip. Cards are not highlighted from the map: the user found that inconsistent (task 01).

**Edit mode.** Edit mode shows the view tabs and adds Photos and Status. Related keeps its cards, map drawing, and hover in edit mode, with the link editor on top. The tab mapping between the two modes goes.

**Place types.** Only Countries stay alone. Ecoregions combine with the other types and are drawn below them. A click on a park inside an ecoregion still opens the park. The list defaults to In view. The Filter button is always shown.

**The photo queue is a list filter.** Admins get a filter, "Has photo suggestions", on the places list. Each card then shows how many photos are suggested, and a click opens the Photos tab. `photo_queue` and `PhotoQueueList.vue` go.

**Rejected suggestions.** Rejected photos are not shown. A rejected link is what stops a rerun from suggesting the same file again, so it is not simply deleted. Rejected links older than 30 days are purged, with their `images` row if nothing else uses it. A `photo_refusals (place_id, commons_title)` row keeps the file from being suggested again.

**Better suggestions.**
- `suggest_photos.py` also reads the English Wikipedia lead image (`pageprops.page_image_free`) with score 1.0, next to P18. This is why the lead photo of European Atlantic mixed forests was missed.
- It refuses files whose Commons categories or titles name maps, information boards, signs, plans, diagrams, or panels.
- It takes at most one search result for a place that already has two from P18, the lead image, or its category. Search gave 479 of the 572 World Heritage Site links.
- One pass applies the new rules to the existing `suggested` links and sets the matches to `withdrawn`. The counts are shown before it writes.
- An ecoregion is suggested the approved photos of the conservation areas `located_in` it. They are written with origin `child`, and the card shows "From <conservation area>".
- More suggestions are run by prompt in a Claude session, not from a button. The script runs on a laptop with free Wikimedia APIs and a database token.

**Licences.** Every CC BY and CC BY-SA version from 1.0 to 4.0 gets a `licences` row and joins `IMAGE_LICENCES`. Ported variants, such as `cc-by-sa-3.0-de`, get their own rows.

**Places and their relations.** There is no new hierarchy table, because `located_in` and `part_of` already form one. Links that go up show as tags or badges on the profile: Located in, Recognised by, Part of. Links that go down or across show as cards in Related: Contains, Has part, Recognises, Overlaps.

## Open questions

- **A query builder.** The user suggested building a query in the Places panel and pinning it with "Add to map" as a chip under Landscape. A query is types, filters, and In view, or a place's Related set. Typing a name must still show the list straight away. A pinned query would be another kind of `mapSets`. A left click picks the last pinned layer. A right click adds "Places here" to the copy-coordinates menu, listing every place under the point. Still open: a colour per chip, and whether the unpinned query still draws.

## Deferred

- A higher Built floor through a tile rebuild, or Google's 0.2 presence cutoff. Task 06 records the false positives instead. The cleaned sprout is task 1 of [Stats Ledger](stats-ledger.md).
- A button for photo suggestions.
- Chip icons per place type, such as one for ecoregions and one for conservation areas, as a visual system for the sets on the map.
- The Attention and Withdrawn admin lists as filters on the places list, like the photo queue.
- The query builder, until its open question is settled.
- Generalised ecoregion tiles: drop small parts and fill small holes at low zoom, in zoom bands written by the places script, with stronger Visvalingam simplification. Task 04 found Zambezian Baikiaea woodlands has 470 parts, 387 under 10 km², and chose fills over a rebuild.
- A production release. App work merges into `develop` only.

## Tasks

Do one task at a time, in this order. Start a task only after the one above it has merged. Each task is one branch and one pull request into `develop` in naturewatch-app, or into `main` in naturewatch-analysis. Task files are written when a task starts.

- [x] [Task 01 — Profile navigation](../archive/tasks/task-01-profile-navigation.md) — naturewatch-app
  - *Goal:* Keep the tab between places, add back and the breadcrumb, keep the Related set while opening its places, add temporary and pinned chips, name a place when the pointer rests on it, and let the citation scroll with the content. Update `docs/user/using-the-map.md`. Run the tests and a browser check, and have the user evaluate the local app.
- [x] [Task 02 — Edit mode on view mode](../archive/tasks/task-02-edit-mode-on-view-mode.md) — naturewatch-app
  - *Goal:* Edit mode shows the view tabs plus Photos and Status. Related keeps its cards, map drawing, and hover, with the link editor on top.
- [x] [Task 03 — Places bar and globe](../archive/tasks/task-03-places-bar-and-globe.md) — naturewatch-app
  - *Goal:* Ecoregions combine with other types, the list defaults to In view, Filter is always shown, and the map's padding follows the open panels so the globe is centred.
- [x] [Task 04 — Ecoregion lines](../archive/tasks/task-04-ecoregion-lines.md) — naturewatch-app, and naturewatch-analysis only if the tiles need a rebuild
  - *Goal:* Draw ecoregions as fills in RESOLVE's colours with no outline, read through `ecoregion_colours()`, in the paint the user picked on the dev server. Keep the Labels toggle off the place outlines. Record why Aldabra and Amsterdam–Saint Paul are misplaced.
- [ ] [Task 05a — Photo queue and licences](../tasks/task-05a-photo-queue-and-licences.md) — naturewatch-app
  - *Goal:* Make the queue a filter on the places list, hide rejected photos, purge old rejected links into `photo_refusals`, and accept every CC BY and CC BY-SA version.
- [ ] [Task 05b — Better photo suggestions](../tasks/task-05b-better-photo-suggestions.md) — naturewatch-app
  - *Goal:* Add the Wikipedia lead image and photos from conservation areas inside an ecoregion. Refuse maps and signboards, and withdraw the existing ones after the user sees the counts. Rerun on the hosted database after approval.
- [ ] [Task 06 — Built false positives](../tasks/task-06-built-false-positives.md) — naturewatch-app
  - *Goal:* Record in `docs/user/data.md` that Built has no presence cutoff on Google cells, so bare rock can show as built, for example in southern Kruger.

## Done when

A person can move from a place to its related places and back without losing what is drawn, and pin a set to keep it. Edit mode does everything view mode does. Ecoregions combine with other types, and draw as soft fills that stay calm when zoomed out. An admin works through photo suggestions like any places list and no longer sees rejected photos, maps, or signboards. The tests pass, and every hosted write and billable run was approved first. No production deploy.
