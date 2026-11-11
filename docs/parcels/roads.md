# Parcel: Roads

The first roads pressure layer. One global snapshot of roads from Overture Maps, classed by how much impact a road has, drawn from one vector PMTiles archive.

*Written 11 November 2026.*

## Goal

A person can turn on a Roads layer in the threats group and see the world's mapped roads. The layer distinguishes a motorway from a main road, a minor road, and a track. Where the surface is known, it distinguishes paved from unpaved. The layer says which Overture release it shows.

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

Every feature keeps Overture's own `class`, so roads can be reclassed later without rebuilding. The tiles also carry a derived `level` that the map styles. A first proposal:

| `level` | Overture `class` |
| --- | --- |
| `major` | `motorway`, `trunk` |
| `main` | `primary`, `secondary`, `tertiary` |
| `minor` | `residential`, `living_street`, `service`, `unknown`, and `unclassified` when paved |
| `track` | `track`, and `unclassified` when unpaved or the surface is not given |

`surface` is `paved`, `unpaved`, or left off, read from Overture `road_surface`. A road whose surface changes along its length takes the value that covers most of it.

Paths are left out of this layer: `footway`, `path`, `steps`, `cycleway`, `bridleway`, and `pedestrian`.

Task 01 checks the levels on the sample before anything is built globally. This parcel shows the snapshot only. Each feature also keeps its OSM way id and its name, so other sources can later be joined on that id.

## Tiles and map

- One vector PMTiles archive with layer `roads`, built with Tippecanoe 2.79.0. The image `places/Dockerfile` defines in naturewatch-analysis can be reused.
- Object: `gs://nature-watch-tiles/roads/overture-2026-10-21/roads.pmtiles`. The release goes in the path, so a later release is a new object.
- Fields on each feature: `level`, `class`, `surface` when known, `name` when known, and `osm_id`.
- The zoom at which each level first appears is set in task 01, from tile sizes on the sample. Major roads appear first and tracks last.
- The map stays Mapbox. Colour and line width come from `level`. Unpaved roads are drawn differently from paved roads. The catalog marks the layer as a snapshot, not a time series.
- Attribution: © OpenStreetMap contributors, Overture Maps Foundation. The transportation theme is ODbL.

## Cost

Reading Overture from its public bucket has no transfer cost to us. The global build probably needs a Batch machine, like the places archive.

Task 01 runs on the laptop. It records the sample's archive bytes, wall time, and peak memory, and the largest tile per zoom. From those it writes an expected cost for the global run, then waits for approval. Task 02 records the run in the step README in naturewatch-analysis.

## Tasks

Do one task at a time, in this order. Start a task only after the one above it has merged. Each task is one branch and one pull request into `develop` in naturewatch-app, or into `main` in naturewatch-analysis. When a task has merged, move its file to `docs/archive/tasks/` in naturewatch-app, and point the tick at that copy.

- [ ] [task-01-roads-recipe-and-sample.md](../tasks/task-01-roads-recipe-and-sample.md) — naturewatch-analysis
  - *Goal:* Add the roads recipe: the release, the classes kept, the levels, and the zoom per level. Build a sample archive on the laptop for a window, such as South Africa or Chad and the Central African Republic. Check the levels and tile sizes, write the expected global cost, and stop for approval.
- [ ] [task-02-roads-global-pmtiles.md](../tasks/task-02-roads-global-pmtiles.md) — naturewatch-analysis
  - *Goal:* After approval, build the global archive and upload it. Record the run cost.
- [ ] [task-03-roads-on-the-map.md](../tasks/task-03-roads-on-the-map.md) — naturewatch-app
  - *Goal:* Add the Roads layer to the threats group in `layers.json`, styled by level and surface. Add its entry to `docs/user/data.md` and its object to `docs/blueprint.md`. Check it in the browser at a wide and a narrow size.

## Done when

A person can turn on Roads and see the global Overture snapshot styled by level, with paved and unpaved told apart where known. The layer names its release and attribution. The sample was approved before the global build. Costs are in the step README in naturewatch-analysis. The catalog tests pass. No production deploy.

## Left for later

- **Microsoft RoadDetections** as a separate experimental "detected tracks" layer, off by default. It would need a filter for dry riverbeds and sand.
- **Surface from HeiGIT** joined on the OSM way id where Overture has no surface.
- **GRIP4 attributes or geometry** where it is the better source, such as logging roads in the Congo Basin. Its accuracy has to be checked first.
- **Regional logging-road datasets**, such as the Congo Basin roads mapped from Sentinel imagery (Slagter et al.), and recent clearings like those in Suriname.
- **Roads over time.** One Overture release per year would give yearly snapshots. The change between them mostly shows mapping effort, not new roads. HeiGIT Planet 2020 → 2024 can be revisited if its change classes improve.
- **Paths** as their own layer.
- **A road density or distance-to-road raster** for place facts.
