# Task 003 — Map controls

Archived. This task is not active. The blob-button task is [Blob buttons](task-003-blob-buttons.md).

Parcel: [Sooty Earth interface](../parcels/ui-revamp.md)

Repository: naturewatch-app. Start only after task 002 has merged.

## Goal

Improve layout as described below and shown in screenshot_1. Restyle the controls on the map, move the layers to the right, and open places from a button on the map. The map stays full-bleed. There is no top bar.

## Do this

In `frontend/naturewatch/src/components/`:

1. Before each step completion, check-in with me for visual approval.
2. **Layers** (`DrawerComponent.vue`). Move the panel from the left edge to the right. It should still be opened and closed by the drawer button. Turn the opacity control next to each activated layer into a settings icon and when clicked, opens up a small panel that shows, the opacity slider, the years a layer covers and existing description from the `info` field in `src/catalog/layers.json`. Remove "Coming soon" layers from the panel. Turning the last layer off still hides the timeline, and turning one on still shows it. Remove the Places control from here. Move the Nature Watch logo out of this panel, to the top-center floating over the map.
3. Map Control. Move the map control buttons to the bottom right of the map.
4. **Places.** Add a search bar in the top left of the map that says "Search Places". Add a button below it that reads "Protected Areas". In the future, there will also be buttons "Ecoregions" and "Countries" next to it. Clicking the "Places" button draws the places on the map and opens the split view, with the map to the right. It does not open `/places`.
5. **Split.** Add `/?view=split` as a mode of the map page. List on the left, map on the right. Keep one Mapbox instance. Do not create a second map. On the split view, two buttons: one returns to the map alone, and one opens the Places list at `/places`. Do not build the grid or the table. The list in the split pane can be the names already shown at `/places`. Task 005 replaces that list.
6. **Measure** (`MeasureComponent.vue`). Keep the same Mapbox Draw tools and the same units. Present them as one quiet control cluster and move them to the bottom right, but to the left of the map control.
7. **Timeline** (`TimelineComponent.vue`). Move it to the bottom center of the map. Keep the catalog year range, a readable current year, and the jump back to the previous year.
8. **Basemap and coordinates** (`BasemapButtonComponent.vue`, `CoordinatesComponent.vue`, `SideButtonsComponent.vue`). Keep them as compact overlays.

The map stays the dominant surface. Panels are flat: white, thin grey border, no floating card shadow. Mapbox’s own navigation and geolocate controls can stay. Do not add an About link. Leave the `/about` route in place.

## Do not

- Do not change layer data, tile URLs, or the year-substitution rules in `docs/blueprint.md`.
- Do not reload place boundaries.
- Do not add a top bar.
- Do not build the grid, the table, or a new popup. Those are tasks 005 and 006.
- Do not remove Vuetify from screens this task does not touch.
- Do not start task 004.

## Done when

- I approve the design and layout.
- The layer panel sits on the right, with no Places control in it.
- The Places button at the top left draws the places and opens the split view.
- From the split view, one button returns to the map and the other opens `/places`.
- A layer can be turned on and off, its opacity changed, and its description read.
- The timeline sits at the bottom and still changes the year.
- Measure still reports length and area.
- The basemap still switches, including Satellite.
- Catalog tests pass, and these controls have been used in the browser.
- The work is on a branch from `develop`, in one pull request into `develop`. Report the pull request address. Do not merge it.

## How to work

Branch from `develop`. Do this task only. No cloud processing and no production deploy. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
