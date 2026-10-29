# Task 011 — Place photographs

Parcel: [Budding Places](../parcels/budding-places.md)

Repository: naturewatch-app. Start only after task 010 has merged.

## Goal

Show one approved photograph, and open the rest in a gallery with the photographer, the source, and the licence. Arrows and Escape move through the gallery and close it. No approved photographs are stored, so the profile shows that.

## Do this

- One approved photograph is the main image. Opening it shows the whole set large, with the photographer, the source, and the licence on each image.
- Previous and next move through the set. The arrow keys do the same. Escape closes the gallery and returns focus to the control that opened it.
- No approved photographs are stored. The profile says so, in the empty state. Keep the placeholder image for now.
- Build the gallery so a later parcel can pass approved records into it without a second design. Do not add a photograph table in this task.

## Do not

- Do not invent photographs.
- Do not add upload, approval, or sign-in. Molding Places owns those.
- Do not change the Overview, Landscape, or Species text.
- Do not download boundaries again.

## Done when

- I approved the design visually.
- Every stored place shows that no approved photograph is stored.
- Tests cover the empty state, and the gallery controls for a set of records passed in directly: next, previous, arrow keys, and Escape.
- The catalog tests still pass.
- The empty photograph area has been seen in the browser on a wide screen and a narrow screen.
- The work is on a branch from `develop`, in one pull request into `develop`. Report the pull request address. Do not merge it.

## How to work

Branch from `develop`. Do this task only. No cloud processing and no production deploy. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
