/** Sprout whose stored cropland figures the place page shows. */
export const CROPLAND_SPROUT_ID = 'cropland-2024-v1';

/** Formula used for those stored figures. */
export const CROPLAND_METHOD_ID = 'area-weighted-spheroid-v1';

/** Shown wherever a protected area is named. */
export const PROTECTED_AREA_ATTRIBUTION =
  'UNEP-WCMC and IUCN. World Database on Protected and Conserved Areas.';

/**
 * Cropland square kilometres, to one hectare.
 * @param km2 - Stored area.
 * @returns Two decimal places.
 */
export function formatKm2(km2: number): string {
  return km2.toFixed(2);
}

/**
 * Cropland percent, to one decimal place.
 * @param percent - Stored percent.
 * @returns One decimal place.
 */
export function formatPercent(percent: number): string {
  return percent.toFixed(1);
}

/**
 * Release month from a date stored as the first day of that month.
 * @param isoDate - `YYYY-MM-DD`.
 * @returns Month and year, such as October 2026.
 */
export function formatReleaseMonth(isoDate: string): string {
  const [year, month] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/**
 * Protected Planet page for a WDPCA site id.
 * @param siteId - `places.site_id`.
 * @returns The public place page.
 */
export function protectedPlanetUrl(siteId: string): string {
  return `https://www.protectedplanet.net/${encodeURIComponent(siteId)}`;
}

/**
 * Names that contain the query, ignoring case and surrounding spaces.
 * @param places - Places to filter.
 * @param query - Text typed in the list.
 * @returns The matching places, in the same order.
 */
export function placesMatching<T extends { name: string }>(
  places: T[],
  query: string
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return places;
  return places.filter(place =>
    place.name.toLocaleLowerCase().includes(needle)
  );
}

/** West, south, east, north. */
export type LngLatBounds = [number, number, number, number];

/**
 * The extent of a stored boundary.
 * @param geometry - A polygon or multipolygon.
 * @returns West, south, east, north, or null when the shape has no positions.
 */
export function geometryBounds(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
): LngLatBounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  polygons.forEach(polygon => {
    polygon.forEach(ring => {
      ring.forEach(([lng, lat]) => {
        if (lng < west) west = lng;
        if (lng > east) east = lng;
        if (lat < south) south = lat;
        if (lat > north) north = lat;
      });
    });
  });
  if (!Number.isFinite(west)) return null;
  return [west, south, east, north];
}

/**
 * Whether a place sits entirely inside the current map view.
 * @param frame - The map view, west, south, east, north.
 * @param place - The place extent.
 * @returns True when the place does not cross the view.
 */
export function boundsInsideFrame(
  frame: LngLatBounds,
  place: LngLatBounds
): boolean {
  return (
    place[0] >= frame[0] &&
    place[2] <= frame[2] &&
    place[1] >= frame[1] &&
    place[3] <= frame[3]
  );
}

/** One stored boundary from `pilot_place_map`. */
export interface PlaceBoundary {
  id: string;
  name: string;
  site_id: string | null;
  source_name: string;
  release_month: string;
  geom: GeoJSON.MultiPolygon | null;
}

/** Stored cropland figure joined onto a boundary for the popup. */
export interface PlaceFactRow {
  place_id: string;
  area_km2: number;
  percent: number;
}

/** Properties Mapbox keeps on each drawn place. */
export interface PlaceFeatureProperties {
  id: string;
  name: string;
  siteId: string | null;
  sourceName: string;
  releaseMonth: string;
  croplandKm2: number | null;
  percent: number | null;
}

/** GeoJSON the map draws. There is no file download of this shape. */
export type PlaceFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.MultiPolygon,
  PlaceFeatureProperties
>;

/**
 * Join stored boundaries to the stored cropland figures.
 * A boundary with no geometry is left out.
 * @param boundaries - Rows from `pilot_place_map`.
 * @param facts - Cropland rows for the same places.
 * @returns The feature collection drawn on the map.
 */
export function buildPlaceFeatures(
  boundaries: PlaceBoundary[],
  facts: PlaceFactRow[]
): PlaceFeatureCollection {
  const byPlace = new Map(facts.map(fact => [fact.place_id, fact]));
  return {
    type: 'FeatureCollection',
    features: boundaries.flatMap(boundary => {
      if (!boundary.geom) return [];
      const fact = byPlace.get(boundary.id);
      return [
        {
          type: 'Feature' as const,
          geometry: boundary.geom,
          properties: {
            id: boundary.id,
            name: boundary.name,
            siteId: boundary.site_id,
            sourceName: boundary.source_name,
            releaseMonth: boundary.release_month,
            croplandKm2: fact?.area_km2 ?? null,
            percent: fact?.percent ?? null,
          },
        },
      ];
    }),
  };
}

/**
 * Popup text for one clicked place.
 * @param properties - Feature properties from the map.
 * @returns The lines and the Protected Planet address, when a site id exists.
 */
export function placePopupContent(properties: PlaceFeatureProperties): {
  name: string;
  figure: string;
  release: string;
  attribution: string;
  protectedPlanet: string | null;
} {
  const figure =
    properties.croplandKm2 !== null && properties.percent !== null
      ? `Cropland: ${formatKm2(properties.croplandKm2)} km² (${formatPercent(properties.percent)}%)`
      : 'No cropland figure is stored for this place.';
  return {
    name: properties.name,
    figure,
    release: `Release month: ${formatReleaseMonth(properties.releaseMonth)}`,
    attribution: `${properties.sourceName}. ${PROTECTED_AREA_ATTRIBUTION}`,
    protectedPlanet: properties.siteId
      ? protectedPlanetUrl(properties.siteId)
      : null,
  };
}

/**
 * Popup node for a clicked place. Text is set as text, not HTML.
 * Mapbox may return the stored numbers as strings.
 * @param properties - Feature properties from the map.
 * @returns The popup body.
 */
export function placePopupElement(
  properties: Partial<PlaceFeatureProperties>
): HTMLElement {
  const numberOrNull = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const content = placePopupContent({
    id: String(properties.id ?? ''),
    name: String(properties.name ?? ''),
    siteId: properties.siteId ? String(properties.siteId) : null,
    sourceName: String(properties.sourceName ?? ''),
    releaseMonth: String(properties.releaseMonth ?? ''),
    croplandKm2: numberOrNull(properties.croplandKm2),
    percent: numberOrNull(properties.percent),
  });
  const root = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = content.name;
  const figure = document.createElement('p');
  figure.textContent = content.figure;
  const release = document.createElement('p');
  release.textContent = content.release;
  const attribution = document.createElement('p');
  attribution.textContent = content.attribution;
  root.append(name, figure, release, attribution);
  if (content.protectedPlanet) {
    const link = document.createElement('a');
    link.href = content.protectedPlanet;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Protected Planet';
    root.append(link);
  }
  return root;
}
