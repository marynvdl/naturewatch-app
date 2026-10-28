# Parcel: Sooty Earth interface

## Goal

Give the app one plain, light visual system, built from its own controls. The map keeps the jobs it has today. The screens use shadcn and Tailwind. The app does not use Vuetify.

The places list and the map-and-list split are a later parcel. This parcel does not redesign them.

## Look

Crisp and light, in the spirit of cursor.com. White panels, thin grey dividers, clear type, and generous space. One accent colour means “on”: an active layer, the selected place, the current year. Main actions are near-black.

The map stays the dominant surface. Controls are small, flat, and quiet.

## Left for later

- The places list, filters by name, type, and size, and the map-and-list split. [Place filters](../tasks/task-004-place-filters.md) and [Places and split](../tasks/task-005-places-and-split.md) record that work. They are not tasks of this parcel.
- A restyle of the place popup. [Place popup](../tasks/task-006-place-popup.md) records that work. The popup that opens today stays as it is.
- Vector tiles for place boundaries. The map currently downloads every park outline before it can draw. The next parcel builds a PMTiles archive, after a cost check. Tasks here must not download the outlines again when a filter changes.
- Place types other than protected area, ecosystem condition, charts, and photos.
- A full place page. The simple page at `/places/:id` stays as it is. The popup does not open it.
- A production release. Merge into `develop` only. Do not open a pull request from `develop` into `main`.

## Tasks

Do one task at a time. Start a task only after the one above it has merged. Each task is one branch and one pull request into `develop`.

### naturewatch-app

- [x] [task-001-visual-system.md](../tasks/task-001-visual-system.md)
  - *Goal:* Add the visual system and basic controls beside the current ones. No screen changes.
- [x] [task-002-app-frame.md](../tasks/task-002-app-frame.md)
  - *Goal:* Leave the map full-bleed. No top bar.
- [x] [task-003-blob-buttons.md](../tasks/task-003-blob-buttons.md)
  - *Goal:* Open Places, Layers, and Measure with three organic blob buttons.
- [x] [task-007-remove-vuetify.md](../tasks/task-007-remove-vuetify.md)
  - *Goal:* Remove the old UI kit. The app depends on shadcn and Tailwind.

## Done when

The catalog tests still pass. `npm run test:unit` and `npm run build` in `frontend/naturewatch` pass. The map has been checked in the browser, including satellite and a missing place-store setting. No cloud processing and no production deploy.
