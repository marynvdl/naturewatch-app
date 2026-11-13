# Parcel: Shaping Boundaries

The admin work on boundaries. It follows [Molding Places](molding-places.md), which builds sign-in, roles, edit mode, and the `/admin` route that this parcel uses.

*Started 13 November 2026 as notes. Not defined yet. The goal and the tasks are still to be agreed.*

## Notes so far

### Scope named by the user

The scope comes from the user's notes for Molding Places, 13 November 2026.

- **A polygon review queue.** It lists places whose boundary is invalid, too complex, or has many small parts or holes.
- **An overlap review queue.** For each overlapping pair, the admin decides:
  - the relationship;
  - the publication or display status;
  - whether Stats are calculated.

  It also takes the review of the `recognises` links left `proposed` below the confirmation share in Database Honing task 09.
- **Which places the map draws.** Publishing or withdrawing a place.
- **Replacing or editing a boundary.**

### Prerequisites and pieces

- `boundary_checks`, `qc_status`, and a QC script for the four starting checks ([design.md §4.2](../database/design.md#42-boundaries-and-quality), [record 7](../database/decisions.md#7-boundary-quality-as-findings-with-thresholds-in-code)).
- The admin review queue is derived in a view, not stored ([design.md §3](../database/design.md#3-status-fields)).
- `place_overlaps()` must cut shapes into pieces (`ST_Subdivide`) or cap the vertices it accepts before a screen calls it. One call ran the hosted database out of memory on 12 November 2026.
- The RPCs: `review_overlap`, `approve_boundary`, `submit_boundary`, `set_stats_eligibility`, and `confirm_source_match`. The boundary `*_by` columns come with them.
- `stats_eligible_boundaries`. On 13 November 2026 the QC and eligibility work moved here from the parcel that resumes Stats. That parcel then reads the eligible boundaries.
- A change to publication or to a boundary reaches the map only after a PMTiles rebuild in naturewatch-analysis. Each such task needs a rebuild step and its cost.
- A replacement boundary is uploaded as GeoJSON through `submit_boundary`, and becomes current through `approve_boundary`. Drawing a boundary in the browser is a separate, larger choice.

## Open questions

- Which queue comes first?
- Is a replaced boundary uploaded only, or also edited on the map?
- How are the PMTiles rebuilds triggered after admin changes: by hand per batch, or on a schedule?

## Deferred

Nothing yet.

## Tasks

None yet. They are written when the parcel is defined.
