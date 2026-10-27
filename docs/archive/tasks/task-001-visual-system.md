# Task 001 — Visual system

Parcel: [Sooty Earth interface](../parcels/ui-revamp.md)

Repository: naturewatch-app. App: `frontend/naturewatch`.

## Goal

Add Tailwind and shadcn-vue beside Vuetify. Decide and define colour, type, spacing, and focus in one CSS file, and add the basic controls later tasks will use. Nothing on screen changes.

## Do this

- Install Tailwind and shadcn-vue for the current Vue 3 and Vite app. Keep Vuetify installed and working.
- Put the visual tokens in one CSS file: white panels, thin grey dividers (`border-zinc-200/80`), near-black text, muted blue-grey secondary text, one accent for “on”, and a near-black primary action.
- Use one sans-serif family. The current Roboto loader can stay until task 007.
- Use Lucide for new icons. Leave the existing Material icons in place.
- Override the default shadcn look: near-square corners, no drop shadow, flat panels.
- Add only these controls: button, icon button, text field, toggle, slider, menu (popover), segmented control, table.
- Confirm the existing app still renders with Vuetify. Do not restyle `App.vue`, the drawer, the map, or the place pages.
- Show examples of style changes to me to decide if that's the right look.

## Do not

- Do not remove Vuetify, Material icons, Sass, or the font loader.
- Do not change map behaviour, routes, or copy.
- Do not start task 002.
- Do not open a pull request from `develop` into `main`.

## Done when

- I approved the new look and feel of the app.
- The new controls exist and are unused by the current screens.
- `npm run test:unit` in `frontend/naturewatch` passes, including the catalog tests.
- The dev app still loads the map.
- The work is on a branch from `develop`, in one pull request into `develop`. Report the pull request address. Do not merge it.

## How to work

Branch from `develop`. Do this task only. No cloud processing and no production deploy. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
