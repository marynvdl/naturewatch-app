import { describe, expect, it } from 'vitest';
import type { Polygon } from 'geojson';
import { catalog } from '@/catalog';
import {
  FIRST_CORRECTION_YEAR,
  MAX_CORRECTION_VERTICES,
  buildValue,
  correctableLayers,
  defaultYear,
  shapeProblem,
  valueText,
  yearRange,
  yearsBetween,
  yearsText,
} from '../form';

const layer = (id: string) => {
  const found = catalog.layers.find(item => item.id === id);
  if (!found) throw new Error(`no layer ${id}`);
  return found;
};

const square: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [31, -24],
      [31.1, -24],
      [31.1, -24.1],
      [31, -24.1],
      [31, -24],
    ],
  ],
};

describe('correction form helpers', () => {
  it('lists only the visible layers that accept corrections', () => {
    const titles = [layer('cropland').title, layer('tree-height').title];
    expect(correctableLayers(catalog, titles).map(item => item.id)).toEqual([
      'cropland',
    ]);
    expect(correctableLayers(catalog, [])).toEqual([]);
  });

  it('offers every year from 2000 to the layer’s latest, data or not', () => {
    const cropland = yearRange(layer('cropland'));
    expect(cropland[0]).toBe(FIRST_CORRECTION_YEAR);
    expect(cropland.at(-1)).toBe(2024);
    expect(cropland).toHaveLength(25);
    expect(yearRange(layer('treeloss')).at(-1)).toBe(2025);
  });

  it('starts on the year the layer shows for the timeline year', () => {
    expect(defaultYear(layer('treeloss'), 2019)).toBe(2019);
    expect(defaultYear(layer('cropland'), 2025)).toBe(2024);
    expect(defaultYear(layer('cropland'), 2018)).toBe(2024);
  });

  it('lists the years in a range without the unchecked ones', () => {
    expect(yearsBetween(2019, 2021)).toEqual([2019, 2020, 2021]);
    expect(yearsBetween(2021, 2019, [2020])).toEqual([2019, 2021]);
    expect(yearsBetween(2020, 2020, [2020])).toEqual([]);
  });

  it('builds the value from the catalog block', () => {
    const cropland = layer('cropland').corrections!;
    const roads = layer('roads').corrections!;
    expect(buildValue(cropland, 'remove', { share: 40 })).toBeNull();
    expect(buildValue(cropland, 'add', { share: 40 })).toEqual({ share: 0.4 });
    expect(buildValue(cropland, 'add', {})).toBeUndefined();
    expect(buildValue(cropland, 'add', { share: 140 })).toBeUndefined();
    expect(buildValue(roads, 'reclassify', { level: 3, surface: 1 })).toEqual({
      level: 3,
      surface: 1,
    });
    expect(buildValue(roads, 'add', { level: 3 })).toBeUndefined();
    expect(buildValue(roads, 'add', { level: 9, surface: 1 })).toBeUndefined();
    expect(buildValue(layer('fire').corrections!, 'add', {})).toBeNull();
  });

  it('refuses a polygon that crosses itself or has too many vertices', () => {
    expect(shapeProblem(square)).toBeNull();
    const bowtie: Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [31, -24],
          [31.1, -24.1],
          [31.1, -24],
          [31, -24.1],
          [31, -24],
        ],
      ],
    };
    expect(shapeProblem(bowtie)).toMatch(/crosses itself/);
    const n = MAX_CORRECTION_VERTICES + 1;
    const ring = Array.from({ length: n }, (_, i) => [
      31 + 0.1 * Math.cos((2 * Math.PI * i) / n),
      -24 + 0.1 * Math.sin((2 * Math.PI * i) / n),
    ]);
    expect(
      shapeProblem({ type: 'Polygon', coordinates: [[...ring, ring[0]]] })
    ).toMatch(/more than 5,000 vertices/);
  });
});

describe('yearsText', () => {
  it('joins runs and lists gaps', () => {
    expect(yearsText([2024])).toBe('2024');
    expect(yearsText([2005, 2003, 2004])).toBe('2003–2005');
    expect(yearsText([2019, 2021, 2022, 2023])).toBe('2019, 2021–2023');
  });
});

describe('valueText', () => {
  it('names each value with its catalog label', () => {
    expect(valueText(layer('cropland').corrections, { share: 0.4 })).toBe(
      'Cropland share 40%'
    );
    expect(
      valueText(layer('roads').corrections, { level: 3, surface: 1 })
    ).toMatch(/^Road level: Main · Surface: /);
    expect(valueText(layer('fire').corrections, null)).toBe('');
    expect(valueText(undefined, { share: 0.4 })).toBe('share: 0.4');
  });
});
