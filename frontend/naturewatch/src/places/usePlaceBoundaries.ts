import { type Ref, watch } from 'vue';
import type * as mapboxgl from 'mapbox-gl';
import usePlacesStore from '@/store/PlacesStore';
import {
  boundsInsideFrame,
  geometryBounds,
  type LngLatBounds,
} from './display';

const PLACE_SOURCE = 'pilot-places';
const PLACE_FILL = 'pilot-places-fill';
const PLACE_LINE = 'pilot-places-line';
const PLACE_SELECT_FILL = 'pilot-places-select-fill';
const PLACE_SELECT_LINE = 'pilot-places-select-line';

/**
 * Draw the protected-area boundaries, highlight a selection, and frame it.
 * @param map - The Mapbox map, once MapComponent has created it.
 * @param onSelected - Called when a boundary click selects a place.
 */
export function usePlaceBoundaries(
  map: Ref<mapboxgl.Map | null>,
  onSelected: () => void
) {
  const placesStore = usePlacesStore();
  let listening = false;

  /** First symbol layer, so place boundaries sit under the labels. */
  function firstSymbolId(mapInstance: mapboxgl.Map): string | undefined {
    return mapInstance
      .getStyle()
      ?.layers?.find(layer => layer.type === 'symbol')?.id;
  }

  /** Filter that keeps only the selected place. */
  function selectionFilter(): mapboxgl.FilterSpecification {
    return ['==', ['get', 'id'], placesStore.selectedId ?? ''];
  }

  /**
   * Highlight the selected boundary, and move the map when it is outside the view.
   */
  function frameSelectedPlace(mapInstance: mapboxgl.Map) {
    if (mapInstance.getLayer(PLACE_SELECT_FILL)) {
      const filter = selectionFilter();
      mapInstance.setFilter(PLACE_SELECT_FILL, filter);
      mapInstance.setFilter(PLACE_SELECT_LINE, filter);
    }
    const id = placesStore.selectedId;
    if (!id || !placesStore.features) return;
    const feature = placesStore.features.features.find(
      item => item.properties.id === id
    );
    if (!feature) return;
    const place = geometryBounds(feature.geometry);
    if (!place) return;
    const view = mapInstance.getBounds();
    const frame: LngLatBounds = [
      view.getWest(),
      view.getSouth(),
      view.getEast(),
      view.getNorth(),
    ];
    if (boundsInsideFrame(frame, place)) return;
    mapInstance.fitBounds(
      [
        [place[0], place[1]],
        [place[2], place[3]],
      ],
      { padding: 72, maxZoom: 10, duration: 800 }
    );
  }

  /** Remove the place boundaries. */
  function removePlaceOverlay(mapInstance: mapboxgl.Map) {
    if (mapInstance.getLayer(PLACE_SELECT_LINE))
      mapInstance.removeLayer(PLACE_SELECT_LINE);
    if (mapInstance.getLayer(PLACE_SELECT_FILL))
      mapInstance.removeLayer(PLACE_SELECT_FILL);
    if (mapInstance.getLayer(PLACE_LINE)) mapInstance.removeLayer(PLACE_LINE);
    if (mapInstance.getLayer(PLACE_FILL)) mapInstance.removeLayer(PLACE_FILL);
    if (mapInstance.getSource(PLACE_SOURCE))
      mapInstance.removeSource(PLACE_SOURCE);
  }

  /**
   * Select the clicked boundary, or clear it when it is already selected.
   */
  function onPlaceClick(event: mapboxgl.MapMouseEvent) {
    const id = event.features?.[0]?.properties?.id;
    if (id === undefined || id === null || id === '') return;
    const placeId = String(id);
    const selecting = placesStore.selectedId !== placeId;
    placesStore.selectPlace(placeId, 'map');
    if (selecting) onSelected();
  }

  /** Draw or clear the protected-area boundaries. */
  function syncPlaceOverlay(mapInstance: mapboxgl.Map) {
    if (!placesStore.visible || !placesStore.features) {
      removePlaceOverlay(mapInstance);
      return;
    }
    const before = firstSymbolId(mapInstance);
    const onStandard = !!mapInstance.getStyle()?.imports?.length;
    if (!mapInstance.getSource(PLACE_SOURCE)) {
      mapInstance.addSource(PLACE_SOURCE, {
        type: 'geojson',
        data: placesStore.features,
      });
      const fill: mapboxgl.FillLayer = {
        id: PLACE_FILL,
        type: 'fill',
        source: PLACE_SOURCE,
        paint: { 'fill-color': '#1f4b3a', 'fill-opacity': 0.18 },
      };
      const line: mapboxgl.LineLayer = {
        id: PLACE_LINE,
        type: 'line',
        source: PLACE_SOURCE,
        paint: { 'line-color': '#1f4b3a', 'line-width': 1.5 },
      };
      const selectedFill: mapboxgl.FillLayer = {
        id: PLACE_SELECT_FILL,
        type: 'fill',
        source: PLACE_SOURCE,
        filter: selectionFilter(),
        paint: { 'fill-color': '#1f4b3a', 'fill-opacity': 0.38 },
      };
      const selectedLine: mapboxgl.LineLayer = {
        id: PLACE_SELECT_LINE,
        type: 'line',
        source: PLACE_SOURCE,
        filter: selectionFilter(),
        paint: { 'line-color': '#143528', 'line-width': 3.5 },
      };
      if (onStandard) {
        fill.slot = 'top';
        line.slot = 'top';
        selectedFill.slot = 'top';
        selectedLine.slot = 'top';
      }
      mapInstance.addLayer(fill, onStandard ? undefined : before);
      mapInstance.addLayer(line, onStandard ? undefined : before);
      mapInstance.addLayer(selectedFill, onStandard ? undefined : before);
      mapInstance.addLayer(selectedLine, onStandard ? undefined : before);
      if (!listening) {
        mapInstance.on('click', PLACE_FILL, onPlaceClick);
        mapInstance.on('mouseenter', PLACE_FILL, () => {
          mapInstance.getCanvas().style.cursor = 'pointer';
        });
        mapInstance.on('mouseleave', PLACE_FILL, () => {
          mapInstance.getCanvas().style.cursor = '';
        });
        listening = true;
      }
    } else {
      const source = mapInstance.getSource(
        PLACE_SOURCE
      ) as mapboxgl.GeoJSONSource;
      source.setData(placesStore.features);
    }
    frameSelectedPlace(mapInstance);
  }

  /** Draw once the style can accept layers. */
  function drawWhenReady(mapInstance: mapboxgl.Map) {
    if (!mapInstance.isStyleLoaded()) return;
    syncPlaceOverlay(mapInstance);
  }

  watch(
    map,
    mapInstance => {
      if (!mapInstance) return;
      mapInstance.on('style.load', () => syncPlaceOverlay(mapInstance));
      drawWhenReady(mapInstance);
    },
    { flush: 'sync' }
  );

  watch(
    () => [placesStore.visible, placesStore.features] as const,
    () => {
      const mapInstance = map.value;
      if (mapInstance) drawWhenReady(mapInstance);
    }
  );

  watch(
    () => placesStore.selectedId,
    () => {
      const mapInstance = map.value;
      if (!mapInstance?.isStyleLoaded()) return;
      if (!mapInstance.getLayer(PLACE_SELECT_LINE)) return;
      frameSelectedPlace(mapInstance);
    }
  );
}
