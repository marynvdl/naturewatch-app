# Parcel: Water

A [Threat Layers](threat-layers.md) parcel. One Water layer in the Pressures group shows dams and reservoirs, water pipelines and canals, water and sewage treatment plants, and pumping stations, each with its operator and attributes on click.

*Started 27 November 2026 as notes. Not defined yet. It follows [Energy](energy.md).*

## Notes

- **It replaces the current Dams layer.** That layer draws the Mapbox tileset `nature-watch.dam-test-tiles`, and its source is not named ([data.md](../user/data.md#dams)). The new layer keeps the id `dams` or retires it. To decide when the parcel is defined.
- **Dams from a dam dataset.** GOODD, GRanD, or Global Dam Watch, compared first. GRanD and Global Dam Watch carry name, river, year, height, and main use, and reservoir polygons. The rest from OpenStreetMap through Overture, perhaps from the Energy seed.
- **Sprouts.** Probably `dams` with reservoirs, and `water-works` with pipelines, canals, and plants. Canals may belong with rivers rather than here.
- **Tiles.** Vector, likely all of it.

## Open questions

- Whether reservoirs are drawn, or only the dam point.
- How complete OpenStreetMap water features are outside Europe and North America.
- Whether the Rivers placeholder (fragmentation, flow) belongs in this parcel.

## Tasks

None yet.
