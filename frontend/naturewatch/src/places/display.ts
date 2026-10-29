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
 * @returns Two decimal places, with thousands separators.
 */
export function formatKm2(km2: number): string {
  return km2.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Place area for the profile tag and the list card.
 * Whole square kilometres, or two decimal places below 100 km².
 * @param km2 - `pilot_places.area_km2`.
 * @returns The number, with thousands separators.
 */
export function formatAreaTag(km2: number): string {
  const digits = km2 < 100 ? 2 : 0;
  return km2.toLocaleString('en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

const COUNTRY_NAMES: Record<string, string> = { ZAF: 'South Africa' };

/**
 * English country name for a stored ISO 3166 alpha-3 code.
 * @param iso3 - `places.iso3`.
 * @returns The name, or the code when no name is known.
 */
export function countryName(iso3: string | null): string {
  if (!iso3) return '';
  return COUNTRY_NAMES[iso3] ?? iso3;
}

/** Landscape tab, when no cropland fact is stored for the place. */
export const CROPLAND_NOT_CALCULATED =
  'Cropland has not been calculated for this place.';

/** Species tab. No species records are stored for any place. */
export const SPECIES_NOTHING_YET = 'Oops, we have nothing to show you yet.';

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

/** How the places list is ordered. */
export type PlaceSort =
  | 'name'
  | 'size-desc'
  | 'size-asc'
  | 'cropland-desc'
  | 'cropland-asc';

/** The list fields that sorting and filtering read. */
export interface PlaceFigures {
  name: string;
  area_km2: number | null;
  cropland_percent: number | null;
}

/**
 * Order places. A place without the sorted figure goes last.
 * @param places - Places to order.
 * @param sort - Name, size, or cropland percent, and the direction.
 * @returns A new array.
 */
export function sortPlaces<T extends PlaceFigures>(
  places: T[],
  sort: PlaceSort
): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, 'en');
  if (sort === 'name') return [...places].sort(byName);
  const field = sort.startsWith('size') ? 'area_km2' : 'cropland_percent';
  const sign = sort.endsWith('desc') ? -1 : 1;
  return [...places].sort((a, b) => {
    const left = a[field];
    const right = b[field];
    if (left === null && right === null) return byName(a, b);
    if (left === null) return 1;
    if (right === null) return -1;
    return (left - right) * sign || byName(a, b);
  });
}

/** Lowest and highest value a filter keeps. */
export type FigureRange = [number, number];

/**
 * Places whose size and cropland percent fall inside both ranges.
 * A missing figure passes only while its range is the full range.
 * @param places - Places to filter.
 * @param size - Square kilometres.
 * @param size.kept - Sizes kept.
 * @param size.full - Smallest and largest stored size.
 * @param cropland - Cropland percent.
 * @param cropland.kept - Percents kept.
 * @param cropland.full - 0 to 100.
 * @returns The places kept, in the same order.
 */
export function filterPlaces<T extends PlaceFigures>(
  places: T[],
  size: { kept: FigureRange; full: FigureRange },
  cropland: { kept: FigureRange; full: FigureRange }
): T[] {
  const passes = (
    value: number | null,
    range: { kept: FigureRange; full: FigureRange }
  ) => {
    const whole =
      range.kept[0] <= range.full[0] && range.kept[1] >= range.full[1];
    if (value === null) return whole;
    return value >= range.kept[0] && value <= range.kept[1];
  };
  return places.filter(
    place =>
      passes(place.area_km2, size) && passes(place.cropland_percent, cropland)
  );
}

/** The whole cropland range, in percent. */
export const CROPLAND_FULL: FigureRange = [0, 100];

/** Steps on the size slider. The slider is logarithmic. */
export const SIZE_STEPS = 100;

/**
 * Square kilometres for a size slider step.
 * @param step - 0 to SIZE_STEPS.
 * @param full - Smallest and largest stored size.
 * @returns The size at that step. The ends are exactly the stored ends.
 */
export function sizeAtStep(step: number, full: FigureRange): number {
  if (step <= 0) return full[0];
  if (step >= SIZE_STEPS) return full[1];
  const low = Math.log10(full[0]);
  const high = Math.log10(full[1]);
  return 10 ** (low + ((high - low) * step) / SIZE_STEPS);
}

/**
 * Where a size sits along the logarithmic size slider.
 * @param km2 - Square kilometres.
 * @param full - Smallest and largest stored size.
 * @returns 0 at the smallest size, 1 at the largest.
 */
export function sizeFraction(km2: number, full: FigureRange): number {
  const low = Math.log10(full[0]);
  const high = Math.log10(full[1]);
  if (high <= low) return 0;
  const fraction = (Math.log10(km2) - low) / (high - low);
  return Math.min(1, Math.max(0, fraction));
}

/** Kept sizes in km². Null leaves that end open. */
export type SizeBounds = [number | null, number | null];

/**
 * The nearest size slider step to a size.
 * @param km2 - Square kilometres.
 * @param full - Smallest and largest stored size.
 * @returns 0 to SIZE_STEPS.
 */
export function sizeStep(km2: number, full: FigureRange): number {
  return Math.round(sizeFraction(km2, full) * SIZE_STEPS);
}

/**
 * A size at the precision the filter shows it: whole square kilometres, or
 * two decimal places below 100 km².
 * @param km2 - Square kilometres.
 * @returns The rounded size.
 */
export function roundSize(km2: number): number {
  return km2 < 100 ? Math.round(km2 * 100) / 100 : Math.round(km2);
}

/**
 * A size in a filter box. A typed size keeps up to two decimal places.
 * @param km2 - Square kilometres.
 * @returns Text such as 1,538 or 15.28.
 */
export function formatSizeInput(km2: number): string {
  return km2.toLocaleString('en-GB', {
    minimumFractionDigits: km2 < 100 ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

/**
 * A figure typed into a filter box.
 * @param text - What was typed. Commas, spaces, km², and % are ignored.
 * @returns The number, or null when the text is not a number of zero or more.
 */
export function parseFigure(text: string): number | null {
  const cleaned = text.replace(/km²|km2|%|,|\s/gi, '');
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Count values into equal bins along a slider.
 * @param fractions - Each value's place along the slider, 0 to 1.
 * @param bins - Number of bins.
 * @returns The count in each bin. A value of 1 falls in the last bin.
 */
export function binCounts(fractions: number[], bins: number): number[] {
  const counts = new Array<number>(bins).fill(0);
  fractions.forEach(fraction => {
    const bin = Math.min(bins - 1, Math.max(0, Math.floor(fraction * bins)));
    counts[bin] += 1;
  });
  return counts;
}

/** West, south, east, north. */
export type LngLatBounds = [number, number, number, number];

/** A Mapbox filter expression, kept loose so this file needs no Mapbox types. */
export type TileFilter = unknown[];

/**
 * Filter on the fields copied onto each place tile: `area_km2` and
 * `cropland_percent`. Matches the list query: a missing cropland figure passes
 * only while the cropland range is 0–100%.
 * @param size - Kept sizes in km². Null leaves that end open.
 * @param cropland - Kept cropland percent.
 * @returns The expression, or null when every place is kept.
 */
export function placeTileFilter(
  size: SizeBounds,
  cropland: FigureRange
): TileFilter | null {
  const parts: TileFilter[] = [];
  const area = ['to-number', ['get', 'area_km2'], -1];
  if (size[0] !== null) parts.push(['>=', area, size[0]]);
  if (size[1] !== null) parts.push(['<=', area, size[1]]);
  const cropWhole =
    cropland[0] <= CROPLAND_FULL[0] && cropland[1] >= CROPLAND_FULL[1];
  if (!cropWhole) {
    const percent = ['to-number', ['get', 'cropland_percent'], -1];
    parts.push(
      ['has', 'cropland_percent'],
      ['>=', percent, cropland[0]],
      ['<=', percent, cropland[1]]
    );
  }
  if (parts.length === 0) return null;
  return ['all', ...parts];
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

/** Properties shown in a place popup. */
export interface PlaceFeatureProperties {
  id: string;
  name: string;
  siteId: string | null;
  sourceName: string;
  releaseMonth: string;
  croplandKm2: number | null;
  percent: number | null;
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
