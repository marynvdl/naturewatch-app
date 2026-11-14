# Parcel: Molding Places

The third places parcel. [Budding Places](../archive/parcels/budding-places.md) built public browsing, and [Places Tiles](../archive/parcels/places-tiles.md) built the global map. This parcel is the admin editor. An admin signs in, switches the map app into edit mode, and curates places: their text, their links to other places, their photographs, and their taglines. Every change is recorded, and the source data and its attribution are kept.

*Started 13 November 2026. Defined the same day.*

The boundary work is not in this parcel. Overlap review, boundary quality findings, replacing a boundary, which places the map draws, and Stats eligibility are in [Shaping Boundaries](shaping-boundaries.md).

## Goal

The user can sign in, open any place, switch to edit mode, and:

- correct its display name, designation, and countries, and write a description and a tagline;
- link it to another place, and confirm, reject, or retire its links;
- add photographs by upload or by URL, approve or reject them, choose the main one, and reuse the photographs of a recognition the place lies at least 75% inside;
- work through queues of photographs and taglines that pipelines suggested for the World Heritage Sites.

## Decisions

Agreed with the user on 13 November 2026.

- **Two parcels.** This one needs only sign-in and a few tables. The boundary work needs quality checks, a fix to `place_overlaps()`, and PMTiles rebuilds, so it is [Shaping Boundaries](shaping-boundaries.md).
- **Edit mode in the map app, plus a small `/admin` route.** Anything about one place is edited in its profile, behind an Edit/View toggle. Lists that span many places, the queues, are on `/admin`. There is no separate admin app.
- **Only admins sign in, by email magic link** (Supabase Auth). Contributors are deferred.
- **Curated values override the source values** ([record 22](../database/decisions.md#22-curated-values-are-overrides-not-edits-to-source-columns)). They are stored in `place_curations`. `places.name` and the details tables are not changed.
- **Pipelines suggest, a person approves** ([record 23](../database/decisions.md#23-suggestions-are-rows-a-person-approves)).
  - Photographs come from Wikimedia Commons, found by the WDPA id through Wikidata and by the place name.
  - Taglines are drafted by Claude from the place's Wikipedia text. Each one keeps the source URL and the supporting sentence.
  - The first runs cover the published World Heritage Sites.
- **Writes go through `security definer` RPCs** that check `has_role('admin')`, as in [design.md §6](../database/design.md#6-access-and-row-level-security). The browser calls them with the signed-in session. The FastAPI backend is not used.

The tables are in [design.md §4.6](../database/design.md#46-people-images-audit). Each one is added with the first task whose screen uses it.

## Tasks

Do one task at a time, in this order. Each task is one branch and one pull request. Task files are written when a task starts. A task that changes the hosted database, or runs a paid pipeline, waits for approval of its row counts and cost.

- [x] [Task 01 — Sign-in, roles, audit](../archive/tasks/task-01-sign-in-roles-audit.md) — naturewatch-app
  - *Goal:* Add `profiles`, `user_roles`, `has_role()`, and `audit_log`. Sign in by email magic link from the app bar, with the session in a Pinia store. Show an Edit/View toggle to admins only. Set the Supabase Auth site URL and the redirect URLs for local development and both Fly apps. Grant the user `admin` with a one-off statement, not a migration, so no email or user id is committed.
- [x] [Task 02 — Curated text](../archive/tasks/task-02-curated-text.md) — naturewatch-app
  - *Goal:* Add `place_curations` and `curate_place`. `place_summaries` and `listed_places` show the curated values, and search still finds the source name. In edit mode the profile edits the display name, tagline, description, designation, and countries in place, shows the source value beside each, and can reset a field to it. In view mode the tagline shows under the title, and the description shows in Overview.
- [x] [Task 03 — Relationships](../archive/tasks/task-03-relationships.md) — naturewatch-app
  - *Goal:* In edit mode the profile lists all of the place's links, including `proposed` and `rejected` ones. The admin adds a link by choosing a type and finding a place by search, and can confirm, reject, or retire a link. Add `set_place_relationship`, `created_by`, and `reviewed_by`.
- [ ] [Task 04 — Photographs](../tasks/task-04-photographs.md) — naturewatch-app
  - *Goal:* Add `images`, `place_images`, the `place-images` Storage bucket, the CC licences, and the sources `wikimedia-commons` and `sooty-earth-contributors`. In edit mode the admin adds a photograph by upload or by URL. A Commons URL fills in the creator and licence from the Commons API. The admin approves or rejects photographs, chooses the main one, and orders the rest. Edit mode also shows the photographs of recognitions that the place lies at least 75% inside, and one click links such a photograph to this place too. The profile shows approved photographs through the existing `PlacePhotos`.
- [ ] Task 05 — Photo suggestions — naturewatch-app
  - *Goal:* Add `supabase/suggest_photos.py`. For each published World Heritage Site it finds Commons images through Wikidata (WDPA id P809, then image P18 and Commons category P373) and through a Commons search by name. It keeps only images under a licence in `licences`, and writes them as `suggested` with the pipeline name and a score. A rerun adds nothing twice. Add the `/admin` route with a photo queue grouped by place, to approve, reject, and choose the main photograph, including the photographs of related recognitions.
- [ ] Task 06 — Tagline suggestions — naturewatch-app
  - *Goal:* Add `place_tagline_suggestions` and `supabase/suggest_taglines.py`. For each published World Heritage Site with an English Wikipedia article, Claude drafts up to three one-line taglines from that article only, each with the sentence that supports it. The run's cost is estimated and approved first. The API key comes from the local environment. Add a tagline queue to `/admin`: approving, after any edit, sets the place's curated tagline.

## Deferred

- Contributors: their sign-in, `place_edit_requests`, and moderation beyond one admin's review.
- iNaturalist sign-in, after a spike confirms a user-info endpoint that accepts the OAuth token ([record 15](../database/decisions.md#15-supabase-auth-profiles-and-roles)).
- More photograph sources: Flickr and Openverse.
- Larger suggestion runs: conservation areas over 1,000 km², then national parks.
- `species_images`, with Indicator Species.
- The `*_by` columns in design.md that no screen writes yet.
- Flagging a curated value whose source value changed in a new release.
- `frontend/naturewatch/tsconfig.app.json`: replace `"moduleResolution": "node"` with `"bundler"` and drop `baseUrl`, which TypeScript 6 flags as deprecated. One `chore/` branch, outside this parcel's tasks.

## Done when

- The six tasks are merged into `develop`.
- The user can sign in on the `naturewatch` Fly app, edit a place, and see the edit in view mode and in `audit_log`.
- The World Heritage Site photograph and tagline queues have been run and reviewed.
- `docs/user/` describes signing in, edit mode, and the queues.
