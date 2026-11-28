# Task 06 — Edit a boundary on the map

Parcel: [Shaping Boundaries](../parcels/shaping-boundaries.md).

Repository: naturewatch-app. Start from `develop`. Task 05 merged in #484, and naturewatch-analysis #46 merged.

## Goal

In edit mode, on a place's Status tab, an admin chooses **Edit on map**. The current boundary opens in mapbox-gl-draw with a handle on each point. The admin moves, adds, and removes points, then chooses **Submit**. The edited shape is stored through `submit_boundary` as a proposed version, with `derived_from_boundary_id` set to the boundary it was edited from. It is then approved or discarded as an upload is in task 05. A boundary of more than 5,000 points is not opened for editing, and the section says to use Replace boundary instead. This settles the parcel's open question on boundaries with very many points.

Done on 28 November 2026. The migration was applied to the local database with psql and to hosted after the user approved it. The plan's separate draw tool failed in the browser check, because a second mapbox-gl-draw tool on the same map adds the same sources again. Measuring, corrections, and the edit share one tool (`src/places/mapDraw.ts`), and the edited boundary carries a `boundary_edit` property that measuring skips. The edit fits the map up to zoom 16, since the usual fit stops at 10. The browser check ran on Malpelo Island xeric scrub, whose original boundary was restored afterwards, and on European Atlantic mixed forests (8,254 points) for the limit. On a phone the panel covers most of the map, as it does for an upload.

## Facts already stored

From the code and the hosted database on 28 November 2026:

- **`submit_boundary(p_place_id, p_geojson, p_source_url)`** stores a valid Polygon or MultiPolygon of at most 100,000 points as `proposed`, with source `sooty-earth-contributors`, `submitted_by`, and `derived_from_boundary_id` null. A place can have one proposed boundary (`place_boundaries_proposed_key`). `approve_boundary` and `reject_boundary` decide it. All three are admin only.
- **`proposed_boundary(p_place_id)`** returns the proposed boundary's id, area, point count, source link, uploader, date, and shape. No function returns a current boundary's shape, and `geom` is not granted to `anon` or `authenticated`.
- **`PlaceBoundaryUpload.vue`**, at the end of the Boundary section, has the states idle (**Replace boundary**), picked (**Submit**, **Cancel**, Source link), and proposed (**Approve**, **Discard**). `PlacesStore.boundaryPreview` is drawn as a dashed blue outline by `src/places/boundaryPreview.ts`, which also flies to it.
- **`MeasureComponent.vue`** owns the one MapboxDraw instance, for lengths, areas, and corrections. Its `draw.create` and `draw.update` listeners are on the map, so they hear every draw instance. `measureStore.setDrawing` keeps a click that finishes a shape from choosing a place.
- **Point counts on hosted**, from the `vertex_count` findings of current boundaries: median 860; 8,049 over 5,000; 1,782 over 20,000; 237 over 100,000.

## Decided

With the user, 28 November 2026:

- **Edit on map takes at most 5,000 points**, about 85% of current boundaries. A larger boundary is not simplified. The section names its point count and points to Replace boundary.
- The two steps from task 05 stay: Submit, then Approve or Discard.

## Do this

1. **Migration `20261212100000_edit_boundary.sql`.**
   - **`current_boundary_shape(p_place_id uuid)`**, admin only. It returns the current boundary's id, version number, and point count, and its shape as GeoJSON only when it has at most 5,000 points. Otherwise the shape is null.
   - **`submit_boundary`** gains `p_derived_from_boundary_id uuid default null`. When given, it must be the place's current boundary, or the call is refused in plain words. It is stored in `derived_from_boundary_id`. Drop the three-argument function and create the four-argument one, with the same grants, so the API has one signature.
   - **`proposed_boundary`** also returns `derived_from_boundary_id`, so the section can say "Edited" instead of "Uploaded".
2. **Frontend.**
   - **`src/places/replacementBoundary.ts`**: `loadCurrentBoundary(placeId)`, and `submitBoundary` takes the optional boundary it was edited from. `EDIT_POINTS_MAX = 5000`. The ring and point checks of `parseBoundary` are shared with the edited shape, so an edited shape is refused in the same words.
   - **`src/places/boundaryEdit.ts`**: `useBoundaryEdit(map)`, called from `MapComponent.vue`. While `PlacesStore.boundaryEdit` holds a shape, it adds its own MapboxDraw instance with no buttons, loads the shape in `direct_select`, keeps it in `direct_select` when a click leaves it, and writes each change back to the store. Point removal uses the draw tool's trash on the selected points, from the Delete key and a **Delete point** button. It sets `measureStore.setDrawing` while editing, and removes the instance when the edit ends.
   - **`MeasureComponent.vue`**: its listeners ignore features that are not in its own draw instance.
   - **`PlaceBoundaryUpload.vue`**:
     - Idle shows **Replace boundary** and **Edit on map**.
     - **Edit on map** loads the current shape. Over 5,000 points, it shows "This boundary has 12,345 points. Edit on map takes at most 5,000. Use Replace boundary instead." and stays idle.
     - Editing shows "Editing boundary", one line on how to move, add, and remove points, the live area and point count, an optional Source link, **Delete point**, **Submit**, and **Cancel**. The dashed preview is off while editing, since the draw tool shows the shape.
     - **Submit** stores the shape with the current boundary as `derived_from_boundary_id`, then the section shows the proposed state, with "Edited <date>, by you." A refusal, such as a shape that crosses itself, is shown with the database's reason and the edit stays open.
     - **Cancel**, choosing another place, or leaving edit mode ends the edit and drops the changes.
3. **Tests.**
   - **pytest.** `current_boundary_shape` for an admin and a non-admin, with the shape returned at 5,000 points and null above. `submit_boundary` with `p_derived_from_boundary_id`: stored when it is the current boundary, refused when it is another place's or a superseded one. `proposed_boundary` returns it.
   - **vitest.** The section's new states and buttons, the over-5,000 line, Submit with the boundary id, a refusal keeping the edit open, and Cancel. `useBoundaryEdit` with a stub map and draw: starts, writes changes back, and removes its instance.
   - Run the catalog suite, the full vitest suite, `npm run type-check`, and `npm run lint`.
4. **Browser check** against the local stack, wide and narrow. On a local place under 5,000 points: Edit on map, move a point, add one, delete one, Cancel, then edit again, Submit, and Approve, with the original boundary restored afterwards. Open a place over 5,000 points and check the line. Check that measuring and Flag still work after an edit, and that the other Status tab controls stay visible.
5. **Hosted.** Run `supabase db push --linked --dry-run`, then push only after the user approves. No boundary is edited on hosted in this task.
6. **Docs.**
   - `docs/user/using-the-map.md`: Edit on map, the 5,000-point limit, and Delete point, in the Replace boundary paragraph.
   - `docs/database/design.md` §4.2 and §6: `current_boundary_shape`, the new argument, and `derived_from_boundary_id` set by an edit, as *in place*.
   - The parcel: the open question on many points is settled.

## Do not

- Do not simplify a boundary, or raise the 5,000-point limit, in this task.
- Do not return a current shape over 5,000 points, or grant `geom`.
- Do not add drawing of new parts, splitting, or merging. Only points of the existing parts are edited.
- Do not edit a proposed boundary. It is approved or discarded.
- Do not change approval, QC, eligibility, or the rebuild step from task 05.
- Do not edit a boundary on hosted, or push the migration before the user approves.

## Done when

- The migration is applied to the local and hosted databases.
- In edit mode, an admin edits a boundary of at most 5,000 points on the map and submits it as a proposed version with `derived_from_boundary_id`, and a larger boundary gets the line pointing to Replace boundary.
- Measuring and corrections work as before.
- The tests and the browser check pass.
- The docs are updated.
- The task is archived on this branch.

## How to work

- The map lags the database. An approved edit shows on the map only after its archive is rebuilt, by hand as in naturewatch-analysis `places/README.md`.
- If editing 5,000 points is slow in the browser check, stop and ask before lowering the limit.
