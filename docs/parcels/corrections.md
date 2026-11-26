# Parcel: Corrections

An admin draws a polygon over a layer and records that the layer is wrong there, for example "this is not cropland" or "this should be built". It works for every pressure layer: crops, Built, roads, tree loss, and later mines, dams, pipelines, and railways.

*Started 26 November 2026 as notes, from the user's brainstorm. Not defined yet. This parcel starts now, in parallel with Shaping Boundaries. The first use is flagging false cropland.*

## Design so far

- **An overlay, never an edit of the sprout.** The effective layer is the sprout with its approved corrections applied. Stats, Tiles and Pressure read the corrected values.
- **One record for every layer:** layer, polygon, the years it applies to, `action`, an optional `value`, a note, photos, submitter, and review status.
- **Three actions:** `remove` (not X here), `add` (X here, with a value such as a share or a road level and surface), and `reclassify` (X, but of another kind or another year).
- **The catalog says what a layer accepts.** Each recipe lists its allowed actions and values, and whether it is yearly. The app builds the form from `layers.json`, so a new layer needs no new screen.
- **Derived layers are not corrected.** Pressure and the low-footprint cores are recomputed from corrected inputs. A flag about them names the input layer.
- **Areas, not segments.** A road correction covers a polygon. Editing a single segment is deferred.
- Admin-only at first. It reuses edit mode, `EditDialog.vue`, the admin lists, and the Storage pattern of `place-images` for photos.

## Capture and apply

This parcel is the capture side: drawing, the form, photos, and a review queue. The apply side rasterises the approved corrections per layer and year, marks the cells they change, and recounts the affected places. It belongs with the [Stats Ledger](stats-ledger.md), which provides the reverse index.

## Open questions

- Drawing in the browser: which Mapbox draw tool, and how a polygon is snapped or simplified.
- Where corrections live: a table in the app database, with the rasters in the bucket next to the sprout.

## Deferred

- Corrections from the public, not only admins.
- Editing single road segments.

## Tasks

None yet.
