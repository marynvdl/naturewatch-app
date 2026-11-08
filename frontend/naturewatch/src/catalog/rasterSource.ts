/** A raster source address that is one PMTiles archive. Mapbox GL JS 3.23.0 or later reads it. */
export function isPmtilesUrl(url: string): boolean {
  return /^https?:\/\/[^?#]+\.pmtiles$/i.test(url);
}

/**
 * Mapbox raster source for a layer address.
 * One `.pmtiles` archive is a source `url`. Any other address is a `{z}/{x}/{y}` template.
 * @param url - Archive or tile template.
 * @param maxzoom - Highest zoom the tiles exist for.
 * @param tileSize - Pixel size of each tile. 512 px tiles use a zoom range one less than 256 px tiles of the same resolution.
 */
export function rasterSourceSpec(
  url: string,
  maxzoom?: number,
  tileSize: 256 | 512 = 256
): {
  type: 'raster';
  tileSize: 256 | 512;
  url?: string;
  tiles?: string[];
  maxzoom?: number;
} {
  return {
    type: 'raster',
    tileSize,
    ...(isPmtilesUrl(url) ? { url } : { tiles: [url] }),
    // Without this the map requests tiles that do not exist beyond maxzoom
    ...(maxzoom !== undefined && { maxzoom }),
  };
}
