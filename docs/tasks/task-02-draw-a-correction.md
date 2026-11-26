# Task 02 — Draw and record a correction

Parcel: [Corrections](../parcels/corrections.md).

Repository: naturewatch-app. Start from `develop`. Task 01 merged in #466.

## Goal

In edit mode, an admin presses a button in the Measure panel and draws a polygon on the map. A form then opens, built from the catalog. The admin picks one of the threat layers that are on, then the action, the values, the years, and a note. Save stores the correction as `submitted` through `submit_correction`. Nothing else is drawn on the map yet. The review queue, outlines, and photos are task 03.

## Facts already stored

From the code on 26 November 2026:

- **Measure.** `MeasureComponent.vue` makes one `MapboxDraw` (no default controls) and adds an area or length label to every shape it creates (`draw.create`, `draw.update`). `syncMode` keeps `measureStore.drawing` set while a draw mode is on, which stops a click from opening a place. It is mounted in `MapComponent.vue` inside the Measure `BlobButton`.
- **Edit mode.** `useAuthStore().editMode` is true only for an admin who turned it on (`AuthStore.ts`). `AccountButton.vue` toggles it.
- **Layers.** `MapLayerStore` holds `MapLayers` built from the catalog by `buildMapLayers`, keyed by `title`, with `visible`. Titles are unique (catalog test). `catalog.layers` holds `id`, `years`, `source.version`, and the `corrections` block.
- **Years.** `resolveLayerYear(available, selected, meaning)` in `src/catalog/index.ts` gives the year a layer shows for the timeline year in `TimelineStore`.
- **Dialog.** `EditDialog.vue` is the edit-mode form, with a title, a slot, Save and Cancel, `busy`, and `error`. `PlaceLinksEditor.vue` and `PlacePhotosEditor.vue` use it.
- **RPC.** `submit_correction(p_layer_id, p_layer_version, p_geojson, p_years, p_action, p_value, p_note)` returns the id. It refuses an invalid polygon and more than 5,000 vertices. RPCs go through `placesClient` in `src/places/api.ts`, as `src/places/status.ts` does.
- `@turf/turf` 7.2 is a dependency, with `kinks`.

## Decided

- **No simplification.** A hand-drawn polygon has a few dozen vertices. The form refuses a polygon that crosses itself (`kinks`) or that has more than 5,000 vertices, and asks to draw it again. This settles the parcel's open question.
- **The button shows in edit mode only.** It sits after the four Measure tools, with the Lucide `Flag` icon and the title "Flag a correction". With no correctable layer on, it is disabled and its title reads "Turn on a pressure layer to flag a correction".
- **Years go back to 2000 on every layer**, from 2000 to the layer's latest year, even where the layer has no data yet. An admin may know that a field was never cropland, and the record is useful later. 2000 is `FIRST_CORRECTION_YEAR` in `src/corrections/form.ts`. The catalog `yearly` flag from task 01 goes, because every layer now has the same year picker.
- **Years are a range with checkboxes.** From and To set the range, with every year inside it checked. Unchecking a year drops it, for example a fire in 2019 and 2021 but not 2020. Both start at the year the layer shows for the timeline year, or its latest.
- **The action labels** are "Remove here" (`remove`), "Add here" (`add`), and "Change kind" (`reclassify`).
- **Messages sit above the Measure panel**, in a small panel of their own, so a message never widens the panel. Found in the browser check, where a wider panel covered the timeline. On a narrow screen in Edit mode, the heading sits above the five buttons, so it is not pushed off the edge.
- **The polygon is not measured.** A correction polygon gets no area label, and it is deleted from the draw tool when the form saves or closes.

## Do this

1. **`src/corrections/form.ts`**, pure functions:
   - `correctableLayers(catalog, visibleTitles)`: the catalog layers that have a `corrections` block and are visible.
   - `yearRange(layer)`: `FIRST_CORRECTION_YEAR` to the layer's latest available year.
   - `defaultYear(layer, timelineYear)`: the year `resolveLayerYear` gives, or the layer's latest.
   - `yearsBetween(from, to, unchecked)`: the years from `from` to `to`, without the unchecked ones.
   - `buildValue(block, action, inputs)`: null for `remove`, or an object with one key per catalog value. A share is a number from 0 to 1.
   - `shapeProblem(polygon)`: null, or why the shape is refused (it crosses itself, or has too many vertices).
2. **`src/corrections/api.ts`**: `submitCorrection(input)` calls `submit_correction` through `placesClient` and returns the id, or throws with the database message.
3. **`CorrectionForm.vue`**, in `EditDialog`, titled "Flag a correction":
   - **Layer:** a select of `correctableLayers`. When only one layer is on, it is chosen already.
   - **Action:** radio buttons for the layer's actions, labelled as decided above.
   - **Values** (for `add` and `reclassify`): a share as a percent from 0 to 100, stored from 0 to 1. Options as a select.
   - **Years:** From and To selects over `yearRange`, starting at `defaultYear`. Below them is a checkbox for each year in the range, all checked. At least one year must stay checked.
   - **Note:** optional, at most 1,000 characters.
   - Save is off until the form is complete. A database error shows in the dialog.
   - When it saves, the dialog closes and the Measure panel reads "Correction saved for review" for a few seconds.
4. **`MeasureComponent.vue`:**
   - The Flag button starts `draw_polygon` in correction mode.
   - On `draw.create` in that mode, it skips the area label and opens the form with the polygon. If `shapeProblem` gives a reason, it shows it and lets the admin draw again.
   - Leaving edit mode or closing the form clears the correction polygon and the mode.
   - Measuring length and area works as before.
5. **Catalog.** Remove `yearly` from the `corrections` block in `layers.schema.json`, `types.ts`, `layers.json`, and the catalog tests.
6. **Tests.** Add `src/corrections/__tests__/form.spec.ts` for the functions in `form.ts`, and `src/components/__tests__/CorrectionForm.spec.ts`:
   - fields per layer (cropland share, roads options);
   - the year range and an unchecked year;
   - one layer chosen already;
   - Save off until complete;
   - the RPC arguments;
   - an error shown.

   Run the catalog suite, the component and corrections tests, `npm run type-check`, and `npm run lint`.
7. **Browser check.** Run the `browser-check` skill on `/`, wide and narrow, as an admin in edit mode with Cropland and Roads on. Draw a polygon, fill the form, and save it against the local database. Confirm the row in `layer_corrections`. The button is hidden outside edit mode.
8. **Docs.** In `docs/user/using-the-map.md`, add a paragraph to Measure on flagging a correction in edit mode.

## Do not

- Do not draw corrections on the map, list them, or review them. That is task 03.
- Do not add photos. That is task 03.
- Do not change how Measure measures.
- Do not write to the hosted database in the browser check. Use the local database.
