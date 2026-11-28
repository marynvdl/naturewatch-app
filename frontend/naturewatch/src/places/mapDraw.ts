import MapboxDraw from '@mapbox/mapbox-gl-draw';
import type * as mapboxgl from 'mapbox-gl';

/**
 * The map's one mapbox-gl-draw tool, with no buttons. Measuring, corrections,
 * and boundary editing share it, because a second tool on the same map would
 * add the same sources again and fail.
 */
const tools = new WeakMap<mapboxgl.Map, MapboxDraw>();

/** The property that marks the boundary being edited in the draw tool. */
export const BOUNDARY_EDIT = 'boundary_edit';

/**
 * The map's draw tool, added the first time it is asked for.
 * @param map - The Mapbox map.
 */
export function mapDraw(map: mapboxgl.Map): MapboxDraw {
  let tool = tools.get(map);
  if (!tool) {
    tool = new MapboxDraw({ displayControlsDefault: false });
    map.addControl(tool, 'bottom-right');
    tools.set(map, tool);
  }
  return tool;
}

/**
 * Whether a draw feature is the boundary being edited.
 * @param feature - A feature from a draw event.
 * @param feature.properties - Its properties.
 */
export function isBoundaryEdit(feature?: {
  properties?: Record<string, unknown> | null;
}): boolean {
  return feature?.properties?.[BOUNDARY_EDIT] === true;
}
