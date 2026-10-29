# Using the map

What the published map does today. What each layer shows, and where it stops, is in [Data notes](data.md). How to run the project is in the [README](../../README.md).

The timeline starts at 2016. The last year on the slider is the latest year of any published layer. Each year has a mark on the slider. Play sits beside the year. It steps through the years until the last one, then pauses. It waits until the tiles in view have loaded before the next year. The timeline sits under the map beside the open Places columns. When the list or a profile leaves too little map for it, the timeline is hidden until a column closes.

The map opens as a globe, on Mapbox Standard, with the monochrome theme. The basemap switch changes it to satellite. Zoom, the compass, and Find my location stack at the bottom right. More info sits under Find my location.

Places, Landscape, and Measure each open from a round button. Places is at the top left. Landscape is on the right. Measure is at the bottom right, beside the map controls, and its circle is smaller. Opening any of them shrinks its circle onto the top right corner of its panel and puts a close mark on the photograph. Clicking the small circle closes that panel. The panels start closed.

## Layer groups

The layer buttons sit in a panel on the right of the map, under the heading Landscape, in two groups, **Pressures** and **Environment**. Built, Treeloss, Fire, Crops, Cropland and Dams are under Pressures. Tree height is under Environment. Coming soon layers are not shown.

Each layer has its own visibility button. An active layer has a settings button on the right of that button. The settings card opens to the left of the Landscape panel, for the opacity and the years that layer covers. An info button inside that panel shows the description. The basemap switch and the Labels control stay on the map. They sit at the bottom left, and move to the right of an open Places panel or place profile. Labels sits just above the basemap thumbnail and uses the same off-white button as the other map controls. It turns charcoal while labels are on. They are not part of either group.

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

The search and the place-type buttons sit together on a panel at the left edge of the page. Opening Places shows that panel at the full height of the page, with no map around its outer edge. A place type is charcoal while it is selected and grey while it is not. Click **Protected areas**, **Ecoregions**, or **Countries** to show that list. **Protected areas** lists stored places 50 at a time, largest first, and draws their boundaries. Click it again to clear the list and remove the boundaries. **Ecoregions** and **Countries** say “Well, this is awkward. We have nothing to show.” With no type selected, typing lists stored places whose names start with that text, and does not draw boundaries. With a type selected, search is part of the list query: it changes which places are shown. An empty search shows the places that match the current sort and filters, 50 at a time. Changing the search does not change which boundaries are drawn. From far out, protected areas are solid green patches. Closer in, they become a faint fill with an outline, and places that overlap show as darker areas.

Each protected area is a card with a placeholder photograph, the name, the country, and the area. The area is in whole square kilometres, or at two decimal places below 100 km². A small number to the left of each card is its place in this list, from 1 to the number of cards shown. Scrolling to the bottom loads the next 50. **Sort** opens a menu of five orders: name, size largest or smallest first, and cropland percent highest or lowest first. Default order is largest first. A place without the sorted figure goes last. **In view** limits the list to the current map view. It is off at the start, charcoal while it is on, and does not change which boundaries are drawn. The count beside the buttons reads, for example, “50 of 941 places”, and the first figure grows as more cards load.

**Filter** opens a panel in the middle of the screen with a size range and a cropland range. Each range has a bar chart of the stored places along it. The charts read counts from the database; they do not download every place. Bar heights follow the square root of the count, so a small group still shows. The size range runs on a logarithmic scale from the smallest to the largest stored place. Minimum and Maximum are boxes: type a figure and press Enter, or leave the box, and the slider follows. A typed size is kept exactly, even when it sits between slider steps. The button at the bottom reads “Show 141 places”, and its count changes as you drag or type. Pressing it applies the filter to the list and to the boundaries on the map. Places outside the filter are not drawn and cannot be clicked. Closing the panel with its close mark or Escape keeps the previous filter. **Clear all** returns both ranges to every place without closing the panel. The filter stays on after Places closes, and the Filter button stays charcoal while it is on. Search and **In view** narrow the list only, not the map.

Opening Places shrinks that circle, puts a close mark on the photograph, and sits it on the top right of the list. Clicking the small circle shows Places again and closes the list. Click a place name, or its drawn boundary, to open the profile against the list and highlight that boundary. The profile is the same width and height as the list, with no map between them or around their outer edge. No approved photographs are stored, so its photograph area is a grey placeholder that reads “Camouflaged for now”. When a place has approved photographs, the first fills that area with the photographer and the licence along its foot, and clicking it opens them all full screen. There, the previous and next buttons, the arrow keys, and the thumbnails move between them, each with its photographer, source, and licence. Escape or the close mark returns to the profile. Under the photograph area is the name as a serif title, the country and designation, and the area tag. A close mark at its top right closes it. Under **Zoom to place** are three tabs. **Overview** lists the designation, the country, and the area at two decimal places. **Landscape** shows the stored cropland area for 2024 and its share of the place, or says that cropland has not been calculated for this place. **Species** says “Oops, we have nothing to show you yet.” The source line sits at the bottom of the profile. On a narrow screen the profile sits under the list in the same column, and the column scrolls as one. A boundary click opens the profile even when that place is not yet in the list. When the name is in the list, the list scrolls to it. Click the same name or the same boundary again to clear the selection. Closing the profile leaves the search, the place type, and the map where they are. Zoom to place fits the map to the selected place. A place already in view keeps the map where it is until that control is used. A place outside the view moves the map to it, with room for the open panel. There is no download of the boundary file. A boundary click while Places is closed leaves the list closed and shows the profile on the left, with the Places circle to its right. Closing the small Places circle hides the list. The profile stays full page height at the left edge, and the selected type, the selected place, and the drawn boundaries stay as they are. Opening the circle puts the profile back beside the list. The attribution line sits at the bottom right of the map.

`/places` is still the name list. A name opens `/places/:id` with the same figures.

If the Supabase URL or anon key is missing from the build, the page and the Places panel say the place store is not configured.
