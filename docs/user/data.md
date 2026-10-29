# Data notes

What each published layer shows, and where that reading stops. How to use the controls is in [Using the map](using-the-map.md). Database tables, object paths, and how the app requests tiles are in the [blueprint](../blueprint.md). Transformations, scripts, and run cost are in [docs/pipelines.md](https://github.com/marynvdl/naturewatch-analysis/blob/main/docs/pipelines.md) in marynvdl/naturewatch-analysis.

Years and tile addresses below are what the map catalogue publishes.

## Fire

**Source.** NASA FIRMS.

**Unit.** Count of 14-day windows with a detection, drawn as squares about 1 km across. Display tiles are zooms 0–9. Closer zoom still shows those 1 km squares.

**Coverage.** Africa, Madagascar, and part of the western Indian Ocean. Some of that area is mostly sea. This is not a global layer.

**Calendar.** Windows start on 1 January and repeat every 14 days through 31 December, which is 27 windows. The last window includes about 13 days of the next January. A square can therefore reach 27, and 27 is shown in the same dark red as the top of the legend.

**Missing data.** A transparent square means the count was 0 (no detection in those windows), not “unknown”.

**Limitation.** Repeated detections are not the same as a measured burned area, and they do not identify a cause.

Years 2016–2024 were produced by an earlier method than the current export. FIRMS is sometimes reprocessed, so a later export of an old year can differ. The count, the grid, and the tile build are in [docs/pipelines.md](https://github.com/marynvdl/naturewatch-analysis/blob/main/docs/pipelines.md) in marynvdl/naturewatch-analysis.

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

**Not verified here.** Pixel values, resolution, and geographic coverage of those 2015 and 2019 tiles are not described in this repository. They are a different product from the 2024 cropland layer.

## Cropland

**Source named in the catalog.** UMD GLAD annual cropland, https://glad.umd.edu/dataset/annual-croplands. One snapshot, 2024, clipped to South Africa. This is a different product from the Crops snapshots above.

**Tile address.** `https://storage.googleapis.com/nature-watch-tiles/cropland/2024/v1/{z}/{x}/{y}.png`. Zooms 0–12. A missing tile is empty. Beyond zoom 12 the map enlarges zoom 12 with nearest resampling.

**Values.** Each pixel is an 8-bit gray value plus alpha. Gray 1 is cropland and gray 0 is other land. Alpha 0 is nodata, including land outside South Africa. The files are not coloured. The map is set to colour class 1 orange (`#e59139`) and leave class 0 clear.

**Browser read.** Mapbox asks for each tile with a browser read. The bucket allows `https://naturewatch.fly.dev`, `http://localhost:5173`, and `http://127.0.0.1:5173`. A response saved before that permission existed is reused for up to an hour and then fails in the console even though a new request would succeed. The catalog tile addresses end in `?v=1` so the map does not reuse those saved responses.

**Year.** 2024 only. A later timeline year still requests 2024. A year before 2024 does not request the layer.

**Places.** Stored figures for the pilot protected areas use sprout `cropland-2024-v1` and method `area-weighted-spheroid-v1`. The place page, the map popup, and the profile’s Landscape tab show the cropland `area_km2` to two decimal places and `percent` to one. The size of the place is a different number, `pilot_places.area_km2`. The profile’s Overview shows it to two decimal places. The profile tag and the list cards show it in whole square kilometres, or to two decimal places below 100 km². The list’s sort and filter use the same two stored figures. A place with no cropland fact passes the cropland filter only while that range covers 0–100%. Every stored place has one today. The map draws the stored boundary from `pilot_place_map`. The app does not offer a polygon download.

## Dams

Circle tiles from the Mapbox tileset `nature-watch.dam-test-tiles`. The catalog marks the years 2016–2022 as `static`. A static layer stays on the map when the timeline is earlier than every listed year, using the latest listed year. The timeline starts in 2016, which is also the first year dams list, so that case does not arise for dams. The URL has no year, so the points stay the same as the timeline moves.

The source dataset, the date of the points, and what each point represents are not named in the catalog.

## Layers that are not data

All, bare ground, mines, and rivers have status `coming-soon`. Bare ground’s tile URL points at `built/2022`. Mines, rivers, and All point at a Stamen watercolor basemap. Those URLs are placeholders.
