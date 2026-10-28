# Using the map

What the published map does today. What each layer shows, and where it stops, is in [Data notes](data.md). How to run the project is in the [README](../../README.md).

The timeline starts at 2016. The last year on the slider is the latest year of any published layer. Each year has a mark on the slider. Play sits beside the year. It steps through the years until the last one, then pauses. It waits until the tiles in view have loaded before the next year.

The map opens as a globe, on Mapbox Standard, with the monochrome theme. The basemap switch changes it to satellite. Zoom, the compass, and Find my location stack at the bottom right. More info sits under Find my location.

Places, Landscape, and Measure each open from a round button. Places is at the top left. Landscape is on the right, level with its open panel, so opening it slides sideways. Measure is at the bottom right, beside the map controls, and its circle is smaller. Opening it slides the circle under the left side of the panel. The panels start closed. The part of the circle that stays in view closes that panel.

## Layer groups

The layer buttons sit in a panel on the right of the map, under the heading Landscape, in two groups, **Pressures** and **Environment**. Built, Treeloss, Fire, Crops, Cropland and Dams are under Pressures. Tree height is under Environment. Coming soon layers are not shown.

Each layer has its own visibility button. An active layer has a settings button on the right of that button. The settings card opens to the left of the Landscape panel, for the opacity and the years that layer covers. An info button inside that panel shows the description. The basemap switch and the Labels control stay on the map, at the bottom left. Labels sits just above the basemap thumbnail and uses the same off-white button as the other map controls. It turns charcoal while labels are on. They are not part of either group.

## When the year and the layer disagree

The year you pick is not always the year a layer shows.

If a layer has no data for the selected year, the map requests the latest year that layer does have, as long as that year is earlier. The screen does not say that this substitution happened. Example: crops exist for 2015 and 2019. With the timeline on 2025, crops still show 2019. Cropland exists for 2024, so 2025 still shows 2024. Fire has a 2025 layer, so fire shows 2025.

If every published year for a layer is later than the selected year, that layer is not requested. Cropland is one case: with the timeline on 2016 it is not drawn. A layer marked static is the exception: it stays visible and uses its latest listed year. Tree height is static and only lists 2020, so changing the timeline does not change its tiles. The button matches the other layer buttons. The year is in the About text, and it also appears when you hover the button. Cropland’s button says 2024.

## What a colour means

A colour means the source dataset recorded something in that square or at that point. It does not, by itself, explain the cause.

| Layer | What you see | What it is not |
| --- | --- | --- |
| Fire | How many 14-day windows in the year had a NASA FIRMS detection, drawn as squares about 1 km across. Yellow is 1, orange is 2–3, red is 4–8, dark red is 9 or more. | Not a cause. Not a burned-area map in hectares. |
| Tree loss | Loss from 2001 through the selected year. | Not automatically deforestation. The dataset includes fire and forestry. |
| Tree height | Estimated canopy height in 2020, in metres. Pale green is about 3 m, mid green about 15 m, and dark green about 30 m or taller. The colours are already in the tiles. | Not a measurement of every tree. Canopy below 3 m is not drawn, and heights above 30 m are not separated. |
| Built | Buildings in the 2023 snapshot, including a 2020 fill where the main source has no coverage. | Not a use (home, mine, road). Other timeline years still show 2023. |
| Crops | Cropland class in 2015 or 2019. | Not crop type or yield. Later timeline years still show 2019. |
| Cropland | Cropland class in 2024, for South Africa. Orange is class 1. The tiles store the class, and the map applies the colour. Other land stays clear. | Not the 2015 or 2019 crops snapshots. Not crop type or yield. Years before 2024 do not show it. Closer than zoom 12 enlarges the zoom 12 tiles. |
| Dams | The same points for 2016–2022. | The catalog does not name the source. The points do not change with the year. |

All, bare ground, mines, and rivers are marked “Coming soon”. They are not published layers.

## Reading the About text

Each layer’s About text is the `info` field in `frontend/naturewatch/src/catalog/layers.json`. “Coming soon” on a card replaces the year list. A custom subtitle does the same, which is why dams show “Same points every year” instead of nine separate years. Tree height has no custom subtitle, so the card shows 2020. The legend, source and limits are in that card.

## Measure

Length and area sit in a Measure panel at the bottom right, to the left of the map controls. Line measures distance. Area measures a polygon. Delete removes the selected measurement. Delete all clears every measurement.

## Places

The search and the place-type buttons sit together on a panel at the top left. The list sits under those buttons. **Protected areas** starts selected and lists the stored places. Search matches the place name. An empty search shows every place of the selected type. **Ecoregions** and **Countries** can be selected. Each says that none are stored.

Click **Protected areas** while it is already selected to draw the pilot protected areas on the map, using the stored boundary. Click it again to remove them. Changing the search or the place type does not download the boundaries again. There is no download. Click a shape for the name, the stored cropland square kilometres and percent, the WDPCA release month, attribution, and a Protected Planet link. The attribution line sits at the bottom right of the map.

`/places` is still the name list. A name opens `/places/:id` with the same figures.

If the Supabase URL or anon key is missing from the build, the page and the Places panel say the place store is not configured.
