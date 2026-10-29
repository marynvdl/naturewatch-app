import { nextTick, watch } from 'vue';
import type * as mapboxgl from 'mapbox-gl';
import usePlacesStore from '@/store/PlacesStore';
import { PLACE_TILES_URL, PLACE_TILE_LAYER, loadPlaceBounds } from './api';
import { boundsInsideFrame, type LngLatBounds } from './display';

const PLACE_SOURCE = 'places-tiles';
const PLACE_FILL = 'places-fill';
const PLACE_LINE = 'places-line';
const PLACE_SELECT_FILL = 'places-select-fill';
const PLACE_SELECT_LINE = 'places-select-line';

/**
 * Solid patches at a country or world view, so small places stay readable.
 * Closer in, the fill is faint enough that overlapping places show as darker
 * areas, and the outline carries the boundary.
 */
const PLACE_PAINT = {
  fill: {
    'fill-color': '#1f4b3a',
    'fill-opacity': [
      'interpolate',
      ['linear'],
      ['zoom'],
      4,
      0.6,
      7,
      0.2,
      9,
      0.06,
    ],
  },
  line: {
    'line-color': '#1f4b3a',
    'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0, 7, 0.9],
    'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 8, 1.3, 12, 2],
  },
  selectedFill: { 'fill-color': '#143528', 'fill-opacity': 0.35 },
  selectedLine: { 'line-color': '#143528', 'line-width': 3 },
} satisfies {
  fill: mapboxgl.FillLayer['paint'];
  line: mapboxgl.LineLayer['paint'];
  selectedFill: mapboxgl.FillLayer['paint'];
  selectedLine: mapboxgl.LineLayer['paint'];
};

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
  let boundsListening = false;
  const knownBounds = new Map<string, LngLatBounds | null>();

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

  /** Filter that keeps the places the size and cropland filter keeps. */
  function keptFilter(): mapboxgl.FilterSpecification | null {
    return placesStore.tileFilter as mapboxgl.FilterSpecification | null;
  }

  /**
   * Hide the boundaries the size and cropland filter leaves out.
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

  /** Publish the current map view for the list extent option. */
  function publishViewBounds(mapInstance: mapboxgl.Map) {
    const view = mapInstance.getBounds();
    if (!view) return;
    placesStore.viewBounds = [
      view.getWest(),
      view.getSouth(),
      view.getEast(),
      view.getNorth(),
    ];
  }

  /** Extent of the selected place, or null when it has no stored shape. */
  async function selectedBounds(): Promise<LngLatBounds | null> {
    const id = placesStore.selectedId;
    if (!id) return null;
    if (knownBounds.has(id)) return knownBounds.get(id) ?? null;
    const result = await loadPlaceBounds(id);
    const bounds = result.status === 'ok' ? result.bounds : null;
    if (result.status === 'ok' || result.status === 'missing')
      knownBounds.set(id, bounds);
    return placesStore.selectedId === id ? bounds : null;
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
    const [place] = await Promise.all([
      selectedBounds(),
      panelsSettled(mapInstance),
    ]);
    if (placesStore.selectedId !== id) return;
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
  async function frameSelectedPlace(mapInstance: mapboxgl.Map, force = false) {
    highlightSelection(mapInstance);
    const id = placesStore.selectedId;
    const place = await selectedBounds();
    if (!place || placesStore.selectedId !== id) return;
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
    void frameSelectedPlace(mapInstance, true);
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

  /**
   * Report a failed tile read as the overlay status.
   * @param event - A map error.
   */
  function onMapError(event: mapboxgl.ErrorEvent & { sourceId?: string }) {
    if (event.sourceId === PLACE_SOURCE) placesStore.status = 'error';
  }

  /** Draw or clear the protected-area boundaries. */
  function syncPlaceOverlay(mapInstance: mapboxgl.Map) {
    if (!placesStore.visible) {
      removePlaceOverlay(mapInstance);
      return;
    }
    const before = firstSymbolId(mapInstance);
    const onStandard = !!mapInstance.getStyle()?.imports?.length;
    if (!mapInstance.getSource(PLACE_SOURCE)) {
      mapInstance.addSource(PLACE_SOURCE, {
        type: 'vector',
        url: PLACE_TILES_URL,
      });
      const fill: mapboxgl.FillLayer = {
        id: PLACE_FILL,
        type: 'fill',
        source: PLACE_SOURCE,
        'source-layer': PLACE_TILE_LAYER,
        paint: PLACE_PAINT.fill,
      };
      const line: mapboxgl.LineLayer = {
        id: PLACE_LINE,
        type: 'line',
        source: PLACE_SOURCE,
        'source-layer': PLACE_TILE_LAYER,
        paint: PLACE_PAINT.line,
      };
      const selectedFill: mapboxgl.FillLayer = {
        id: PLACE_SELECT_FILL,
        type: 'fill',
        source: PLACE_SOURCE,
        'source-layer': PLACE_TILE_LAYER,
        filter: selectionFilter(),
        paint: PLACE_PAINT.selectedFill,
      };
      const selectedLine: mapboxgl.LineLayer = {
        id: PLACE_SELECT_LINE,
        type: 'line',
        source: PLACE_SOURCE,
        'source-layer': PLACE_TILE_LAYER,
        filter: selectionFilter(),
        paint: PLACE_PAINT.selectedLine,
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
        mapInstance.on('error', onMapError);
        listening = true;
      }
    }
    applyKeptFilter(mapInstance);
    void frameSelectedPlace(mapInstance);
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
      if (!boundsListening) {
        instance.on('moveend', () => publishViewBounds(instance));
        boundsListening = true;
      }
      publishViewBounds(instance);
      drawWhenReady(instance);
    },
    { flush: 'sync' }
  );

  watch(
    () => placesStore.visible,
    () => {
      const mapInstance = readMap();
      if (mapInstance) drawWhenReady(mapInstance);
    }
  );

  watch(
    () => placesStore.tileFilter,
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
      await frameSelectedPlace(mapInstance);
    }
  );

  return { zoomToSelectedPlace };
}
