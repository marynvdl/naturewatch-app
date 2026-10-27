# Task 007 — Remove the old UI kit

Parcel: [Sooty Earth interface](../parcels/ui-revamp.md)

Repository: naturewatch-app. This is the last task of the parcel. The places list, the filters, the split view, and the popup restyle are a later parcel.

## Goal

Remove Vuetify once the screens use the app’s own controls, so the app depends on shadcn and Tailwind.

## Do this

- Remove `vuetify`, `vite-plugin-vuetify`, `eslint-plugin-vuetify`, `@mdi/font`, the Sass theme, and the Roboto loader from `frontend/naturewatch`.
- Replace any remaining `v-` components. Check `App.vue`, the components under `src/components/`, `src/views/`, `src/plugins/vuetify.ts`, and the tests that mount Vuetify.
- Point the app at the sans-serif family chosen in task 001. That family is Roboto, in `--font-sans`.
- Leave the places list, `/places/:id`, and the current popup doing what they do today. Replace only the Vuetify widgets on those screens.
- Update `docs/user/using-the-map.md` only where a sentence would now be false. Do not describe a view switch, place filters, or a new popup. `docs/user/data.md` stays the place for what a layer shows.
- Update `docs/blueprint.md` only where a sentence about the place read would now be false.

## Do not

- Do not change map data, tile URLs, or place calculations.
- Do not build the places list redesign, the split view, or vector tiles.
- Do not redesign `/places/:id`.
- Do not open a pull request from `develop` into `main`.

## Done when

- A search of `frontend/naturewatch` finds no Vuetify imports and no `v-` components.
- `npm run test:unit` and `npm run build` in `frontend/naturewatch` pass.
- The map has been used in the browser, including Satellite and a build without the Supabase URL. About stays unlinked.
- The work is on a branch from `develop`, in one pull request into `develop`. Report the pull request address. Do not merge it.

## How to work

Branch from `develop`. Do this task only. No cloud processing and no production deploy. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
