# Task 007 — Remove the old UI kit

Parcel: [Sooty Earth interface](../parcels/ui-revamp.md)

Repository: naturewatch-app. Start only after task 006 has merged.

## Goal

Remove Vuetify once every screen uses the new controls, and update the map help page for what the app now does.

## Do this

- Remove `vuetify`, `vite-plugin-vuetify`, `eslint-plugin-vuetify`, `@mdi/font`, the Sass theme, and the Roboto loader from `frontend/naturewatch`.
- Replace any remaining `v-` components. Check `App.vue`, the components under `src/components/`, `src/views/`, `src/plugins/vuetify.ts`, and the tests that mount Vuetify.
- Point the app at the one sans-serif family chosen in task 001.
- Update `docs/user/using-the-map.md` so it describes the view switch, the timeline at the bottom of the map, the place filters, and the popup. Keep layer behaviour and data limits as they are. `docs/user/data.md` stays the place for what a layer shows.
- Update `docs/blueprint.md` only where a sentence about the place read would now be false.

## Do not

- Do not change map data, tile URLs, or place calculations.
- Do not build vector tiles.
- Do not redesign `/places/:id`.
- Do not open a pull request from `develop` into `main`.

## Done when

- A search of `frontend/naturewatch` finds no Vuetify imports and no `v-` components.
- `npm run test:unit` and `npm run build` in `frontend/naturewatch` pass.
- The map, Places, split, and the popup have been used in the browser, including Satellite, a filter that matches nothing, and a build without the Supabase URL. About stays unlinked.
- The work is on a branch from `develop`, in one pull request into `develop`. Report the pull request address. Do not merge it.

## How to work

Branch from `develop`. Do this task only. No cloud processing and no production deploy. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
