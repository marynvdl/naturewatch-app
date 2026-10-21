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

## Tree height

**Source.** University of Maryland GLAD tree cover height for 2020, dataset `umd_tree_cover_height_2020`, version `v2022`, served by Global Forest Watch. Checked against the [GFW Data API](https://data-api.globalforestwatch.org/dataset/umd_tree_cover_height_2020) on 16 October 2026. `v2022` is the version that API marks latest. Global Forest Watch’s own map uses this same dataset and version.

**Tile address.** `https://tiles.globalforestwatch.org/umd_tree_cover_height_2020/v2022/tch_3/{z}/{x}/{y}.png`

The `tch_3` tiles are the published rendering of canopy at least 3 m. The same version also publishes cutoffs at 4, 5, 7, 10, 15 and 20 m. Global Forest Watch’s map opens on the 5 m cutoff and lets the reader change it. This map keeps the 3 m cutoff so the light end of the legend is what is drawn. An older version, `v2022.1`, is still in the API. Its tile caches are not the coloured layer the map serves, so they are not used here.

**Colours.** The PNG tiles already contain the colours. A sample tile is a green ramp, not a single flat green, and not a value a browser style can recolour. The legend on the Global Forest Watch map is pale green at 3 m (`rgb(230, 240, 230)`), mid green at 15 m (`rgb(130, 180, 130)`), and dark green at 30 m (`rgb(0, 102, 0)`).

**Unit.** Metres of estimated canopy height. The source metadata describes a 30 m model calibrated on GEDI relative height at 95%.

**Year.** 2020 only. The dataset also has a 2000 map. This app does not show it. The catalog marks the year `static`, so the timeline does not change the 2020 tiles, including when the selected year is before 2020.

**Coverage.** Global, with prototype data north of 52°N, as stated in the dataset metadata. This is not limited to the Africa blocks used for fire.

**Method note.** The dataset metadata cites Potapov et al. 2021, [doi:10.1016/j.rse.2020.112165](https://doi.org/10.1016/j.rse.2020.112165), and points to the [GLAD 2000–2020 land-cover dataset](https://glad.umd.edu/dataset/GLCLUC2020) for further description. That page says the 2019 canopy-height model was applied to 2000 and 2020. The separate [GLAD 2019 canopy-height page](https://glad.umd.edu/dataset/gedi) is background for the model. It is not the record of this 2020 tile version.

**Licence.** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution is the Potapov et al. 2021 paper and Global Forest Watch as the tile host.

**Limits.** The source says the model can overestimate height on slopes, including in New Zealand and Lesotho, and can mix building height with tree height in cities. It saturates above 30 m, so taller canopy is not separated. Canopy below 3 m is not drawn. Heights are estimates, not a field measurement of every tree.

## Built

**Source named in the catalog.** Google Open Buildings 2023, confidence 0.80 or higher, and GHSL 2020 where Open Buildings has no coverage. The catalog names Chad, Mali, Libya, Morocco, and Western Morocco for that fill. Those country names are catalog text; the geometry of the fill is not in this repository.

**Year.** One snapshot, 2023. The tile URL has no `{year}` placeholder, so every timeline year requests the same tiles.

**Not in the map.** The previous About text described older built layers (Open Buildings 2021–2022 and Dynamic World). Those years are not in `years.available`.

## Crops

**Source named in the catalog.** UMD GLAD Global Cropland Expansion, https://glad.umd.edu/dataset/croplands. The catalog calls 2015 and 2019 snapshots. Tile URL pattern: `https://storage.googleapis.com/nature-watch-tiles/crop/{year}/{z}/{x}/{y}.png`.

**Not verified here.** Pixel values, resolution, and geographic coverage of those tiles are not described in this repository. The crop tile task used to live at `tasks/createCropTiles/` and started a virtual machine. It is retired, in `archive/vm-tile-tasks/createCropTiles/`. This pass did not read its colour table or source paths as a dataset definition.

## Dams

Circle tiles from the Mapbox tileset `nature-watch.dam-test-tiles`. The catalog marks the years 2016–2022 as `static`. A static layer stays on the map when the timeline is earlier than every listed year, using the latest listed year. The timeline starts in 2016, which is also the first year dams list, so that case does not arise for dams. The URL has no year, so the points stay the same as the timeline moves.

The source dataset, date of the points, and what each point represents are not in the catalog or in the app code. `mapbox_recipes/damsRecipe.json` in the analysis repo was not opened for this pass.

## Layers that are not data

All, bare ground, mines, and rivers have status `coming-soon`. Bare ground’s tile URL points at `built/2022`. Mines, rivers, and All point at a Stamen watercolor basemap. Those URLs are placeholders.
