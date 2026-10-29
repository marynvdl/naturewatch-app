import { nextTick, watch } from 'vue';
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
 * The map methods this overlay uses.
 * The full Mapbox map type is too large to pass through a ref.
 */
interface PlaceMap {
  isStyleLoaded(): boolean;
}

/**
 * Draw the protected-area boundaries, highlight a selection, and frame it.
 * A boundary click does not open the places list.
 * @param getMap - The Mapbox map, once MapComponent has created it.
 * @returns A control that fits the map to the selected place.
 */
export function usePlaceBoundaries(getMap: () => PlaceMap | null): {
  zoomToSelectedPlace: () => void;
} {
  const placesStore = usePlacesStore();
  let listening = false;

  /** Read the map as the Mapbox instance this overlay draws on. */
  function readMap(): mapboxgl.Map | null {
    return getMap() as mapboxgl.Map | null;
  }

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

  /** Filter that keeps the places the list filter keeps. */
  function keptFilter(): mapboxgl.FilterSpecification | null {
    const ids = placesStore.keptIds;
    return ids ? ['in', ['get', 'id'], ['literal', ids]] : null;
  }

  /**
   * Hide the boundaries the list filter leaves out.
   * @param mapInstance - The map.
   */
  function applyKeptFilter(mapInstance: mapboxgl.Map) {
    const filter = keptFilter();
    [PLACE_FILL, PLACE_LINE].forEach(layer => {
      if (mapInstance.getLayer(layer)) mapInstance.setFilter(layer, filter);
    });
  }

  /**
   * How far the visible places panels reach over the map from its left edge.
   * @param mapInstance - The map.
   * @returns Pixels from the left of the map canvas.
   */
  function panelCover(mapInstance: mapboxgl.Map): number {
    const canvasLeft = mapInstance.getCanvas().getBoundingClientRect().left;
    let cover = 0;
    document.querySelectorAll('.places-frame, .place-profile').forEach(node => {
      if (!(node instanceof HTMLElement)) return;
      if (getComputedStyle(node).visibility === 'hidden') return;
      const box = node.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      cover = Math.max(cover, box.right - canvasLeft);
    });
    return Math.max(0, Math.round(cover));
  }

  /**
   * Leave room for a visible places panel on the left.
   * @param mapInstance - The map.
   * @returns Padding for fitBounds.
   */
  function panelPadding(mapInstance: mapboxgl.Map): {
    top: number;
    right: number;
    bottom: number;
    left: number;
  } {
    return {
      top: 72,
      right: 72,
      bottom: 72,
      left: Math.max(72, panelCover(mapInstance) + 24),
    };
  }

  /** Highlight the selected boundary. */
  function highlightSelection(mapInstance: mapboxgl.Map) {
    if (!mapInstance.getLayer(PLACE_SELECT_FILL)) return;
    const filter = selectionFilter();
    mapInstance.setFilter(PLACE_SELECT_FILL, filter);
    mapInstance.setFilter(PLACE_SELECT_LINE, filter);
  }

  /** Extent of the selected place, or null when it has no stored shape. */
  function selectedBounds(): LngLatBounds | null {
    const id = placesStore.selectedId;
    if (!id || !placesStore.features) return null;
    const feature = placesStore.features.features.find(
      item => item.properties.id === id
    );
    return feature ? geometryBounds(feature.geometry) : null;
  }

  /**
   * Wait until the place columns stop changing width, for at most a second.
   * @param mapInstance - The map.
   */
  async function panelsSettled(mapInstance: mapboxgl.Map) {
    let last = -1;
    let steady = 0;
    for (let frame = 0; frame < 60 && steady < 3; frame += 1) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const cover = panelCover(mapInstance);
      steady = cover === last ? steady + 1 : 0;
      last = cover;
    }
  }

  /**
   * Pan a place chosen on the map into the middle of the map beside the
   * panels, when the panels now hide part of it. The zoom stays.
   * @param mapInstance - The map.
   */
  async function centreCoveredPlace(mapInstance: mapboxgl.Map) {
    const id = placesStore.selectedId;
    await panelsSettled(mapInstance);
    if (placesStore.selectedId !== id) return;
    const place = selectedBounds();
    if (!place) return;
    const canvas = mapInstance.getCanvas().getBoundingClientRect();
    const cover = Math.min(panelCover(mapInstance), canvas.width);
    if (canvas.width - cover < 80) return;
    const northWest = mapInstance.project([place[0], place[3]]);
    const southEast = mapInstance.project([place[2], place[1]]);
    const shown: LngLatBounds = [cover, 0, canvas.width, canvas.height];
    const drawn: LngLatBounds = [
      northWest.x,
      northWest.y,
      southEast.x,
      southEast.y,
    ];
    if (boundsInsideFrame(shown, drawn)) return;
    mapInstance.easeTo({
      center: [(place[0] + place[2]) / 2, (place[1] + place[3]) / 2],
      padding: { left: cover, top: 0, right: 0, bottom: 0 },
      retainPadding: false,
      duration: 800,
    });
  }

  /**
   * Highlight the selected boundary.
   * Move the map when the place is outside the view, or whenever zoom is requested.
   * @param mapInstance - The map.
   * @param force - Fit even when the place is already in view.
   */
  function frameSelectedPlace(mapInstance: mapboxgl.Map, force = false) {
    highlightSelection(mapInstance);
    const place = selectedBounds();
    if (!place) return;
    const view = mapInstance.getBounds();
    if (!view) return;
    const frame: LngLatBounds = [
      view.getWest(),
      view.getSouth(),
      view.getEast(),
      view.getNorth(),
    ];
    if (!force && boundsInsideFrame(frame, place)) return;
    mapInstance.fitBounds(
      [
        [place[0], place[1]],
        [place[2], place[3]],
      ],
      { padding: panelPadding(mapInstance), maxZoom: 10, duration: 800 }
    );
  }

  /** Fit the map to the selected place, even when it is already in view. */
  function zoomToSelectedPlace() {
    const mapInstance = readMap();
    if (!mapInstance) return;
    frameSelectedPlace(mapInstance, true);
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
    placesStore.selectPlace(placeId, 'map');
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
    applyKeptFilter(mapInstance);
    frameSelectedPlace(mapInstance);
  }

  /** Draw once the style can accept layers. */
  function drawWhenReady(mapInstance: mapboxgl.Map) {
    if (!mapInstance.isStyleLoaded()) return;
    syncPlaceOverlay(mapInstance);
  }

  watch(
    getMap,
    mapInstance => {
      if (!mapInstance) return;
      const instance = mapInstance as mapboxgl.Map;
      instance.on('style.load', () => syncPlaceOverlay(instance));
      drawWhenReady(instance);
    },
    { flush: 'sync' }
  );

  watch(
    () => [placesStore.visible, placesStore.features] as const,
    () => {
      const mapInstance = readMap();
      if (mapInstance) drawWhenReady(mapInstance);
    }
  );

  watch(
    () => placesStore.keptIds,
    () => {
      const mapInstance = readMap();
      if (mapInstance?.isStyleLoaded()) applyKeptFilter(mapInstance);
    }
  );

  watch(
    () => placesStore.selectedId,
    async () => {
      await nextTick();
      const mapInstance = readMap();
      if (!mapInstance) return;
      if (placesStore.selectedFrom === 'map') {
        highlightSelection(mapInstance);
        await centreCoveredPlace(mapInstance);
        return;
      }
      frameSelectedPlace(mapInstance);
    }
  );

  return { zoomToSelectedPlace };
}
