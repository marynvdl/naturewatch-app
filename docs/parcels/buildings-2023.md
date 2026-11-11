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
| Everywhere else | [Microsoft TEMPO](https://github.com/microsoft/buildings) global layer, band 1 density | 2023 Q4 | about 76 m, Web Mercator, 256 px COGs from a GeoPackage tile index | MIT |

What the comparison showed:

- Google Temporal covered every African box, including Mali and northern Chad. The current Built tiles fall back to GHSL 2020 there. So the current tiles came from Google's polygon product, not from the Temporal raster.
- TEMPO's built area was 0.97–1.07 times Overture's in four boxes, 1.13–1.14 in Mueda and Mali, and 0.76 in the Aïr. No false positives on rock in the two desert boxes. Two boxes do not clear the whole Sahara.
- GlobalBuildingAtlas has no buildings at Bardaï and is mostly other datasets' outlines. It is not used.
- Overture and OpenStreetMap outlines are sharper than TEMPO in Europe. They are left for later, see below.

## Design

**Value.** The sprout and the tiles carry building share: the fraction of each cell covered by buildings, from 0 to 1. Both sources are turned into share before they are merged. Google: presence above a threshold, averaged into the cell. TEMPO: its density band, which is already a share.

**Merge.** Each sprout cell takes Google where Google has data, otherwise TEMPO. A second band records the source (1 = Google, 2 = TEMPO, 0 = none), so the About text and a later stats run can say which source a number came from. Google's coverage is where `building_presence` is not nodata (−99).

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

Google's 2023 epoch is large: 0.5 m float32 tiles over Africa, Latin America, and South and South-East Asia. Copying it whole is probably the wrong move. Task 01 compares two routes and estimates both:

- Earth Engine reduces `GOOGLE/Research/open-buildings-temporal/v1` to share on the sprout grid and exports COGs per block, like the fire export. The seed is then the share export, not Google's tiles. The saved Earth Engine login on the laptop no longer works (its OAuth client was deleted), so `earthengine authenticate` comes first.
- A Batch job reads Google's public COGs in place at a coarse overview and writes share per block. The seed is then a manifest of the tiles read, with their checksums.

TEMPO 2023 Q4 is small tiles from one index, and a Storage Transfer Service job from a URL list can fetch them, like the cropland seed.

Each billable step records its expected cost first and waits for approval. After the run it records bytes stored, wall time and peak memory in that step's README in naturewatch-analysis.

## Yearly layers, later

This parcel publishes 2023 only. The plan for more years:

- **Google Temporal** has every year from 2016 to 2023, in the same files and the same bands. Each year can be built the same way as 2023, for Google's area.
- **TEMPO** has two global years, 2020 Q4 (released May 2026) and 2023 Q4. Quarterly data to 2025 Q2 exists only for five pilot cities. Watch [microsoft/buildings](https://github.com/microsoft/buildings) for a global release after 2023. That release is the only open global source past 2023 known today.
- **One source per cell across years.** A change from one year to the next only means something if the same source made both years. A cell that is Google in 2023 stays Google in every year. Years that only one source has stay empty for the other source. They are not filled by interpolation, and GHSL epochs are not used.
- **Catalog.** Yearly archives become `buildings/<year>/v1/buildings.pmtiles`. The catalog lists the years in `years.available` with `meaning: annual`, and the tile URL gets `{year}`.
- **Before building years,** check how much Google Temporal changes between years where nothing was built. If the year-to-year noise is close to the real change, show change only above a threshold.

## Left for later

- Stats for places: no building facts are sampled in this parcel. They wait for the Stats work in [Database Honing](database-honing.md).
- Overture or OpenStreetMap outlines as the source in Europe, North America and Australia, where they beat TEMPO.
- A check for TEMPO false positives across the Sahara, beyond the two desert boxes.
- Deleting the current Built tiles at `built/2023/`.
- A production release. Merge app work into `develop` only.

## Tasks

Do one task at a time, in this order. Start a task only after the one above it has merged. Each task is one branch and one pull request into `develop` in naturewatch-app, or into `main` in naturewatch-analysis. Task files are written when a task starts.

- [ ] Task 01 — Recipe — naturewatch-analysis
  - *Goal:* Add `buildings-2023-v1.yaml`. Fix the sprout grid, the Google presence threshold, and the merge rule. Set the threshold by comparing Google share with Overture outline area in the Google-covered comparison boxes. List the TEMPO tiles from the index. Compare the Earth Engine and Batch routes for Google and write both cost estimates. Add the comparison scripts (`compare.py`, `render.py`) under `tiles/` or a new `buildings/` folder, so the boxes can be checked again in task 03. No transfer, export or Batch job.
- [ ] Task 02 — Seeds — naturewatch-analysis
  - *Goal:* After approval, write both seeds by the chosen route and check them against the recipe. Record the run cost.
- [ ] Task 03 — Sprout — naturewatch-analysis
  - *Goal:* After approval, merge the seeds into the share and source bands as Cloud Optimized GeoTIFFs, with static STAC files. Check the seven comparison boxes against the comparison figures. Record the run cost.
- [ ] Task 04 — Tile sample — naturewatch-analysis
  - *Goal:* Build the share pyramid on small windows: a rural Sahel village, Bria, Mueda, Saint-Flour, and one edge where Google meets TEMPO. Choose the top zoom and the top-zoom rule. Stop for approval. Do not build the global archive.
- [ ] Task 05 — PMTiles — naturewatch-analysis
  - *Goal:* After the sample is approved, write the global archive to `buildings/2023/v1/buildings.pmtiles`. Verify, upload with the immutable cache header, and record the run cost.
- [ ] Task 06 — Built on the map — naturewatch-app
  - *Goal:* Point `built` at the archive with `tileSize` 512 and the chosen `maxzoom`, paint it light grey with the share paint, and update the info text, `docs/user/data.md` and `docs/blueprint.md`. Run the catalog tests. Check in the browser at a wide and a narrow size.

## Done when

A person can turn on Built and see the 2023 share layer worldwide, drawn from one PMTiles archive in light grey. The tile sample was approved before the global run. Every billable run was approved first, and its cost is in the step README in naturewatch-analysis. The catalog tests pass. No production deploy.
