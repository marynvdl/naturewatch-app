# Task 06 — Built false positives

Parcel: [Wayfinding](../parcels/wayfinding.md).

Repository: naturewatch-app. Start from `develop`. Task 05b merged in #464.

## Goal

`docs/user/data.md` says that Built can show bare rock as built on Google cells, and why, with southern Kruger as the example the user found. Nothing is rebuilt.

## Facts already stored

- **The Google value.** A Google cell's value is the mean `building_presence` of Google's 2023 images in the cell, with no presence cutoff (`buildings/README.md` in naturewatch-analysis, "Google value: mean presence"). Google's own explorer draws presence only from 0.2.
- **The cut was tested and not made.** Archived task 03b of the [Buildings 2023 parcel](../../archive/parcels/buildings-2023.md) measured a cut at 0.2 before the mean. A global cut costs 1,700–1,800 EECU-hours, 11–12 months of the project's allowance, so seed v1 stayed.
- **What the tiles remove.** A TEMPO cell is kept in the sprout only if a cell within 2 km reaches a share of 0.15. When the tiles are built, a Google cell is drawn only if its share is at least 0.012 and a Google cell within 2 km reaches 0.15 ("Google speckle, resumed" in `buildings/README.md`). That clears faint speckle on empty land. It keeps a patch of rock that Google scores high enough to reach 0.15 somewhere within 2 km, and the cells above 0.012 around it.
- **Built in `data.md`.** The "What is removed" paragraph describes the TEMPO haze and Google's speckle. It does not say what is left.
- **Deferred.** The Wayfinding parcel defers a higher floor through a tile rebuild, and Google's 0.2 cutoff. The cleaned sprout is task 1 of [Stats Ledger](../../parcels/stats-ledger.md). User corrections are their own parcel.

## Do this

1. In `docs/user/data.md`, Built, add to "What is removed" that Google's presence has no cutoff, so bare rock or other surfaces Google scores as likely buildings can show as built where they pass the speckle rule, for example on rock in southern Kruger. Say that a cut at Google's 0.2 was measured and not made, for its cost.
2. Check that the parcel's Deferred entry still matches, and change nothing else.

## Do not

- Do not rebuild tiles, change the paint, or run Earth Engine or Batch.
- Do not add coordinates that were not checked.
- Do not write the cost procedure into this repo. It stays in naturewatch-analysis.
- Do not start the next parcel's work.

## Done when

- `data.md` says why bare rock can show as built on Google cells, with the Kruger example.
- One pull request into `develop`, merged after its checks pass and the user approves.

## How to work

Branch from `develop`. Docs only, so no tests or browser check. Do not add AI or tool attribution to a commit or a pull request.
