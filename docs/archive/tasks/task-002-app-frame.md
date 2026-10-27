# Task 002 — App frame

Parcel: [Sooty Earth interface](../parcels/ui-revamp.md)

Repository: naturewatch-app. Start only after task 001 has merged.

## Goal

Leave the map full-bleed. A bar across the top clutters it.

## Do this

- Do not add a top bar, a wordmark, or links for Map, Places, and About.
- Leave the layer panel on the left, with the Places control in it. Task 003 moves that panel and replaces the control.
- Leave `/`, `/places`, `/places/:id`, and `/about` as they are. Do not link to About. That page can wait.
- Keep the current loading and message behaviour.

## Do not

- Do not move the layers to the right.
- Do not build the Places button on the map, or the split view. That is task 003.
- Do not restyle the layer list, timeline, measure tools, or place pages.
- Do not remove Vuetify yet.
- Do not change what the map draws.
- Do not start task 003.

## Done when

- The map fills the screen, with no bar above it.
- The layer panel and the Places control still do what they do today.
- Catalog tests pass.
- The work is on a branch from `develop`, in one pull request into `develop`. Report the pull request address. Do not merge it.

## How to work

Branch from `develop`. Do this task only. No cloud processing and no production deploy. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
