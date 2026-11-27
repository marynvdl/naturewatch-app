# Parcel: Oil and Gas

A [Threat Layers](threat-layers.md) parcel. One Oil and gas layer in the Pressures group shows pipelines, wells, and facilities, with each pipeline's name, owner, parent company, and start year on click.

*Started 27 November 2026 as notes. Not defined yet. It follows [Mines](mines.md).*

## Notes

- **Pipelines from Global Energy Monitor**, the oil and gas infrastructure trackers. They track long-distance pipelines project by project, including proposed and under-construction ones, with consistent attributes and a route accuracy per line. CC BY 4.0. The data is downloaded through a form, so the user downloads it.
- **Wells and facilities from OGIM v2.7** (Environmental Defense Fund and MethaneSAT, September 2025, CC BY 4.0, on Zenodo and in Earth Engine). It has about 4.5 million wells, compressor stations, processing plants, refineries, LNG terminals, 2021 flaring detections, and field and licence-block polygons. Its attributes vary by government source, and the catalog page gives no field list, so the schema is read from the Zenodo record.
- **OGIM pipelines** are compared with Global Energy Monitor's in a few regions against imagery before Global Energy Monitor is confirmed.
- **Sprouts.** Probably `pipelines` and `oil-gas-sites`.
- **Tiles.** Vector.

## Open questions

- Whether pipeline routes are accurate enough at 28 m, or need a buffer.
- Which OGIM categories become the layer, and whether licence blocks are shown.
- Whether OGIM's coverage outside countries with open government data is good enough.

## Tasks

None yet.
