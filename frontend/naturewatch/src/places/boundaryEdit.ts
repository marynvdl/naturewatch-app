import { watch, type Ref } from 'vue';
import type MapboxDraw from '@mapbox/mapbox-gl-draw';
import type * as mapboxgl from 'mapbox-gl';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import turfBbox from '@turf/bbox';
import usePlacesStore from '@/store/PlacesStore';
import { useMeasureStore } from '@/store/MeasureStore';
import type { LngLatBounds } from '@/places/display';
import { checkEditedShape } from '@/places/replacementBoundary';
import { BOUNDARY_EDIT, mapDraw } from '@/places/mapDraw';

/** Close enough to move single points of a small boundary. */
const EDIT_MAX_ZOOM = 16;

/**
 * The shape as a MultiPolygon.
 * @param geometry - A Polygon or MultiPolygon from the draw tool.
 */
function asMulti(geometry: Polygon | MultiPolygon): MultiPolygon {
  return geometry.type === 'Polygon'
    ? { type: 'MultiPolygon', coordinates: [geometry.coordinates] }
    : geometry;
}

/**
 * Edit `PlacesStore.boundaryEdit` on the map in the map's draw tool, which
 * measuring shares. The boundary is marked with `BOUNDARY_EDIT`, so measuring
 * leaves it alone. It stays in point editing, and each change is written to
 * `PlacesStore.boundaryEdited`. It is taken out of the tool when the edit ends.
 * @param map - The Mapbox map, once MapComponent has made it.
 * @param flyToBox - Flies to a box with room for the open panels.
 */
export function useBoundaryEdit(
  map: Ref<mapboxgl.Map | null>,
  flyToBox: (bounds: LngLatBounds, maxZoom?: number) => void
) {
  const placesStore = usePlacesStore();
  const measureStore = useMeasureStore();
  let draw: MapboxDraw | null = null;
  let onMap: mapboxgl.Map | null = null;
  let featureId: string | null = null;
  /** The last shape the tool held, put back if the tool drops it. */
  let last: MultiPolygon | null = null;

  /** Load `last` into the tool and select its points for editing. */
  function load() {
    if (!draw || !last) return;
    const feature: Feature<MultiPolygon> = {
      type: 'Feature',
      properties: { [BOUNDARY_EDIT]: true },
      geometry: last,
    };
    [featureId] = draw.add(feature);
    draw.changeMode('direct_select', { featureId });
  }

  /** Write the edited shape to the store, unless a ring has too few points. */
  function onUpdate() {
    const feature = featureId ? draw?.get(featureId) : undefined;
    if (!feature) return;
    const shape = asMulti(feature.geometry as Polygon | MultiPolygon);
    if (!checkEditedShape(shape).ok) return;
    last = shape;
    placesStore.boundaryEdited = shape;
  }

  /**
   * The draw tool drops a shape when removing points leaves a ring with fewer
   * than three. Put the last whole shape back once the tool has settled.
   */
  function onDelete() {
    const tool = draw;
    window.setTimeout(() => {
      if (tool && tool === draw && featureId && !tool.get(featureId)) load();
    }, 0);
  }

  /**
   * Keep the boundary in point editing when a click leaves it. Another mode,
   * such as drawing a correction, is left alone.
   */
  function onModeChange() {
    if (!draw || !featureId || !draw.get(featureId)) return;
    if (draw.getMode() === 'simple_select')
      draw.changeMode('direct_select', { featureId });
  }

  /** End the edit and take the boundary out of the draw tool. */
  function stop() {
    if (onMap && draw) {
      onMap.off('draw.update', onUpdate);
      onMap.off('draw.delete', onDelete);
      onMap.off('draw.modechange', onModeChange);
      if (featureId && draw.get(featureId)) {
        if (draw.getMode() === 'direct_select')
          draw.changeMode('simple_select');
        draw.delete(featureId);
      }
    }
    draw = null;
    onMap = null;
    featureId = null;
    last = null;
    placesStore.boundaryEdited = null;
    measureStore.setEditingBoundary(false);
  }

  /**
   * Start editing a shape.
   * @param instance - The map.
   * @param shape - The boundary.
   */
  function start(instance: mapboxgl.Map, shape: MultiPolygon) {
    stop();
    draw = mapDraw(instance);
    onMap = instance;
    instance.on('draw.update', onUpdate);
    instance.on('draw.delete', onDelete);
    instance.on('draw.modechange', onModeChange);
    last = shape;
    placesStore.boundaryEdited = shape;
    measureStore.setEditingBoundary(true);
    load();
    flyToBox(turfBbox(shape) as LngLatBounds, EDIT_MAX_ZOOM);
  }

  watch(
    () => [map.value, placesStore.boundaryEdit] as const,
    ([instance, shape]) => {
      if (instance && shape) start(instance, shape);
      else stop();
    }
  );

  watch(
    () => placesStore.boundaryEditTrash,
    () => draw?.trash()
  );
}
