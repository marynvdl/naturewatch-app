import { watch, type Ref } from 'vue';
import type * as mapboxgl from 'mapbox-gl';
import type { Feature, MultiPolygon } from 'geojson';
import turfBbox from '@turf/bbox';
import usePlacesStore from '@/store/PlacesStore';
import type { LngLatBounds } from '@/places/display';

const SOURCE = 'boundary-preview';
/** The outline layers, bottom to top. */
export const PREVIEW_LAYERS = [
  'boundary-preview-casing',
  'boundary-preview-line',
] as const;
/** Blue, as the correction outlines, on a white casing for dark layers. */
const COLOUR = '#3d5afe';

/**
 * Outline the uploaded or proposed boundary of the Status tab, dashed, and fly
 * to it when it changes. The map draws the current boundary from the tiles.
 * @param map - The Mapbox map, once MapComponent has made it.
 * @param flyToBox - Flies to a box with room for the open panels.
 */
export function useBoundaryPreview(
  map: Ref<mapboxgl.Map | null>,
  flyToBox: (bounds: LngLatBounds, maxZoom?: number) => void
) {
  const placesStore = usePlacesStore();
  let listening: mapboxgl.Map | null = null;

  /** Whether the map's style can take sources now. */
  function ready(instance: mapboxgl.Map): boolean {
    const style = (instance as unknown as { style?: { _loaded?: boolean } })
      .style;
    return instance.isStyleLoaded() || style?._loaded === true;
  }

  /** Remove the outline layers and their source. */
  function remove(instance: mapboxgl.Map) {
    for (const id of PREVIEW_LAYERS) {
      if (instance.getLayer(id)) instance.removeLayer(id);
    }
    if (instance.getSource(SOURCE)) instance.removeSource(SOURCE);
  }

  /** Put the outline on the map, update it, or take it off. */
  function draw(instance: mapboxgl.Map) {
    if (!ready(instance)) return;
    const shape = placesStore.boundaryPreview;
    if (!shape) {
      remove(instance);
      return;
    }
    const data: Feature<MultiPolygon> = {
      type: 'Feature',
      geometry: shape,
      properties: {},
    };
    const source = instance.getSource(SOURCE) as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (source) {
      source.setData(data);
      return;
    }
    instance.addSource(SOURCE, { type: 'geojson', data });
    instance.addLayer({
      id: 'boundary-preview-casing',
      type: 'line',
      source: SOURCE,
      paint: { 'line-color': '#ffffff', 'line-width': 4, 'line-opacity': 0.85 },
    });
    instance.addLayer({
      id: 'boundary-preview-line',
      type: 'line',
      source: SOURCE,
      paint: {
        'line-color': COLOUR,
        'line-width': 2,
        'line-dasharray': [2, 1.5],
      },
    });
  }

  watch(
    map,
    instance => {
      if (!instance || listening === instance) return;
      listening = instance;
      instance.on('style.load', () => draw(instance));
      draw(instance);
    },
    { immediate: true }
  );

  watch(
    () => placesStore.boundaryPreview,
    shape => {
      if (map.value) draw(map.value);
      if (shape) flyToBox(turfBbox(shape) as LngLatBounds);
    }
  );
}
