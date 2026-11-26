/** Layers Places draws and shows or hides itself: boundaries and outlines. */
const PLACES_LAYER_PREFIXES = ['places-', 'recognitions-', 'ecoregions-'];

/**
 * Whether the Labels toggle shows and hides a layer: the basemap's symbol and
 * line layers. Measure's labels and drawings, and the conservation-area,
 * recognition, and ecoregion layers, keep their own visibility.
 * @param layer - A style layer.
 * @param layer.id - Its id.
 * @param layer.type - Its type, for example `symbol` or `line`.
 * @returns True when Labels shows and hides it.
 */
export function togglesWithLabels(layer: {
  id: string;
  type: string;
}): boolean {
  if (layer.type !== 'symbol' && layer.type !== 'line') return false;
  if (layer.id.includes('measure-label') || layer.id.includes('gl-draw'))
    return false;
  return !PLACES_LAYER_PREFIXES.some(prefix => layer.id.startsWith(prefix));
}
