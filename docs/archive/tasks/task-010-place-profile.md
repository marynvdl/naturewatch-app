# Task 010 — Place profile

Archived. This task is not active.

Parcel: [Budding Places](../../parcels/budding-places.md)

Repository: naturewatch-app. Start only after task 009 has merged.

## Goal

To have a simple, functional and beautiful place list and place profile, while the rest of the layout remains intact and seamless.

Overview, Disturbances, and Species. Overview shows the stored name, designation, country, area, and source. Disturbances shows the stored cropland fact, or that it is not stored. Species says that no species records are stored, and does not say the place has none.

## Facts already stored

The place size is `pilot_places.area_km2`. Cropland is `facts.area_km2` and `facts.percent` for sprout `cropland-2024-v1` and method `area-weighted-spheroid-v1`. Those are different numbers.

Shown square kilometres use two decimal places. Do not show hectares. The source line is the WDPCA release already returned with the place. There is no stored description and no species table.

## Do this

- Establish one consistent layout system rather than letting individual components control their own widths and positions. Consider CSS Grid.
- Repair the Labels button, the text is currently off-center and no longer capitalised.
- Change the "Search protected areas, countries..." to "Search places" and to sans-serif font.
- Place list:
  - Improve the list view by changing items into cards with a photo, name, country and area.
- Place profile:
  - Ensure the width of this panel is the same as that of the place list
  - Have a placeholder image at the top. For now, use a neutral placeholder where we don't have photos (which would be everywhere). Task 011 builds the photo viewer further out.
  - The name in Serif font underneath the image
  - Underneath the name, the country and the designation.
  - To the right in a tag have the area in km2 rounded to zero decimals, unless area is smaller than 100km2 where you should use two decimals.
  - Underneath this have three buttons: Zoom to place.
  - Have tabs underneath this: Overview, Landscape, and Species.
    - Landscape shows the stored cropland square kilometres and percent. When that fact is missing, say that it is not calculated. 
    - Species says that "Oops, we have nothing to show you yet".

- Use the screenshot for inspiration, but follow this app's defined style.
- Ask me for visual approval.
- Ask me when you are not 90% sure.

## Do not

- Do not add a database migration.
- Do not invent places, descriptions, photographs, or measurements unless explicitely asked.
- Do not download the boundary again to fill the profile.
- Do not start task 011.

## Done when

- The places list and profile are functional and beautiful.
- I approve the design.
- I can scroll down the place list, click on a card and a profile opens that shows Overview, Landscape and Species.
- A place with a cropland fact shows that fact under Landscape. A place without one says the fact is not stored.
- Species does not claim that a place has no species.
- New tests cover those three texts. The catalog tests still pass.
- The profile has been read in the browser on a wide screen and a narrow screen.
- The other components are still behaving as expected and are not squashed, hidden or pushed of screen.
- The work is on a branch from `develop`, in one pull request into `develop`. Report the pull request address. Do not merge it.

## How to work

Branch from `develop`. Do this task only. No cloud processing and no production deploy. Do not commit secrets. Do not add an AI or tool attribution to the commit or the pull request.
