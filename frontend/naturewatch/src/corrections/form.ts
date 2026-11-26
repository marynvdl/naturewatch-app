import turfKinks from '@turf/kinks';
import type { Polygon } from 'geojson';
import { resolveLayerYear } from '@/catalog';
import type {
  Catalog,
  CatalogCorrectionAction,
  CatalogCorrections,
  CatalogLayer,
} from '@/catalog/types';

/** The first year a correction can name, on every layer, with data or not. */
export const FIRST_CORRECTION_YEAR = 2000;

/** The most vertices `submit_correction` accepts. */
export const MAX_CORRECTION_VERTICES = 5000;

/** The longest note `layer_corrections` keeps. */
export const CORRECTION_NOTE_MAX = 1000;

/** A catalog layer that accepts corrections. */
export type CorrectableLayer = CatalogLayer & {
  corrections: CatalogCorrections;
};

/** The words the form shows for each action. */
export const ACTION_LABELS: Record<CatalogCorrectionAction, string> = {
  remove: 'Remove here',
  add: 'Add here',
  reclassify: 'Change kind',
};

/**
 * The layers on the map that accept corrections, in catalog order.
 * @param source - The catalog.
 * @param visibleTitles - Titles of the layers that are on.
 * @returns The correctable layers that are on.
 */
export function correctableLayers(
  source: Catalog,
  visibleTitles: string[]
): CorrectableLayer[] {
  const on = new Set(visibleTitles);
  return source.layers.filter(
    (layer): layer is CorrectableLayer =>
      Boolean(layer.corrections) && on.has(layer.title)
  );
}

/**
 * The years a correction to the layer can name.
 * @param layer - The layer.
 * @returns From FIRST_CORRECTION_YEAR to the layer's latest year.
 */
export function yearRange(layer: CatalogLayer): number[] {
  const last = Math.max(...layer.years.available);
  const years: number[] = [];
  for (let year = FIRST_CORRECTION_YEAR; year <= last; year += 1) {
    years.push(year);
  }
  return years;
}

/**
 * The year the form starts on.
 * @param layer - The layer.
 * @param timelineYear - The year on the timeline.
 * @returns The year the layer shows for that timeline year, or its latest.
 */
export function defaultYear(layer: CatalogLayer, timelineYear: number): number {
  return (
    resolveLayerYear(
      layer.years.available,
      timelineYear,
      layer.years.meaning
    ) ?? Math.max(...layer.years.available)
  );
}

/**
 * The years from one year to another, without the unchecked ones.
 * @param from - The first year.
 * @param to - The last year. Swapped with from if it is earlier.
 * @param unchecked - Years left out.
 * @returns The years, ascending.
 */
export function yearsBetween(
  from: number,
  to: number,
  unchecked: Iterable<number> = []
): number[] {
  const skip = new Set(unchecked);
  const [first, last] = from <= to ? [from, to] : [to, from];
  const years: number[] = [];
  for (let year = first; year <= last; year += 1) {
    if (!skip.has(year)) years.push(year);
  }
  return years;
}

/** What the admin typed or chose for each value: a percent for a share, an option value otherwise. */
export type ValueInputs = Record<string, number | null | undefined>;

/**
 * The value a correction stores.
 * @param block - The layer's corrections block.
 * @param action - The chosen action.
 * @param inputs - The inputs, by value id.
 * @returns Null for remove or a layer without values, an object when every value is given, or undefined while one is missing.
 */
export function buildValue(
  block: CatalogCorrections,
  action: CatalogCorrectionAction,
  inputs: ValueInputs
): Record<string, number> | null | undefined {
  if (action === 'remove' || !block.values) return null;
  const value: Record<string, number> = {};
  for (const field of block.values) {
    const input = inputs[field.id];
    if (input === null || input === undefined || Number.isNaN(input)) {
      return undefined;
    }
    if (field.kind === 'share') {
      if (input < 0 || input > 100) return undefined;
      value[field.id] = Math.round(input * 10) / 1000;
    } else {
      if (!field.options.some(option => option.value === input)) {
        return undefined;
      }
      value[field.id] = input;
    }
  }
  return value;
}

/**
 * Why a drawn polygon cannot be saved.
 * @param polygon - The drawn polygon.
 * @returns Null when it can be saved, or the reason to draw it again.
 */
export function shapeProblem(polygon: Polygon): string | null {
  const vertices = polygon.coordinates.reduce(
    (total, ring) => total + ring.length,
    0
  );
  if (polygon.coordinates[0]?.length < 4) {
    return 'The polygon needs at least three corners. Draw it again.';
  }
  if (vertices > MAX_CORRECTION_VERTICES) {
    return `The polygon has more than ${MAX_CORRECTION_VERTICES.toLocaleString('en-US')} vertices. Draw it with fewer.`;
  }
  if (turfKinks(polygon).features.length > 0) {
    return 'The polygon crosses itself. Draw it again.';
  }
  return null;
}
