# Data notes

What the published layers measure, and what this repository can and cannot vouch for. How to read the map is in [Using the map](using-the-map.md). Pipeline and storage are in the [blueprint](blueprint.md).

Years and tile addresses below are from `frontend/naturewatch/src/catalog/layers.json` on the app’s `main` branch. Fire processing details are from `naturewatch-analysis` `origin/main` at `ec9746c` (`gee/fire/export_fire.py`, `gee/README.md`, `tasks/fireTiles/color.txt`). That analysis checkout is not the copy currently checked out on this machine.

## Fire

**Source.** NASA FIRMS, Earth Engine collection `FIRMS`, band `T21`.

**Unit.** Count of 14-day windows with a detection, on a 1 km grid (`EPSG:3857`, scale 1,000 m). The files are exported as 30 m COGs in `EPSG:4326`, then the tile build samples them back to 1 km. Display tiles are zooms 0–9. The app enlarges zoom 9 with nearest-neighbour, so closer zoom still shows the 1 km squares.

**Coverage.** 25 blocks of 15° in `gee/blocks/africa_blocks.geojson` (Africa, Madagascar, and part of the western Indian Ocean). Some blocks are mostly sea. This is not a global layer.

**Calendar.** Windows start on 1 January and repeat every 14 days through 31 December, which is 27 windows. The last window includes about 13 days of the next January. A pixel can therefore reach 27. The colour table in `tasks/fireTiles/color.txt` lists values through 26; GDAL’s colour relief uses the last colour for anything higher, so 27 is dark red as well.

**Missing data.** A transparent square means the count was 0 (no detection in those windows), not “unknown”.

**Limitation.** Repeated detections are not the same as a measured burned area, and they do not identify a cause.

Years 2016–2024 were produced by the earlier notebook method. The Python export was checked against that method for 2024 blocks 1 and 14 (recorded in `gee/README.md`). Those two blocks were not re-compared for this documentation pass. FIRMS is sometimes reprocessed, so a later export of an old year can differ.

## Tree loss

**Source.** UMD GLAD tree cover loss, version string `v1.13` in the tile URL, served by Global Forest Watch. This app does not build these tiles.

**Unit.** Cumulative loss from 2001 through the year in the tile query (`start_year=2001`, `end_year` set to the timeline year, or to the fallback year).

**Years in the catalog.** 2016–2025. The catalog text says version 1.13 adds 2025 and revises earlier years. That sentence is stored in the app; this repository does not contain the GLAD changelog.

**Not verified here.** An older About text said the map keeps only places with tree cover above 30%. The tile URL has no density parameter. Whether version 1.13 is already filtered that way has to be confirmed against Global Forest Watch, not against this code.

## Built

**Source named in the catalog.** Google Open Buildings 2023, confidence 0.80 or higher, and GHSL 2020 where Open Buildings has no coverage. The catalog names Chad, Mali, Libya, Morocco, and Western Morocco for that fill. Those country names are catalog text; the geometry of the fill is not in this repository.

**Year.** One snapshot, 2023. The tile URL has no `{year}` placeholder, so every timeline year requests the same tiles.

**Not in the map.** The previous About text described older built layers (Open Buildings 2021–2022 and Dynamic World). Those years are not in `years.available`.

## Crops

**Source named in the catalog.** UMD GLAD Global Cropland Expansion, https://glad.umd.edu/dataset/croplands. The catalog calls 2015 and 2019 snapshots. Tile URL pattern: `https://storage.googleapis.com/nature-watch-tiles/crop/{year}/{z}/{x}/{y}.png`.

**Not verified here.** Pixel values, resolution, and geographic coverage of those tiles are not described in this repository. The analysis repo has a crop tile task (`tasks/createCropTiles/`) that starts a virtual machine; this pass did not read its colour table or source paths as a dataset definition.

## Dams

Circle tiles from the Mapbox tileset `nature-watch.dam-test-tiles`. The catalog marks the years 2016–2022 as `static`, and the schema describes `meaning` as documentation only: the map code does not branch on it. The URL has no year, so the points stay the same as the timeline moves.

The source dataset, date of the points, and what each point represents are not in the catalog or in the app code. `mapbox_recipes/damsRecipe.json` in the analysis repo was not opened for this pass.

## Layers that are not data

All, bare ground, mines, and rivers have status `coming-soon`. Bare ground’s tile URL points at `built/2022`. Mines, rivers, and All point at a Stamen watercolor basemap. Those URLs are placeholders.
