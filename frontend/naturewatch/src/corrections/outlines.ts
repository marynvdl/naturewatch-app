import { computed, watch, type Ref } from 'vue';
import type * as mapboxgl from 'mapbox-gl';
import type { Feature, FeatureCollection, MultiPolygon } from 'geojson';
import turfBbox from '@turf/bbox';
import useAuthStore from '@/store/AuthStore';
import useCorrectionsStore from '@/store/CorrectionsStore';
import { loadCorrections, type StoredCorrection } from '@/corrections/api';
import type { LngLatBounds } from '@/places/display';

const SOURCE = 'correction-outlines';
/** The outline layers, bottom to top. */
export const OUTLINE_LAYERS = [
  'correction-outlines-casing',
  'correction-outlines-chosen',
  'correction-outlines-approved',
  'correction-outlines-submitted',
] as const;
/** The most outlines the map reads. */
const OUTLINE_LIMIT = 1000;
/** Blue, which no pressure layer uses, on a white casing for dark layers. */
const COLOUR = '#3d5afe';
/** A corrected field is small: fly no closer than this. */
const CHOSEN_MAX_ZOOM = 15;

interface OutlineProps {
  id: string;
  status: string;
  chosen: boolean;
}

/**
 * The features the outline source holds: the submitted and approved
 * corrections, and the chosen one, even when it is rejected.
 * @param stored - The submitted and approved corrections.
 * @param chosen - The correction chosen in the list, or null.
 */
export function outlineFeatures(
  stored: StoredCorrection[],
  chosen: StoredCorrection | null
): FeatureCollection<MultiPolygon, OutlineProps> {
  const list =
    chosen && !stored.some(item => item.id === chosen.id)
      ? [...stored, chosen]
      : stored;
  return {
    type: 'FeatureCollection',
    features: list.map(
      (item): Feature<MultiPolygon, OutlineProps> => ({
        type: 'Feature',
        geometry: item.geometry,
        properties: {
          id: item.id,
          status: item.status,
          chosen: item.id === chosen?.id,
        },
      })
    ),
  };
}

/**
 * Outline the submitted (dashed) and approved (solid) corrections for an
 * admin in Edit mode, draw the chosen one thicker, and fly to it.
 * @param map - The Mapbox map, once MapComponent has made it.
 * @param flyToBox - Flies to a box with room for the open panels.
 */
export function useCorrectionOutlines(
  map: Ref<mapboxgl.Map | null>,
  flyToBox: (bounds: LngLatBounds, maxZoom?: number) => void
) {
  const auth = useAuthStore();
  const corrections = useCorrectionsStore();
  const shown = computed(() => auth.isAdmin && auth.editMode);
  let stored: StoredCorrection[] = [];
  let request = 0;
  let listening: mapboxgl.Map | null = null;

  /** Whether the map's style can take sources now. */
  function ready(instance: mapboxgl.Map): boolean {
    const style = (instance as unknown as { style?: { _loaded?: boolean } })
      .style;
    return instance.isStyleLoaded() || style?._loaded === true;
  }

  /** Remove the outline layers and their source. */
  function remove(instance: mapboxgl.Map) {
    if (!ready(instance)) return;
    for (const id of OUTLINE_LAYERS) {
      if (instance.getLayer(id)) instance.removeLayer(id);
    }
    if (instance.getSource(SOURCE)) instance.removeSource(SOURCE);
  }

  /** Put the outlines on the map, or update them. */
  function draw(instance: mapboxgl.Map) {
    if (!ready(instance)) return;
    if (!shown.value) {
      remove(instance);
      return;
    }
    const data = outlineFeatures(stored, corrections.chosen);
    const source = instance.getSource(SOURCE) as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (source) {
      source.setData(data);
      return;
    }
    instance.addSource(SOURCE, { type: 'geojson', data });
    instance.addLayer({
      id: 'correction-outlines-casing',
      type: 'line',
      source: SOURCE,
      paint: { 'line-color': '#ffffff', 'line-width': 4, 'line-opacity': 0.85 },
    });
    instance.addLayer({
      id: 'correction-outlines-chosen',
      type: 'line',
      source: SOURCE,
      filter: ['==', ['get', 'chosen'], true],
      paint: { 'line-color': COLOUR, 'line-width': 8, 'line-opacity': 0.35 },
    });
    instance.addLayer({
      id: 'correction-outlines-approved',
      type: 'line',
      source: SOURCE,
      filter: ['==', ['get', 'status'], 'approved'],
      paint: { 'line-color': COLOUR, 'line-width': 2 },
    });
    instance.addLayer({
      id: 'correction-outlines-submitted',
      type: 'line',
      source: SOURCE,
      filter: ['!=', ['get', 'status'], 'approved'],
      paint: {
        'line-color': COLOUR,
        'line-width': 2,
        'line-dasharray': [2, 1.5],
      },
    });
  }

  /** Read the submitted and approved corrections, then draw them. */
  async function reload() {
    const current = ++request;
    if (!shown.value) {
      stored = [];
      if (map.value) draw(map.value);
      return;
    }
    const result = await loadCorrections(
      ['submitted', 'approved'],
      OUTLINE_LIMIT
    );
    if (current !== request) return;
    stored = result.status === 'ok' ? result.corrections : [];
    if (map.value) draw(map.value);
  }

  watch(
    map,
    instance => {
      if (!instance || listening === instance) return;
      listening = instance;
      instance.on('style.load', () => draw(instance));
      void reload();
    },
    { immediate: true }
  );

  watch([shown, () => corrections.version], () => void reload());

  watch(
    () => corrections.chosen,
    (chosen, before) => {
      if (map.value) draw(map.value);
      if (!chosen || chosen.id === before?.id) return;
      flyToBox(turfBbox(chosen.geometry) as LngLatBounds, CHOSEN_MAX_ZOOM);
    }
  );

  /** Leaving Edit mode lets go of the chosen correction. */
  watch(shown, on => {
    if (!on) corrections.chosen = null;
  });
}
