# Parcel: Shaping Boundaries

The admin work on boundaries. It follows [Molding Places](../archive/parcels/molding-places.md), which built sign-in, roles, edit mode, and the admin lists in the Places panel that this parcel uses.

*Started 13 November 2026 as notes. Defined on 26 November 2026. The eligibility part comes first, because the [Stats Ledger](stats-ledger.md) waits for it.*

## Goal

- Every current boundary has QC findings and a Stats eligibility, so the Stats Ledger can read `stats_eligible_boundaries`.
- As an admin, in edit mode, I can:
  - work through flagged and heavy boundaries in a polygon queue;
  - decide overlapping pairs in an overlap queue;
  - replace a boundary by uploading GeoJSON, or edit it on the map.

## Design

- **QC is a laptop script.** `supabase/check_boundaries.py` follows the `derive_recognises.py` pattern. It reads the current geometry, computes the four starting checks in shapely, and writes `boundary_checks` and `qc_status`. The hosted database does no geometry work, because one call ran it out of memory on 12 November 2026. The checks and their thresholds are in [design.md §4.2](../database/design.md#42-boundaries-and-quality) and [record 7](../database/decisions.md#7-boundary-quality-as-findings-with-thresholds-in-code).
- **The first eligibility is set by the script.** A boundary that passed QC and is under a vertex cap becomes `eligible`, with the reason recorded. Flagged or heavy boundaries stay `pending` for the polygon queue. After that, eligibility changes only through `set_stats_eligibility` ([record 8](../database/decisions.md#8-stats-eligibility-is-stored-and-changed-only-on-purpose)). The cap is set in task 01. On 26 November 2026, about 230 of the 52,000 current boundaries had over 100,000 vertices.
- **The queues are derived in views or RPCs, not stored** ([design.md §3](../database/design.md#3-status-fields)). They reuse the admin lists in the Places panel, like the Corrections list.
- **`place_overlaps()` works on pieces.** It cuts shapes with `ST_Subdivide` before a screen calls it.
- **A replacement is a new version.** `submit_boundary` stores it as `proposed`, with `derived_from_boundary_id` when it is an edit. `approve_boundary` makes it current, and it starts `unchecked` and `pending`. Map editing uses the `@mapbox/mapbox-gl-draw` tool that corrections already use.
- **The map lags the database.** A change to publication or to a boundary reaches the map only after a PMTiles rebuild in naturewatch-analysis. Each task that makes such a change says how to rebuild and what it costs.

## Open questions

- How PMTiles rebuilds are started after admin changes: by hand per batch, or on a schedule. To settle in task 05.
- Where the overlap queue gets its candidate pairs without a hosted all-pairs query. To settle in task 04.
- How map editing handles a boundary with very many vertices. To settle in task 06.

## Deferred

- `confirm_source_match`, named in the notes of 13 November 2026. No task uses it yet.

## Tasks

Do one task at a time, in this order. Start a task only after the one above it has merged. Each task is one branch and one pull request in each repo it names. Task files are written when a task starts.

- [x] [Task 01 — Boundary QC and Stats eligibility](../archive/tasks/task-01-boundary-qc.md) — naturewatch-app
  - *Goal:* Add `qc_status`, the `stats_eligibility` columns, `boundary_checks`, `stats_eligible_boundaries`, and `set_stats_eligibility`. Write `supabase/check_boundaries.py` with the four starting checks, and set the first eligibility with a vertex cap. Run it on the hosted database after approval.
- [x] [Task 02 — Overlaps on pieces](../archive/tasks/task-02-overlaps-on-pieces.md) — naturewatch-app
  - *Goal:* `place_overlaps()` cuts shapes with `ST_Subdivide`, and it is tested on the heaviest boundaries without running out of memory.
- [ ] Task 03 — Polygon review queue — naturewatch-app
  - *Goal:* An admin list of flagged and `pending` boundaries with their findings. An admin accepts a warning (`qc_status` `accepted`) and sets the boundary to `eligible` or `excluded`, with a reason. Run the tests and a browser check.
- [ ] Task 04 — Overlap review queue — naturewatch-app
  - *Goal:* An admin list of overlapping pairs and of the `recognises` links left `proposed`. For each pair, the admin decides the relationship, publication, and Stats eligibility through `review_overlap`. Run the tests and a browser check.
- [ ] Task 05 — Upload a replacement boundary — naturewatch-app and naturewatch-analysis
  - *Goal:* `submit_boundary` takes a GeoJSON upload, and `approve_boundary` makes it current, with `submitted_by` and `reviewed_by`. The new boundary gets QC. Add the PMTiles rebuild step and its cost.
- [ ] Task 06 — Edit a boundary on the map — naturewatch-app
  - *Goal:* In edit mode, an admin edits the vertices of a current boundary with mapbox-gl-draw and saves it as a proposed version through `submit_boundary`. Run the tests and a browser check.

## Done when

Every current boundary has QC findings and an eligibility, and the Stats Ledger reads `stats_eligible_boundaries`. An admin can review flagged boundaries and overlapping pairs, and can replace or edit a boundary. The tests pass, and every hosted write and rebuild was approved first. No production deploy.
