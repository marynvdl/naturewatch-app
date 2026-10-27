# Parcel: Sooty Earth interface

## Goal

Give the app one plain, light visual system and three ways to look at places: the map, a list, and the two side by side. Clicking a place opens a small popup. The current map tools keep the jobs they have today.

The home page stays the map. Split is a mode of that page. Places is the list. Switching between the map and split does not reload the map.

## Look

Crisp and light, in the spirit of cursor.com. White panels, thin grey dividers, clear type, and generous space. One accent colour means “on”: an active layer, the selected place, the current year. Main actions are near-black.

The map stays the dominant surface. Controls are small, flat, and quiet. The split view follows the Airbnb map-and-list layout: list on the left, map on the right.

## Left for later

- Vector tiles for place boundaries. The map currently downloads every park outline before it can draw. The next parcel builds a PMTiles archive, after a cost check. Tasks here must not download the outlines again when a filter changes.
- Place types other than protected area, ecosystem condition, charts, and photos.
- A full place page. The simple page at `/places/:id` stays as it is. The popup does not open it.
- A production release. Merge into `develop` only. Do not open a pull request from `develop` into `main`.

## Tasks

Do one task at a time. Start a task only after the one above it has merged. Each task is one branch and one pull request into `develop`.

### naturewatch-app

- [ ] [task-001-visual-system.md](../tasks/task-001-visual-system.md)
  - *Goal:* Add the visual system and basic controls beside the current ones. No screen changes.
- [ ] [task-002-app-frame.md](../tasks/task-002-app-frame.md)
  - *Goal:* Leave the map full-bleed. No top bar.
- [x] [task-003-blob-buttons.md](../tasks/task-003-blob-buttons.md)
  - *Goal:* Open Places, Layers, and Measure with three organic blob buttons.
- [ ] [task-004-place-filters.md](../tasks/task-004-place-filters.md)
  - *Goal:* Filter places by name, type, and size without reloading boundaries.
- [ ] [task-005-places-and-split.md](../tasks/task-005-places-and-split.md)
  - *Goal:* Add the places list and the map-and-list split view.
- [ ] [task-006-place-popup.md](../tasks/task-006-place-popup.md)
  - *Goal:* Restyle the place popup with the facts already stored.
- [ ] [task-007-remove-vuetify.md](../tasks/task-007-remove-vuetify.md)
  - *Goal:* Remove the old UI kit and update the map help page.

## Done when

The catalog tests still pass. New tests cover the filters and the popup text. Each interface task is checked in the browser: map, list, split, and popup, including satellite, a filter that matches nothing, and a missing place-store setting. No cloud processing and no production deploy.
