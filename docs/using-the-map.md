# Using the map

What the published map does today. How the data are made is in [Data notes](data.md). How to run the project is in the [README](../README.md).

The timeline starts at 2016. The last year on the slider is the latest year of any published layer.

## Layer groups

The drawer has two groups, **Threats** and **Interest**. All, Built, Treeloss, Fire, Bare, Mines, Crops, Rivers and Dams are under Threats. Tree height is under Interest.

Each layer still has its own visibility button and opacity control. Coming soon layers stay disabled. The basemap switch and label control stay on the map. They are not part of either group.

## When the year and the layer disagree

The year you pick is not always the year a layer shows.

If a layer has no data for the selected year, the map requests the latest year that layer does have, as long as that year is earlier. The screen does not say that this substitution happened. Example: crops exist for 2015 and 2019. With the timeline on 2025, crops still show 2019. Fire has a 2025 layer, so fire shows 2025.

If every published year for a layer is later than the selected year, that layer is not requested. A layer marked static is the exception: it stays visible and uses its latest listed year. Tree height is static and only lists 2020, so changing the timeline does not change its tiles. The button matches the other layer buttons. The year is in the About text, and it also appears when you hover the button.

## What a colour means

A colour means the source dataset recorded something in that square or at that point. It does not, by itself, explain the cause.

| Layer | What you see | What it is not |
| --- | --- | --- |
| Fire | How many 14-day windows in the year had a NASA FIRMS detection, drawn as squares about 1 km across. Yellow is 1, orange is 2–3, red is 4–8, dark red is 9 or more. | Not a cause. Not a burned-area map in hectares. |
| Tree loss | Loss from 2001 through the selected year. | Not automatically deforestation. The dataset includes fire and forestry. |
| Tree height | Estimated canopy height in 2020, in metres. Pale green is about 3 m, mid green about 15 m, and dark green about 30 m or taller. The colours are already in the tiles. | Not a measurement of every tree. Canopy below 3 m is not drawn, and heights above 30 m are not separated. |
| Built | Buildings in the 2023 snapshot, including a 2020 fill where the main source has no coverage. | Not a use (home, mine, road). Other timeline years still show 2023. |
| Crops | Cropland class in 2015 or 2019. | Not crop type or yield. Later timeline years still show 2019. |
| Dams | The same points for 2016–2022. | The catalog does not name the source. The points do not change with the year. |

All, bare ground, mines, and rivers are marked “Coming soon”. They are not published layers.

## Reading the About text

Each layer’s About text is the `info` field in `frontend/naturewatch/src/catalog/layers.json`. “Coming soon” on a card replaces the year list. A custom subtitle does the same, which is why dams show “Same points every year” instead of nine separate years. Tree height has no custom subtitle, so the card shows 2020. The legend, source and limits are in that card.
