# Parcel: Buildings 2023

The first global building layer. It publishes one 2023 snapshot as a seed, a sprout, and one PMTiles archive, and shows it on the map as the Built layer.

*Written 10 November 2026.*

## Goal

A person can turn on Built and see where buildings are, worldwide, as of 2023. The layer is drawn faint where buildings are sparse and strong where they are dense, the same way as Crops.

## Sources

The choice comes from a side-by-side comparison of seven 5 × 5 km boxes on 10 November 2026: rural Burkina Faso, central Mali, the Aïr (Niger), Bardaï (Tibesti, Chad), Mueda (Mozambique), Bria (Central African Republic), and Saint-Flour (France). The page is [Built layer candidates](https://claude.ai/artifact/8D1BrG37y9qLSnH5SHevcd) (private).

| Use | Dataset | Year | Grid | Licence |
| --- | --- | --- | --- | --- |
| Main source where it has data | [Google Open Buildings 2.5D Temporal](https://sites.research.google/open-buildings/), band `building_presence` | 2023 | 0.5 m COGs in the public bucket `open-buildings-temporal-data`, per UTM zone | CC BY 4.0 |
| Everywhere else | [Microsoft TEMPO](https://github.com/microsoft/buildings) global layer, band 1 density | 2023 Q4 | about 76 m, Web Mercator, 256 px COGs from a GeoPackage tile index | CDLA Permissive 2.0 |

What the comparison showed:

- Google Temporal covered every African box, including Mali and northern Chad. The current Built tiles fall back to GHSL 2020 there. So the current tiles came from Google's polygon product, not from the Temporal raster.
- TEMPO's built area was 0.97–1.07 times Overture's in four boxes, 1.13–1.14 in Mueda and Mali, and 0.76 in the Aïr. Every box was centred on a settlement, so these ratios say nothing about empty land.
- TEMPO marks buildings on empty land. On 16 November 2026, the TEMPO viewer showed many low-density false positives at 20.8892° N, 5.8708° E (southern Algeria). Google Temporal 2023 has valid data there and finds no buildings: the highest `building_presence` in a 6 × 6 km box is 0.09.
- GlobalBuildingAtlas has no buildings at Bardaï and is mostly other datasets' outlines. It is not used.
- Overture and OpenStreetMap outlines are sharper than TEMPO in Europe. They are left for later, see below.

## Design

**Value.** The sprout and the tiles carry building share: the fraction of each cell covered by buildings, from 0 to 1. Both sources are turned into share before they are merged. Google: the mean of `building_presence` in the cell, read by Earth Engine from its mean pyramid. Over the comparison boxes it is 1.19 times Overture's built area. TEMPO: its density band, which is already a share, 1.07 times Overture's.

**Merge.** Each sprout cell takes Google where Google has data, otherwise TEMPO. A second band records the source (1 = Google, 2 = TEMPO, 0 = none), so the About text and a later stats run can say which source a number came from. Google's coverage is where `building_presence` is not nodata (−99).

**TEMPO false positives.** TEMPO marks faint buildings on empty land, and they are removed. Where Google's coverage ends, TEMPO is the only source. In the Sahara that edge is not a line of latitude. Google covers all of Algeria to the Mediterranean, and a band over Egypt from about 25° to 35° E. The edge runs along Libya's borders: in the sprout it is at 9.80° E at 27.5° N, 11.70° E at 24° N and about 13.5° E at 23° N. Beyond it are most of Libya, Arabia, Iran, Central Asia and inland Australia. Without a floor, the map would show a faint grey haze on TEMPO's side of the edge and clean desert on Google's side. The √share palette makes this worse, because a share of 0.01 already gets the first shade. Task 01 sets the floor where both sources exist: Google reads about 0 on empty land, so TEMPO's share there measures its false positives. The floor has to remove that noise and keep the scattered real buildings in the comparison boxes. Task 01 found that no floor does both, and that an Overture mask keeps the noise, because Overture holds Microsoft's outlines on the same rocks. The sprout uses a seed rule instead: a TEMPO cell is kept only if a cell within 2 km reaches a share of 0.15. The measurements are in `buildings/README.md` in naturewatch-analysis.

**Sprout grid.** Task 01 decides it. The starting proposal is EPSG:4326 at 0.00025°, the cropland grid, so later stats can read both layers the same way. TEMPO is coarser than that grid and is resampled onto it.

**Tiles.** Follow the cropland version 3 design (`tiles/README.md` in naturewatch-analysis, "Version 3", and archived task 09b): palette PNG, index 0 nodata, eight shades evenly spaced in √share, 512 px tiles, and a pyramid where a parent's share is the weighted mean of its children. Two settings need their own sample, because buildings are much smaller than fields:

- Top zoom. Cropland stops at archive zoom 11. Scattered huts may need a higher zoom.
- The solid top zoom. Cropland draws a cell solid when its share is at least 0.5. A rural compound covers far less than half of a 30 m cell, so that rule would erase most rural buildings. The sample decides whether the top zoom stays graded or uses a lower threshold.

**Map.** The Built layer keeps its id, `built`. The client paints it light grey with the cropland share paint (opacity rising with √share). The info text names both sources and the 2023 snapshot.

Objects:

- Seeds: `gs://nature-watch-bucket/seeds/buildings/google-temporal/2023/v1/` and `gs://nature-watch-bucket/seeds/buildings/tempo/2023q4/v1/`
- Sprout: `gs://nature-watch-bucket/sprouts/buildings/2023/v1/`, id `buildings-2023-v1`
- Tiles: `gs://nature-watch-tiles/buildings/2023/v1/buildings.pmtiles`
- Recipe: `cookbook/recipes/buildings-2023-v1.yaml` in naturewatch-analysis

## Cost

Google's 2023 epoch is large: 0.5 m float32 tiles over Africa, Latin America, and South and South-East Asia, about 18 TB. Task 01 chose Earth Engine: one export per 10° block of mean presence on the sprout grid, like the fire export and the earlier Africa built layer. It is about 60–90 EECU-hours on the noncommercial project. Thresholding Google's 0.5 m pixels instead would cost far more in Earth Engine or on Batch. The estimates are in `cookbook/README.md` in naturewatch-analysis.

TEMPO 2023 Q4 is 822,199 small tiles from one index. Writing each as its own object would cost about $8 in write charges, so task 02 fetches them in a Batch job and stores them as zoom-4 mosaics.

Each billable step records its expected cost first and waits for approval. After the run it records bytes stored, wall time and peak memory in that step's README in naturewatch-analysis.

## Yearly layers, later

This parcel publishes 2023 only. The plan for more years:

- **Google Temporal** has every year from 2016 to 2023, in the same files and the same bands. Each year can be built the same way as 2023, for Google's area.
- **TEMPO** has two global years, 2020 Q4 (released May 2026) and 2023 Q4. Quarterly data to 2025 Q2 exists only for five pilot cities. Watch [microsoft/buildings](https://github.com/microsoft/buildings) for a global release after 2023. That release is the only open global source past 2023 known today.
- **One source per cell across years.** A change from one year to the next only means something if the same source made both years. A cell that is Google in 2023 stays Google in every year. Years that only one source has stay empty for the other source. They are not filled by interpolation, and GHSL epochs are not used.
- **Catalog.** Yearly archives become `buildings/<year>/v1/buildings.pmtiles`. The catalog lists the years in `years.available` with `meaning: annual`, and the tile URL gets `{year}`.
- **Before building years,** check how much Google Temporal changes between years where nothing was built. If the year-to-year noise is close to the real change, show change only above a threshold.

## Left for later

- Stats for places: no building facts are sampled in this parcel. They wait for the parcel that resumes Stats.
- Stats read the sprout, which keeps seed v1's faint Google speckle. A stats run applies the same floor and seed rule as the tiles (task 04), or reads a cut seed if one is made later.
- A cut of Google presence at 0.2 before the mean (task 03b). It costs 1,700–1,800 EECU-hours on 4 m pixels, 11–12 months of the project's allowance, or a Batch run on the 0.5 m COGs.
- Rebiana and other desert villages beyond Google's edge. The TEMPO seed rule (0.15 within 2 km) removed them from the sprout. A looser rule, about 0.10, needs the TEMPO side of the sprout rebuilt.
- Overture or OpenStreetMap outlines as the source in Europe, North America and Australia, where they beat TEMPO. Kept out of this parcel because Google already covers most of the places the app focuses on, and because the outlines have no yearly snapshots, which breaks the one-source-per-cell rule for yearly layers. The licence is ODbL.
- Corrections from users. A person draws a polygon around an area the layer gets wrong and says either "there are buildings here" or "there are no buildings here", with a reason or evidence. The TEMPO false positives are the first use case. This is its own parcel, and it may cover more layers than Built.
- Deleting the current Built tiles at `built/2023/`.
- A production release. Merge app work into `develop` only.

## Tasks

Do one task at a time, in this order. Start a task only after the one above it has merged. Each task is one branch and one pull request into `develop` in naturewatch-app, or into `main` in naturewatch-analysis. Task files are written when a task starts.

- [x] [Task 01 — Recipe](../archive/tasks/task-01-buildings-2023-recipe.md) — naturewatch-analysis
  - *Goal:* Add `buildings-2023-v1.yaml`. Fix the sprout grid, the Google presence threshold, the TEMPO floor, and the merge rule. Set the TEMPO floor by comparing TEMPO with Google on empty Saharan land where both exist, including 20.8892° N, 5.8708° E, and check it against the comparison boxes. Set the threshold by comparing Google share with Overture outline area in the Google-covered comparison boxes. List the TEMPO tiles from the index. Compare the Earth Engine and Batch routes for Google and write both cost estimates. Add the comparison scripts (`compare.py`, `render.py`) under `tiles/` or a new `buildings/` folder, so the boxes can be checked again in task 03. No transfer, export or Batch job.
- [x] [Task 02 — Seeds](../archive/tasks/task-02-buildings-2023-seeds.md) — naturewatch-analysis
  - *Goal:* After approval, write both seeds by the chosen route and check them against the recipe. Record the run cost.
- [x] [Task 03 — Sprout](../archive/tasks/task-03-buildings-2023-sprout.md) — naturewatch-analysis
  - *Goal:* After approval, merge the seeds into the share and source bands as Cloud Optimized GeoTIFFs, with static STAC files. Check the seven comparison boxes against the comparison figures. Record the run cost.
- [x] [Task 03b — Google cut test](../archive/tasks/task-03b-buildings-2023-google-cut-test.md) — naturewatch-analysis
  - *Goal:* In Earth Engine, set Google presence below 0.2 to 0 and average it into sprout cells, with the cut made on 0.5 m, 2 m and 4 m pixels. Export 28 m cells over three 10 × 10 km boxes in the Central African Republic: Kocho in Chinko, Yalinga at Chinko's western gate, and Bria. Compare speckle, lone buildings and built km² with seed v1 and Overture, and record the EECU cost of each run. Recommend how seed v2 is made. Stop for approval. No global export. *Result:* a global cut costs too much for now, so seed v1 stays and the tiles thin its speckle.
- [x] [Task 04 — Tile sample](../archive/tasks/task-04-buildings-2023-tile-sample.md) — naturewatch-analysis. *Resumed on sprout v1. Approved: zoom 12, graded, and Google's speckle removed before the top zoom.*
  - *Goal:* Build the share pyramid on small windows: a rural Sahel village, Bria, Kocho, Mueda, Saint-Flour, empty desert where only TEMPO exists, and the edge where Google meets TEMPO in the Sahara, on the Algeria–Libya border near 9.8° E, 27.5° N. Choose the top zoom and the top-zoom rule. Stop for approval. Do not build the global archive.
- [ ] Task 05 — PMTiles — naturewatch-analysis
  - *Goal:* After the sample is approved, write the global archive to `buildings/2023/v1/buildings.pmtiles`. Verify, upload with the immutable cache header, and record the run cost.
- [ ] Task 06 — Built on the map — naturewatch-app
  - *Goal:* Point `built` at the archive with `tileSize` 512 and the chosen `maxzoom`, paint it light grey with the share paint, and update the info text, `docs/user/data.md` and `docs/blueprint.md`. Run the catalog tests. Check in the browser at a wide and a narrow size.

## Done when

A person can turn on Built and see the 2023 share layer worldwide, drawn from one PMTiles archive in light grey. The tile sample was approved before the global run. Every billable run was approved first, and its cost is in the step README in naturewatch-analysis. The catalog tests pass. No production deploy.
