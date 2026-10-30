import { describe, expect, it } from 'vitest';
import {
  SIZE_STEPS,
  binCounts,
  countryName,
  sizeFraction,
  filterPlaces,
  formatAreaTag,
  sizeAtStep,
  sizeStep,
  roundSize,
  formatSizeInput,
  parseFigure,
  sortPlaces,
  formatKm2,
  formatPercent,
  formatReleaseMonth,
  placesMatching,
  boundsInsideFrame,
  placePopupElement,
  placeTileFilter,
  protectedPlanetUrl,
} from '@/places/display';

describe('place figures', () => {
  it('rounds square kilometres to a hectare and percent to one decimal', () => {
    expect(formatKm2(11.455618)).toBe('11.46');
    expect(formatPercent(0.0598)).toBe('0.1');
    expect(formatKm2(0)).toBe('0.00');
    expect(formatPercent(0)).toBe('0.0');
    expect(formatKm2(1538.284)).toBe('1,538.28');
  });

  it('shows whole square kilometres on the area tag from 100 km²', () => {
    expect(formatAreaTag(19485.4)).toBe('19,485');
    expect(formatAreaTag(100)).toBe('100');
    expect(formatAreaTag(99.994)).toBe('99.99');
    expect(formatAreaTag(15.284)).toBe('15.28');
  });

  it('sorts by name, size, and cropland percent, with missing figures last', () => {
    const list = [
      { name: 'Bontebok', area_km2: 27.86, cropland_percent: 4.2 },
      { name: 'Addo', area_km2: 1538.28, cropland_percent: null },
      { name: 'Camdeboo', area_km2: 194.5, cropland_percent: 0.3 },
    ];
    const names = (sorted: typeof list) => sorted.map(place => place.name);
    expect(names(sortPlaces(list, 'name'))).toEqual([
      'Addo',
      'Bontebok',
      'Camdeboo',
    ]);
    expect(names(sortPlaces(list, 'size-desc'))).toEqual([
      'Addo',
      'Camdeboo',
      'Bontebok',
    ]);
    expect(names(sortPlaces(list, 'size-asc'))).toEqual([
      'Bontebok',
      'Camdeboo',
      'Addo',
    ]);
    expect(names(sortPlaces(list, 'cropland-desc'))).toEqual([
      'Bontebok',
      'Camdeboo',
      'Addo',
    ]);
    expect(names(sortPlaces(list, 'cropland-asc'))).toEqual([
      'Camdeboo',
      'Bontebok',
      'Addo',
    ]);
  });

  it('keeps places inside both ranges, and a missing figure only at the full range', () => {
    const list = [
      { name: 'Small', area_km2: 12, cropland_percent: 40 },
      { name: 'Large', area_km2: 5000, cropland_percent: 1 },
      { name: 'Unmeasured', area_km2: 300, cropland_percent: null },
    ];
    const full = {
      size: {
        kept: [12, 5000] as [number, number],
        full: [12, 5000] as [number, number],
      },
      cropland: {
        kept: [0, 100] as [number, number],
        full: [0, 100] as [number, number],
      },
    };
    expect(filterPlaces(list, full.size, full.cropland)).toHaveLength(3);
    const lowCrop = filterPlaces(list, full.size, {
      kept: [0, 10],
      full: [0, 100],
    });
    expect(lowCrop.map(place => place.name)).toEqual(['Large']);
    const bigOnes = filterPlaces(
      list,
      { kept: [100, 5000], full: [12, 5000] },
      full.cropland
    );
    expect(bigOnes.map(place => place.name)).toEqual(['Large', 'Unmeasured']);
  });

  it('steps the size slider on a log scale between the stored ends', () => {
    expect(sizeAtStep(0, [10, 10000])).toBe(10);
    expect(sizeAtStep(SIZE_STEPS, [10, 10000])).toBe(10000);
    expect(sizeAtStep(SIZE_STEPS / 3, [10, 10000])).toBeCloseTo(100);
    expect(sizeFraction(100, [10, 10000])).toBeCloseTo(1 / 3);
    expect(sizeFraction(5, [10, 10000])).toBe(0);
    expect(sizeStep(100, [10, 10000])).toBe(33);
  });

  it('rounds, shows, and reads sizes typed into the filter', () => {
    expect(roundSize(15.284)).toBe(15.28);
    expect(roundSize(1538.6)).toBe(1539);
    expect(formatSizeInput(15.2)).toBe('15.20');
    expect(formatSizeInput(2000.5)).toBe('2,000.5');
    expect(formatSizeInput(19485)).toBe('19,485');
    expect(parseFigure(' 2,000.5 km² ')).toBe(2000.5);
    expect(parseFigure('12%')).toBe(12);
    expect(parseFigure('')).toBeNull();
    expect(parseFigure('lots')).toBeNull();
    expect(parseFigure('-3')).toBeNull();
  });

  it('counts values into bins and keeps the top end in the last bin', () => {
    expect(binCounts([0, 0.1, 0.5, 0.99, 1], 4)).toEqual([2, 0, 1, 2]);
  });

  it('names one country and leaves a transboundary code as stored', () => {
    expect(countryName('ZAF')).toBe('South Africa');
    expect(countryName('BWA')).toBe('Botswana');
    expect(countryName('TZA')).toBe('Tanzania');
    expect(countryName('ZAF;BWA')).toBe('ZAF;BWA');
    expect(countryName('ZZZ')).toBe('ZZZ');
    expect(countryName(null)).toBe('');
  });

  it('names the release month and the Protected Planet page', () => {
    expect(formatReleaseMonth('2026-10-01')).toBe('October 2026');
    expect(protectedPlanetUrl('873')).toBe(
      'https://www.protectedplanet.net/873'
    );
  });

  it('keeps a place that is already in view and reports one that is not', () => {
    const bounds: [number, number, number, number] = [30, -25, 32, -23];
    expect(boundsInsideFrame([20, -30, 40, -20], bounds)).toBe(true);
    expect(boundsInsideFrame([31, -24.5, 33, -22], bounds)).toBe(false);
  });

  it('filters tiles on the copied size and cropland fields', () => {
    expect(placeTileFilter([null, null], [0, 100])).toBeNull();
    expect(placeTileFilter([100, 5000], [0, 100])).toEqual([
      'all',
      ['>=', ['to-number', ['get', 'area_km2'], -1], 100],
      ['<=', ['to-number', ['get', 'area_km2'], -1], 5000],
    ]);
    expect(placeTileFilter([null, null], [0, 10])).toEqual([
      'all',
      ['has', 'cropland_percent'],
      ['>=', ['to-number', ['get', 'cropland_percent'], -1], 0],
      ['<=', ['to-number', ['get', 'cropland_percent'], -1], 10],
    ]);
  });

  it('filters places by name', () => {
    const places = [
      { name: 'Kruger National Park' },
      { name: 'Sardaville Game and Holiday Farm' },
    ];
    expect(placesMatching(places, ' kruger ')).toEqual([places[0]]);
    expect(placesMatching(places, '')).toEqual(places);
  });

  it('writes the stored cropland figure into a place popup', () => {
    const popup = placePopupElement({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Kruger National Park',
      siteId: '873',
      sourceName: 'WDPCA',
      releaseMonth: '2026-10-01',
      croplandKm2: 11.455618,
      percent: 0.0598,
    });
    expect(popup.textContent).toContain('Kruger National Park');
    expect(popup.textContent).toContain('11.46 km²');
    expect(popup.textContent).toContain('0.1%');
    expect(popup.textContent).toContain('October 2026');
    expect(popup.querySelector('a')?.getAttribute('href')).toBe(
      'https://www.protectedplanet.net/873'
    );
  });
});
