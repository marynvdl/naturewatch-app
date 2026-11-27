# Task 01 — Energy recipes and sample

Parcel: [Energy](../../parcels/energy.md). Shared design: [Threat Layers](../../parcels/threat-layers.md#shared-design).

Repository: naturewatch-analysis. Start from `main`. This is the first task in the parcel.

## Goal

Add the `power-lines` and `power-sites` recipes. On the laptop, build a sample seed, both sprouts, a raster archive for power lines, and a vector archive for plants and farms, for two windows. Check them against imagery, compare solar and wind farms with Global Renewables Watch, choose the classes, bands, encodings, and top zooms, and write the expected cost of each global run. No Batch job, no transfer, no write to either bucket.

## Facts already stored

- The Energy parcel holds the sources, the two sprouts, the tile split (power lines raster, plants and farms vector), and the open questions. Threat Layers holds the shared seed, sprout, tile, licence, and cost rules.
- `roads/` is the pattern: `seed.py` (DuckDB on Overture's public bucket, reading only the row groups whose `bbox` meets a box, plus a `footers` count per 10° block), `sprout.py`, `tiles.py`, `render.py`, `boxes.yaml`, and tests. `cookbook/recipes/roads-2026-10-v1.yaml` is the recipe pattern. `tiles/pyramid.py` holds the share pyramid and palette PNG. `places/` builds vector PMTiles with Tippecanoe, which is installed on the laptop.
- Overture `base/infrastructure` (schema v2.0.0, ODbL) has `subtype` (including `power`, `water`, `utility`, `waste_management`), `class` (including `power_line`, `minor_line`, `cable`, `plant`, `generator`, `substation`, `power_tower`, `power_pole`), `names`, `sources`, and `source_tags`, the raw OpenStreetMap tags that Overture passes through. Geometries are points, lines, polygons, and multipolygons. Which classes sit under `power`, and whether `voltage`, `operator`, `plant:source`, `generator:source`, and `plant:output:electricity` reach `source_tags`, is not yet checked.
- On 27 November 2026 the public bucket served releases `2026-10-21.0` (the roads release) and `2026-11-18.0`. Overture does not keep every release, so the global seed in task 02 should follow soon.
- Global Renewables Watch v1.0 (Microsoft and partners, March 2025) is on GitHub as `solar_all_2024q2_v1.gpkg` and `wind_all_2024q2_v1.gpkg`: about 86,000 solar PV installations as polygons and 375,000 onshore wind turbines as points, detected from imagery up to the second quarter of 2024, each with an estimated construction date. The code is MIT licensed. The data licence is not stated on the README.

## Do this

1. **Folder.** A new `energy/` folder with `README.md`, `requirements.txt`, `boxes.yaml`, the scripts below, and tests. Reuse the roads seed reader, `tiles/pyramid.py`, and the sprout STAC code where they fit, instead of copying them.
2. **Release.** Use `2026-10-21.0`, the roads release, unless it has gone from the bucket by the time task 02 can run. Then use the latest, and say so in the recipe.
3. **Windows.** Two 2° × 2° windows in `boxes.yaml`: the Karoo around De Aar and Beaufort West, with Karoo National Park and the Northern Cape solar and wind farms, and a rural French window with dense lines and solar parks. Add a few small check boxes inside them for the imagery check.
4. **Schema check.** For the windows, count `base/infrastructure` rows by `subtype`, `class`, and geometry type, and list the `source_tags` keys with how often each is filled. This settles the classes under `power` and which attributes the feature card can show.
5. **Seed.** `energy/seed.py` reads `base/infrastructure` in a box with DuckDB. It keeps the Overture `id`, `subtype`, `class`, the primary name, the OpenStreetMap ids from `sources`, the `source_tags` worth keeping, `bbox`, and the geometry. Use the `footers` count of every subtype to price two choices: a seed of `power` only, or of every subtype, so Water and Mines can reuse one read. Write both prices, and keep the window seed of every subtype for the check.
6. **Classes and attributes.** Propose:
   - the line classes kept and the voltage classes for `power-lines`, from `voltage` where it is tagged;
   - the site classes kept for `power-sites` (plants, and generator polygons such as solar fields), with the source groups solar, wind, fossil, hydro, nuclear, and other, from `plant:source` or `generator:source`;
   - what happens to cables, substations, towers, poles, and single generators such as rooftop solar and single turbines;
   - the attributes kept for the feature card, such as name, operator, source, and output.

   Check the proposal against imagery at a few points per check box.
7. **Global Renewables Watch.** Download the two GeoPackages once to `data/energy/`. In both windows, compare their solar polygons and wind points with the OpenStreetMap sites: matched, only in Global Renewables Watch, and only in OpenStreetMap, with a few of each checked against imagery. Find the data licence from the release or the paper. Recommend whether it joins `power-sites` and how its features are told apart. If the licence is not open, do not use it.
8. **Sprouts for the windows.** `energy/sprout.py` burns both onto the grid, EPSG:4326 at 0.00025°, as `uint8` COGs:
   - `power-lines`: the cells a kept line touches, with its voltage class, the highest one winning;
   - `power-sites`: the cells inside a kept site, with its source group, and a plant mapped only as a point marking its own cell.

   Record the COG bytes per window.
9. **Tile sample.**
   - `power-lines`: a raster archive in the roads design, with a share below the top zoom and the voltage class at it. Choose the top zoom and the share shades, so long transmission lines still show at zoom 4–6.
   - `power-sites`: a vector archive from the seed with Tippecanoe, keeping the feature-card attributes. Choose the zoom range, and whether small sites drop or turn to points zoomed out.

   Render each window at zoom 4, 8, and the top zoom with `energy/render.py`, with both archives drawn together. Record tiles, bytes per zoom, the largest tile, wall time, and peak memory.
10. **Global cost.** Scale the sample figures by the footer counts to estimate, for the seed, each sprout, and each archive: the bytes stored, the machine type and hours, and the price at spot rates. Write the estimates in `cookbook/README.md`, with monthly storage.
11. **Recipes.** `cookbook/recipes/power-lines-2026-10-v1.yaml` and `cookbook/recipes/power-sites-2026-10-v1.yaml`, with the release, the classes kept, the voltage and source rules, the attributes, the grid, the seed, the sprout band, and the tile path, encoding, and zooms. Their comments point at `energy/README.md` for the measurements.
12. **Records.** How to run the scripts, the schema counts, the class tables, the Global Renewables Watch comparison, and the sample sizes go in `energy/README.md`. Add both recipes to the status table in `docs/pipelines.md`. Tests in `energy/` cover the class, voltage, and source rules and the burn on fixtures, without network.

## Stop for approval

Stop twice:

- **After step 7**, with the schema counts, the proposed classes, voltage classes, source groups, and attributes, the Global Renewables Watch comparison, and the two seed prices. Get approval before building the sprouts.
- **After step 9**, with the renders and tile sizes. Get approval for the encodings and zooms before writing them into the recipes.

## Do not

- Do not start a Batch job or a transfer, and do not write to either bucket.
- Do not read more of Overture than the windows, the check boxes, and the footers.
- Do not build anything for Water, Mines, or the map. A seed of every subtype is priced, not built globally.
- Do not register the sprouts in `sprouts` or compute any place stat.
- Do not add a GitHub workflow that starts on push.

## Done when

- Both recipes name the release, the classes, the rules, the attributes, the grid, the seed, the sprout band, and the tiles.
- `energy/README.md` holds the schema counts, the class tables, the Global Renewables Watch comparison, and the sample sizes, timings, and renders.
- Each global run has a written cost in `cookbook/README.md`, with both seed choices.
- The user approved the classes, the attributes, the use of Global Renewables Watch, the encodings, and the zooms.
- `python -m pytest cookbook energy` passes.
- One pull request into `main` in naturewatch-analysis, and one into `develop` here with this file and the parcel link. Each links the other. Claude merges neither.

## How to work

Read `../naturewatch-analysis/CLAUDE.md` first. Branch `feat/task-01-energy-recipes-and-sample` from `main` there. Do this task only. Keep laptop reads to the windows and check boxes above. Do not commit secrets. Do not add AI or tool attribution.
