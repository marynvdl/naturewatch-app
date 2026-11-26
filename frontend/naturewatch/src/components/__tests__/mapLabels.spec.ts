import { describe, expect, it } from 'vitest';
import { togglesWithLabels } from '../mapLabels';

describe('togglesWithLabels', () => {
  it('shows and hides the basemap labels and lines', () => {
    expect(togglesWithLabels({ id: 'settlement-label', type: 'symbol' })).toBe(
      true
    );
    expect(togglesWithLabels({ id: 'road-primary', type: 'line' })).toBe(true);
  });

  it('leaves the place, recognition, and ecoregion layers alone', () => {
    [
      'places-line',
      'places-set-line',
      'recognitions-line',
      'recognitions-select-line',
      'ecoregions-line',
      'ecoregions-hover-line',
    ].forEach(id => {
      expect(togglesWithLabels({ id, type: 'line' })).toBe(false);
    });
  });

  it("leaves Measure's labels and drawings alone", () => {
    expect(togglesWithLabels({ id: 'measure-label-1', type: 'symbol' })).toBe(
      false
    );
    expect(togglesWithLabels({ id: 'gl-draw-line.cold', type: 'line' })).toBe(
      false
    );
  });

  it('leaves fills and rasters alone', () => {
    expect(togglesWithLabels({ id: 'land', type: 'fill' })).toBe(false);
    expect(togglesWithLabels({ id: 'cropland', type: 'raster' })).toBe(false);
  });
});
