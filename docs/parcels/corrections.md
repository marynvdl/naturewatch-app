# Parcel: Corrections

An admin draws a polygon over a layer and records that the layer is wrong there, for example "this is not cropland" or "this should be built". It works for every pressure layer: crops, Built, roads, tree loss, fire, dams, and later mines, pipelines, and railways.

*Started 26 November 2026 from the user's brainstorm. Defined on 26 November 2026. It runs in parallel with Shaping Boundaries. The first use is flagging false cropland.*

## Goal

As an admin, in edit mode, I can:

- press a button in the Measure panel, draw a polygon, and choose which of the threat layers on the map it corrects;
- choose remove, add, or reclassify, as the layer allows, with a value, the years, a note, and photos;
- see my correction saved as `submitted`;
- work through submitted corrections in a review queue, approve or reject each one, and see the approved ones outlined on the map.

## Design

- **An overlay, never an edit of the sprout.** The effective layer is the sprout with its approved corrections applied. Stats, Tiles and Pressure read the corrected values.
- **One record for every layer:** layer, polygon, the years it applies to, `action`, an optional `value`, a note, photos, submitter, and review status. Corrections live in a table in the app database. Their rasters, made on the apply side, go in the bucket next to the sprout.
- **Three actions:** `remove` (not X here), `add` (X here, with a value such as a share or a road level and surface), and `reclassify` (X, but of another kind or another year).
- **The catalog says what a layer accepts.** Each published threat layer in `layers.json` has a `corrections` block that lists its allowed actions and values, and whether the correction is per year. The app builds the form from it, so a new layer needs no new screen. The block is written in `layers.json` only, not also in the recipe.
- **Review.** Every correction starts as `submitted`. An admin approves or rejects it in the queue. Only approved corrections are applied. The same flow will take public corrections later.
- **Drawing.** A button in the Measure panel starts a polygon with the `@mapbox/mapbox-gl-draw` tool the panel already uses. The form's layer picker lists the threat layers that are on the map.
- **Derived layers are not corrected.** Pressure and the low-footprint cores are recomputed from corrected inputs. A flag about them names the input layer.
- **Areas, not segments.** A road correction covers a polygon. Editing a single segment is deferred.
- Admin-only at first. It reuses edit mode, `EditDialog.vue`, the admin lists, and the Storage pattern of `place-images` for photos.

## Capture and apply

This parcel is the capture side: drawing, the form, photos, and a review queue. The apply side rasterises the approved corrections per layer and year, marks the cells they change, and recounts the affected places. It belongs with the [Stats Ledger](stats-ledger.md), which provides the reverse index.

## Open questions

- How a drawn polygon is simplified or limited in vertices before it is saved. Settled in task 02.

## Deferred

- Corrections from the public, not only admins.
- Editing single road segments.
- `corrections` blocks for layers that are not published yet: mines, pipelines, railways.
- Clicking an outline on the map to open its correction.

## Tasks

Do one task at a time, in this order. Start a task only after the one above it has merged. Each task is one branch and one pull request into `develop` in naturewatch-app. Task files are written when a task starts.

- [x] [Task 01 — Corrections schema and catalog](../archive/tasks/task-01-corrections-schema.md) — naturewatch-app
  - *Goal:* Add the corrections table, its submit and review RPCs with admin-only access, and a Storage bucket for photos. Add a `corrections` block to each published threat layer in `layers.json` (built, treeloss, fire, cropland, roads, dams), with its schema and catalog tests. Apply the migration to the hosted database after approval.
- [x] [Task 02 — Draw and record a correction](../archive/tasks/task-02-draw-a-correction.md) — naturewatch-app
  - *Goal:* In edit mode, a button in the Measure panel draws a polygon and opens a form built from the catalog, with a layer picker that lists the threat layers on the map, then saves the correction as `submitted`. Update `docs/user/using-the-map.md`. Run the tests and a browser check.
- [x] [Task 03 — Review queue, map outlines, and photos](../archive/tasks/task-03-review-corrections.md) — naturewatch-app
  - *Goal:* An admin list of corrections to approve or reject, the approved corrections outlined on the map, and photos added to a correction. Run the tests and a browser check.

## Done when

An admin can draw a correction for any published threat layer on the map, record it with photos, and approve or reject it in a queue. Approved corrections are outlined on the map and stored ready for the apply side in the Stats Ledger. The tests pass, and every hosted write was approved first. No production deploy.
