# Parcel: Stats Ledger

Resumes the Stats Pipeline. Each raster is tallied once onto coarse cells, and every place is summed from those cells, so overlapping places (countries, continents, ecoregions, parks) do not read the same pixels again.

*Started 26 November 2026 as notes, from the user's brainstorm. Not defined yet.*

## Order

1. **Buildings sprout v2.** Apply the approved speckle rule ([buildings/README.md](https://github.com/marynvdl/naturewatch-analysis/blob/main/buildings/README.md), "Google speckle, resumed": floor 0.012 and seed 0.15 within 2 km, Google cells only) to sprout v1 on Batch. Stats, Tiles and Pressure then read one cleaned layer. Expected about $1–3, priced from a pilot first.
2. **The ledger.** It waits for the eligibility part of [Shaping Boundaries](shaping-boundaries.md).

## Design so far

- **Tally COGs.** For each sprout and year, one multi-band COG at 0.01° (40 × 40 sprout pixels). Each band sums a value in km² (valid, crops, built, roads by class). The cells line up with the sprout grid, so a cell's sum is exact.
- **Covers.** For each boundary version, the list of cells fully inside it (interior) and the cells it crosses (rim), stored as Parquet. It is computed once and serves every layer.
- **Stat = interior sum + rim pass.** The interior comes from the tally COGs. Rim cells are counted at full resolution with `area-weighted-spheroid-v1`. The result is exact, and its cost follows the perimeter, not the area.
- **Reverse index.** From a cell to the boundaries whose cover touches it. A changed cell (a correction, a fix) gives the places to recount, not all places.
- **Reruns.** A new current boundary gets a cover and is counted in a periodic sweep once it is `eligible`. `place_stats` stays append-only.
- **Hansen tree loss.** It is on the same 0.00025° grid. Read it from the publisher's tiles and keep a column per loss year, with the `treecover2000` threshold in the method summary. To check: read and egress terms into `europe-west1`, or copy it as a seed once.
- **Earth Engine** only as a seed source for data that lives only there, exported onto the grid. It is not the counting engine.
- Carried over from Wayfinding: cut boundaries into 1° pieces first; size the job from the 941-place run (872 s on Batch); treat the 198 boundaries with over 100,000 vertices on their own.

## Open questions

- The tally cell size: 0.01°, or coarser for a smaller ledger and a larger rim.
- How often the sweep runs, and whether it is started by hand or on a schedule.

## Deferred

- Summing a continent from its countries. The ledger already covers overlap.

## Tasks

None yet.
