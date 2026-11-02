import { describe, expect, it } from 'vitest';
import { isPmtilesUrl, rasterSourceSpec } from '../rasterSource';

describe('rasterSourceSpec', () => {
  it('loads one PMTiles archive as a source url', () => {
    const url =
      'https://storage.googleapis.com/nature-watch-tiles/cropland/2024/v2/cropland.pmtiles';
    expect(isPmtilesUrl(url)).toBe(true);
    expect(rasterSourceSpec(url, 12)).toEqual({
      type: 'raster',
      tileSize: 256,
      url,
      maxzoom: 12,
    });
  });

  it('keeps the tile template for other raster layers', () => {
    const url = 'https://example.org/crop/2019/{z}/{x}/{y}.png';
    expect(isPmtilesUrl(url)).toBe(false);
    expect(rasterSourceSpec(url)).toEqual({
      type: 'raster',
      tileSize: 256,
      tiles: [url],
    });
  });
});
