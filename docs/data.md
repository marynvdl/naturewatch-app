# Data notes

What a published layer measures. How to read the map is in [Using the map](using-the-map.md).

## Tree height

**Source.** University of Maryland GLAD tree cover height for 2020, dataset `umd_tree_cover_height_2020`, version `v2022`, served by Global Forest Watch. Checked against the [GFW Data API](https://data-api.globalforestwatch.org/dataset/umd_tree_cover_height_2020) on 16 October 2026. `v2022` is the version that API marks latest. Global Forest Watch’s own map uses this same dataset and version.

**Tile address.** `https://tiles.globalforestwatch.org/umd_tree_cover_height_2020/v2022/tch_3/{z}/{x}/{y}.png`

The `tch_3` tiles are the published rendering of canopy at least 3 m. The same version also publishes cutoffs at 4, 5, 7, 10, 15 and 20 m. Global Forest Watch’s map opens on the 5 m cutoff and lets the reader change it. This map keeps the 3 m cutoff so the light end of the legend is what is drawn. An older version, `v2022.1`, is still in the API. Its tile caches are not the coloured layer the map serves, so they are not used here.

**Colours.** The PNG tiles already contain the colours. A sample tile is a green ramp, not a single flat green, and not a value a browser style can recolour. The legend on the Global Forest Watch map is pale green at 3 m (`rgb(230, 240, 230)`), mid green at 15 m (`rgb(130, 180, 130)`), and dark green at 30 m (`rgb(0, 102, 0)`).

**Unit.** Metres of estimated canopy height. The source metadata describes a 30 m model calibrated on GEDI relative height at 95%.

**Year.** 2020 only. The dataset also has a 2000 map. This app does not show it. The timeline does not change the 2020 tiles.

**Coverage.** Global, with prototype data north of 52°N, as stated in the dataset metadata. This is not limited to the Africa blocks used for fire.

**Method note.** The dataset metadata cites Potapov et al. 2021, [doi:10.1016/j.rse.2020.112165](https://doi.org/10.1016/j.rse.2020.112165), and points to the [GLAD 2000–2020 land-cover dataset](https://glad.umd.edu/dataset/GLCLUC2020) for further description. That page says the 2019 canopy-height model was applied to 2000 and 2020. The separate [GLAD 2019 canopy-height page](https://glad.umd.edu/dataset/gedi) is background for the model. It is not the record of this 2020 tile version.

**Licence.** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution is the Potapov et al. 2021 paper and Global Forest Watch as the tile host.

**Limits.** The source says the model can overestimate height on slopes, including in New Zealand and Lesotho, and can mix building height with tree height in cities. It saturates above 30 m, so taller canopy is not separated. Canopy below 3 m is not drawn. Heights are estimates, not a field measurement of every tree.
