# Parcel: Roads

The first roads pressure layer. One global snapshot of roads from Overture Maps, published as a seed, a sprout, and one raster PMTiles archive, and shown on the map as the Roads layer.

*Written 11 November 2026. Revised 17 November 2026: raster instead of vector tiles, and a sprout for place stats.*

## Goal

A person can turn on a Roads layer in the threats group and see the world's mapped roads. Zoomed out, the layer shows how much of the land roads reach, the same way Crops shows cropland. Zoomed in, it distinguishes a motorway from a main road, a minor road, and a track. Where the surface is known, it distinguishes paved from unpaved. The layer says which Overture release it shows.

The sprout is analysis-ready, so a later Stats parcel can count roads inside places the same way it counts cropland.

## Why Overture alone

On 11 November 2026 five datasets were compared at ten sites, each a box of about 33 × 33 km:

- Kocho, Chinko and Fode in the Central African Republic
- Bon and Fada in Chad
- Kruger and Waterberg in South Africa
- the Suriname interior
- Pokola in Congo
- BR-163 near Novo Progresso in Brazil
- the Rebiana sand sea in Libya

Each dataset was checked against imagery.

| Dataset | Finding | Use in this parcel |
| --- | --- | --- |
| Overture transportation (OSM-based, release `2026-10-21.0`) | The best coverage at every site. Often the only dataset with the tracks at the remote sites. `road_surface` is filled for most roads at the South African and Chad sites. Carries names and class. | The only source |
| Microsoft RoadDetections (2025 drop) | Finds small tracks no other dataset has, such as the firebreaks around game camps in Waterberg. The lines are patchy, with large gaps. Many false positives on dry riverbeds (Fada, Kruger) and on sand-sea edges (Rebiana, where every detection is false). | Not used. See left for later. |
| GRIP4 (2018) | The most complete logging-road network at Pokola. Elsewhere it is sparse and its geometry is coarse. Sometimes has a type or surface that Overture lacks. Its accuracy is uncertain. | Not used. See left for later. |
| HeiGIT road surface (Mapillary and OSM) | The same OSM geometry as Overture. Sometimes has a surface where Overture has none. The model made no predictions at the Central African, Chad, Congo, or Suriname sites. | Not used. See left for later. |
| HeiGIT Planet surface and width (2020, 2024) | Main roads only. At Fode and Fada the 2020 → 2024 change is mostly paved → unknown on roads OSM tags as unpaved, which reads as an artefact. | Not used. See left for later. |

No dataset showed the most recently cleared logging roads in Suriname.

## Road levels

Every seed feature keeps Overture's own `class`, so roads can be reclassed later by rebuilding the sprout from the seed. The sprout and the tiles carry a derived `level`. Approved on 17 November 2026, after task 01 checked the sample against imagery:

| `level` | Value | Overture `class` |
| --- | --- | --- |
| `major` | 4 | `motorway`, `trunk` |
| `main` | 3 | `primary`, `secondary`, `tertiary` |
| `minor` | 2 | `residential`, `living_street`, `service`, and `unclassified` or `unknown` when paved |
| `track` | 1 | `track`, and `unclassified` or `unknown` when unpaved or the surface is not given |

`surface` is `paved`, `unpaved`, or unknown, read from Overture `road_surface`. A road whose surface changes along its length takes the value that covers most of it.

Paths are left out of this layer: `footway`, `path`, `steps`, `cycleway`, `bridleway`, and `pedestrian`.

`unknown` (OSM `highway=road`) was minor in the first proposal. Every sample of it in the comparison boxes was a dirt track, so it follows `unclassified`. The level table is in `roads/README.md` in naturewatch-analysis.

## Design

**Why raster.** Decided on 17 November 2026. A vector tile has a size budget. At the zooms that show a continent, Tippecanoe has to drop or merge most roads, so dense networks look thin and remote tracks vanish, which hides the impact the layer is for. A raster pyramid keeps every road at every zoom as a share, like Crops. The sprout has to be rasterized for Stats anyway, so the tiles come from the same raster, and there is no Tippecanoe run and no vector archive. What is given up: road names, and crisp lines past the top zoom, where roads are enlarged cells.

**Seed.** One read of the Overture release from its public bucket, with DuckDB, keeping the road classes above. GeoParquet with geometry, `class`, `level`, `surface`, OSM way id, and name, split by 10° block. The seed pins the release, so a rebuild never reads Overture again, and later sources can be joined on the OSM way id.

**Sprout.** One COG per 10° block on the shared stats grid, EPSG:4326 at 0.00025° (about 28 m), the grid of cropland and Buildings 2023, with a VRT and static STAC files beside it, like cropland version 2. A cell is a road cell when a road line touches it. Two `uint8` bands:

- `level`: 0 no mapped road, otherwise the highest level in the cell (1–4).
- `surface`: 0 unknown, 1 paved, 2 unpaved, from a road of that level. Paved wins over unpaved, and unpaved over unknown.

Road length is not stored. A later Stats parcel can count the share of a place in road cells by level and surface, and derive distance to the nearest road from the `level` band. Task 01 decides how blocks without roads and the open sea are handled in the VRT, and checks the all-touched rule on the sample.

**Tiles.** Follow the cropland version 3 design (`tiles/README.md` in naturewatch-analysis, "Version 3"): palette PNG, index 0 nodata, 512 px tiles, a pyramid where a parent's share is the weighted mean of its children. Below the top zoom, a pixel holds the share of its cells that are road cells. At the top zoom, a pixel holds the highest level in it and that road's surface. Set by task 01: top zoom 11. Below it, 8 shades spaced in √(share / 0.25), so a share of 25% road cells or more is the darkest shade, because road share is small and cropland's curve left most land in the two faintest shades. At zoom 11, red = level × 4 + surface. The encoding is in the recipe.

**Map.** The client paints the share like Crops, in its own colour, with opacity rising with √share. At the top zoom it colours by level and draws unpaved differently from paved. The catalog marks the layer as a snapshot, not a time series. Attribution: © OpenStreetMap contributors, Overture Maps Foundation. The transportation theme is ODbL. The sprout is a derived database, so if it is ever offered for download it goes out under ODbL.

Objects:

- Seed: `gs://nature-watch-bucket/seeds/roads/overture/2026-10-21.0/`
- Sprout: `gs://nature-watch-bucket/sprouts/roads/2026-10/v1/`, id `roads-2026-10-v1`
- Tiles: `gs://nature-watch-tiles/roads/2026-10/v1/roads.pmtiles`
- Recipe: `cookbook/recipes/roads-2026-10-v1.yaml` in naturewatch-analysis

A later Overture release is a new seed path and a new sprout and tiles version.

## Cost

Overture's public bucket charges us nothing to read, and Google Cloud charges nothing for data coming in. The global seed and sprout probably need one spot Batch job each, and the tiles reuse the cropland version 3 job, whose global run was estimated at about $0.6–2 of spot compute.

Earth Engine was considered and is not used. Overture transportation is not in the Earth Engine catalog. Loading it through the public BigQuery table bills BigQuery scans to this project, outside the noncommercial EECU quota, and painting hundreds of millions of lines at 28 m globally in Earth Engine is slow and hits memory limits. Rasterizing vectors on Batch is cheap CPU work.

Task 01 runs on the laptop. It records the sample's seed bytes, sprout bytes, tile bytes, wall time, and peak memory. From those it writes an expected cost for each global run, then waits for approval. Each later task records its run in the step README in naturewatch-analysis.

## Tasks

Do one task at a time, in this order. Start a task only after the one above it has merged. Each task is one branch and one pull request into `develop` in naturewatch-app, or into `main` in naturewatch-analysis. When a task has merged, move its file to `docs/archive/tasks/` in naturewatch-app, and point the tick at that copy.

- [x] [task-01-roads-recipe-and-sample.md](../archive/tasks/task-01-roads-recipe-and-sample.md) — naturewatch-analysis
  - *Goal:* Add the roads recipe: the release, the classes kept, the levels, the sprout grid and bands, and the tile encoding. On the laptop, build a sample seed, sprout, and tile archive for a window, such as South Africa or Chad and the Central African Republic. Check the levels against imagery, the look at globe and close zooms, and choose the top zoom. Write the expected global cost and stop for approval.
- [ ] [task-02-roads-seed-and-sprout.md](../tasks/task-02-roads-seed-and-sprout.md) — naturewatch-analysis
  - *Goal:* After approval, write the global seed and the sprout COGs with their VRT and STAC files. Check the sample window against task 01. Record the run cost.
- [ ] [task-03-roads-pmtiles.md](../tasks/task-03-roads-pmtiles.md) — naturewatch-analysis
  - *Goal:* After approval, build the global raster archive from the sprout. Verify, upload with the immutable cache header, and record the run cost.
- [ ] [task-04-roads-on-the-map.md](../tasks/task-04-roads-on-the-map.md) — naturewatch-app
  - *Goal:* Add the Roads layer to the threats group in `layers.json`, painted by share and, at the top zoom, by level and surface. Add its entry to `docs/user/data.md` and its objects to `docs/blueprint.md`. Run the catalog tests. Check it in the browser at a wide and a narrow size.

## Done when

A person can turn on Roads and see the global Overture snapshot as a share zoomed out and by level zoomed in, with paved and unpaved told apart where known. The layer names its release and attribution. The sprout and its STAC files are in place for Stats. The sample was approved before the global runs. Costs are in the step README in naturewatch-analysis. The catalog tests pass. No production deploy.

## Left for later

- **Road stats for places**: share of a place in road cells by level, and distance to road. They wait for the parcel that resumes Stats, which registers the sprout in `sprouts`.
- **Microsoft RoadDetections** as a separate experimental "detected tracks" layer, off by default. It would need a filter for dry riverbeds and sand.
- **Surface from HeiGIT** joined on the OSM way id where Overture has no surface.
- **GRIP4 attributes or geometry** where it is the better source, such as logging roads in the Congo Basin. Its accuracy has to be checked first.
- **Regional logging-road datasets**, such as the Congo Basin roads mapped from Sentinel imagery (Slagter et al.), and recent clearings like those in Suriname.
- **Roads over time.** One Overture release per year would give yearly snapshots. The change between them mostly shows mapping effort, not new roads. HeiGIT Planet 2020 → 2024 can be revisited if its change classes improve.
- **Vector roads up close**, with names and crisp lines, if the enlarged cells past the top zoom are not good enough.
- **Paths** as their own layer.
