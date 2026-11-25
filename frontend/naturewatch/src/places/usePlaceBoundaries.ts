import { nextTick, watch } from 'vue';
import type * as mapboxgl from 'mapbox-gl';
import useBasemapStore from '@/store/BasemapStore';
import usePlacesStore from '@/store/PlacesStore';
import { useMeasureStore } from '@/store/MeasureStore';
import {
  PLACE_TYPE,
  PLACE_TILES_URL,
  PLACE_TILE_LAYER,
  RECOGNITION_TILES_URL,
  RECOGNITION_TILE_LAYER,
  ECOREGION_TILES_URL,
  ECOREGION_TILE_LAYER,
  loadPlaceBounds,
  loadPlaceName,
} from './api';
import {
  ECOREGION_COLOUR,
  ECOREGION_TYPE,
  RECOGNITION_COLOUR,
  boundsInsideFrame,
  isRecognitionButtonType,
  CONSERVATION_AREA_COLOUR,
  type LngLatBounds,
} from './display';

const PLACE_SOURCE = 'places-tiles';
const PLACE_FILL = 'places-fill';
const PLACE_LINE = 'places-line';
const PLACE_SELECT_LINE = 'places-select-line';
const PLACE_HOVER_LINE = 'places-hover-line';
const RECOGNITION_SOURCE = 'recognitions-tiles';
const RECOGNITION_FILL = 'recognitions-fill';
const RECOGNITION_LINE = 'recognitions-line';
const RECOGNITION_SELECT_LINE = 'recognitions-select-line';
const RECOGNITION_HOVER_LINE = 'recognitions-hover-line';
const ECOREGION_SOURCE = 'ecoregions-tiles';
const ECOREGION_FILL = 'ecoregions-fill';
const ECOREGION_LINE = 'ecoregions-line';
const ECOREGION_SELECT_LINE = 'ecoregions-select-line';
const ECOREGION_HOVER_LINE = 'ecoregions-hover-line';

/** Outline width of recognitions and ecoregions, by zoom. */
const OUTLINE_WIDTH = [
  'interpolate',
  ['linear'],
  ['zoom'],
  3,
  0.8,
  6,
  1.4,
  9,
  2,
  12,
  2.6,
] as mapboxgl.ExpressionSpecification;

const PLACE_FILL_OPACITY = [
  'interpolate',
  ['linear'],
  ['zoom'],
  4,
  0.6,
  7,
  0.2,
  9,
  0.06,
] as mapboxgl.ExpressionSpecification;

/** Green on the monochrome basemap, off-white on satellite imagery. */
const PLACE_COLOUR = {
  monochrome: { place: CONSERVATION_AREA_COLOUR, selected: '#143528' },
  satellite: { place: '#f4f1e8', selected: '#fbfaf5' },
};

/**
 * Solid patches at a country or world view, so small places stay readable.
 * Closer in, the fill is faint enough that overlapping places show as darker
 * areas, and the outline carries the boundary. A selected place keeps the
 * same fill and gains a thicker outline.
 * @param satellite - Whether the satellite basemap is shown.
 * @returns Paint for each place layer.
 */
function placePaint(satellite: boolean) {
  const colour = satellite ? PLACE_COLOUR.satellite : PLACE_COLOUR.monochrome;
  return {
    fill: {
      'fill-color': colour.place,
      'fill-opacity': PLACE_FILL_OPACITY,
    },
    line: {
      'line-color': colour.place,
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0, 7, 0.9],
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        5,
        0.5,
        8,
        1.3,
        12,
        2,
      ],
    },
    selectedLine: { 'line-color': colour.selected, 'line-width': 2 },
    hoverLine: { 'line-color': colour.selected, 'line-width': 1.75 },
  } satisfies {
    fill: mapboxgl.FillLayer['paint'];
    line: mapboxgl.LineLayer['paint'];
    selectedLine: mapboxgl.LineLayer['paint'];
    hoverLine: mapboxgl.LineLayer['paint'];
  };
}

/**
 * Recognitions are outlines only, one colour per group. The fill is
 * transparent and only catches clicks. A selected recognition gets a thicker
 * line in its own colour.
 * @param satellite - Whether the satellite basemap is shown.
 * @returns Paint for each recognition layer.
 */
function recognitionPaint(satellite: boolean) {
  const colours = satellite
    ? RECOGNITION_COLOUR.satellite
    : RECOGNITION_COLOUR.monochrome;
  const colour = [
    'match',
    ['get', 'place_type_id'],
    'world_heritage_site',
    colours.world_heritage_site,
    'ramsar_site',
    colours.ramsar_site,
    'biosphere_reserve',
    colours.biosphere_reserve,
    colours.other,
  ] as mapboxgl.ExpressionSpecification;
  return {
    fill: { 'fill-color': '#000000', 'fill-opacity': 0 },
    line: { 'line-color': colour, 'line-width': OUTLINE_WIDTH },
    selectedLine: { 'line-color': colour, 'line-width': 2.5 },
    hoverLine: { 'line-color': colour, 'line-width': 2 },
  } satisfies {
    fill: mapboxgl.FillLayer['paint'];
    line: mapboxgl.LineLayer['paint'];
    selectedLine: mapboxgl.LineLayer['paint'];
    hoverLine: mapboxgl.LineLayer['paint'];
  };
}

/**
 * Ecoregions are outlines only, in one colour, like recognitions. The fill is
 * transparent and only catches clicks.
 * @param satellite - Whether the satellite basemap is shown.
 * @returns Paint for each ecoregion layer.
 */
function ecoregionPaint(satellite: boolean) {
  const colour = satellite
    ? ECOREGION_COLOUR.satellite
    : ECOREGION_COLOUR.monochrome;
  return {
    fill: { 'fill-color': '#000000', 'fill-opacity': 0 },
    line: { 'line-color': colour, 'line-width': OUTLINE_WIDTH },
    selectedLine: { 'line-color': colour, 'line-width': 2.5 },
    hoverLine: { 'line-color': colour, 'line-width': 2 },
  } satisfies {
    fill: mapboxgl.FillLayer['paint'];
    line: mapboxgl.LineLayer['paint'];
    selectedLine: mapboxgl.LineLayer['paint'];
    hoverLine: mapboxgl.LineLayer['paint'];
  };
}

/**
 * The map methods this overlay uses.
 * The full Mapbox map type is too large to pass through a ref.
 */
interface PlaceMap {
  isStyleLoaded(): boolean;
}

/**
 * Draw the conservation-area boundaries, highlight a selection, and frame it.
 * A boundary click does not open the places list.
 * @param getMap - The Mapbox map, once MapComponent has created it.
 * @returns A control that fits the map to the selected place.
 */
export function usePlaceBoundaries(getMap: () => PlaceMap | null): {
  zoomToSelectedPlace: () => void;
} {
  const placesStore = usePlacesStore();
  const basemapStore = useBasemapStore();
  const measureStore = useMeasureStore();
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

  /** Filter that keeps only the place whose card is hovered. */
  function hoverFilter(): mapboxgl.FilterSpecification {
    return ['==', ['get', 'id'], placesStore.hoveredId ?? ''];
  }

  /**
   * Outline the place whose card is hovered, from whichever archive holds it.
   * The map does not move; a place out of view shows nothing.
   * @param mapInstance - The map.
   */
  function highlightHover(mapInstance: mapboxgl.Map) {
    [ECOREGION_HOVER_LINE, PLACE_HOVER_LINE, RECOGNITION_HOVER_LINE].forEach(
      layer => {
        if (mapInstance.getLayer(layer))
          mapInstance.setFilter(layer, hoverFilter());
      }
    );
  }

  /**
   * Filter that keeps the places the size and cropland filter keeps, and,
   * while ecoregions are chosen, only the places linked to one of them. The
   * tiles do not hold the links, so those places are kept by id.
   */
  function keptFilter(): mapboxgl.FilterSpecification | null {
    const linked = placesStore.ecoregionPlaceIds;
    return allOf(
      placesStore.tileFilter as mapboxgl.FilterSpecification | null,
      linked ? ['in', ['get', 'id'], ['literal', linked]] : null
    );
  }

  /**
   * Filter that leaves out withdrawn places, which the tiles still hold until
   * they are rebuilt. Null when none is withdrawn.
   */
  function withdrawnFilter(): mapboxgl.FilterSpecification | null {
    const ids = placesStore.withdrawnIds;
    if (!ids.length) return null;
    return ['!', ['in', ['get', 'id'], ['literal', ids]]];
  }

  /**
   * Every filter given, combined.
   * @param filters - Filters, or null for none.
   * @returns One filter, or null when none is given.
   */
  function allOf(
    ...filters: (mapboxgl.FilterSpecification | null)[]
  ): mapboxgl.FilterSpecification | null {
    const set = filters.filter(
      (filter): filter is mapboxgl.FilterSpecification => filter !== null
    );
    if (set.length === 0) return null;
    if (set.length === 1) return set[0];
    return ['all', ...set] as mapboxgl.FilterSpecification;
  }

  /** The recognition types listed. */
  function listedRecognitions(): string[] {
    return placesStore.listTypes.filter(type => isRecognitionButtonType(type));
  }

  /** Filter that keeps the listed recognition types within the size filter. */
  function recognitionFilter(): mapboxgl.FilterSpecification {
    const type: mapboxgl.FilterSpecification = [
      'in',
      ['get', 'place_type_id'],
      ['literal', listedRecognitions()],
    ];
    return allOf(type, keptFilter(), withdrawnFilter()) ?? type;
  }

  /**
   * Hide the boundaries the size and cropland filter leaves out, and withdrawn
   * places. Conservation areas draw while they are listed, or while no
   * recognition type and no ecoregion is. Each listed recognition type draws.
   * Ecoregions draw while they are listed. A selected place's outline always
   * draws.
   * While a profile's Related tab is open, the conservation areas it lists
   * draw instead, whatever the list and the filter show. While an admin list
   * is open, only the selected and hovered outlines draw.
   * @param mapInstance - The map.
   */
  function applyKeptFilter(mapInstance: mapboxgl.Map) {
    const areas = placesStore.shownAreaIds;
    const filter = allOf(
      areas ? ['in', ['get', 'id'], ['literal', areas]] : keptFilter(),
      withdrawnFilter()
    );
    const queueOnly = placesStore.adminList !== null && !placesStore.visible;
    const recognitions = listedRecognitions().length > 0 && !queueOnly;
    const ecoregions =
      placesStore.listTypes.includes(ECOREGION_TYPE) && !queueOnly;
    const conservationAreas =
      !queueOnly &&
      (placesStore.listTypes.includes(PLACE_TYPE) || !placesStore.sizeOnly);
    [PLACE_FILL, PLACE_LINE].forEach(layer => {
      if (!mapInstance.getLayer(layer)) return;
      mapInstance.setFilter(layer, filter);
      mapInstance.setLayoutProperty(
        layer,
        'visibility',
        areas || conservationAreas ? 'visible' : 'none'
      );
    });
    const ecoregionFilter = allOf(keptFilter(), withdrawnFilter());
    [ECOREGION_FILL, ECOREGION_LINE].forEach(layer => {
      if (!mapInstance.getLayer(layer)) return;
      mapInstance.setFilter(layer, ecoregionFilter);
      mapInstance.setLayoutProperty(
        layer,
        'visibility',
        ecoregions ? 'visible' : 'none'
      );
    });
    [RECOGNITION_FILL, RECOGNITION_LINE].forEach(layer => {
      if (!mapInstance.getLayer(layer)) return;
      mapInstance.setFilter(layer, recognitionFilter());
      mapInstance.setLayoutProperty(
        layer,
        'visibility',
        recognitions ? 'visible' : 'none'
      );
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

  /** Highlight the selected boundary, from whichever archive holds it. */
  function highlightSelection(mapInstance: mapboxgl.Map) {
    [ECOREGION_SELECT_LINE, PLACE_SELECT_LINE, RECOGNITION_SELECT_LINE].forEach(
      layer => {
        if (mapInstance.getLayer(layer))
          mapInstance.setFilter(layer, selectionFilter());
      }
    );
  }

  /** Whether the satellite basemap is shown. */
  function onSatellite(): boolean {
    return basemapStore.currentBasemap.title === 'Satellite';
  }

  /**
   * Colour the drawn places for the current basemap.
   * @param mapInstance - The map.
   */
  function applyBasemapPaint(mapInstance: mapboxgl.Map) {
    const paint = placePaint(onSatellite());
    const recognition = recognitionPaint(onSatellite());
    const ecoregion = ecoregionPaint(onSatellite());
    const layers: [string, Record<string, unknown>][] = [
      [ECOREGION_LINE, ecoregion.line],
      [ECOREGION_SELECT_LINE, ecoregion.selectedLine],
      [ECOREGION_HOVER_LINE, ecoregion.hoverLine],
      [PLACE_FILL, paint.fill],
      [PLACE_LINE, paint.line],
      [PLACE_SELECT_LINE, paint.selectedLine],
      [PLACE_HOVER_LINE, paint.hoverLine],
      [RECOGNITION_LINE, recognition.line],
      [RECOGNITION_SELECT_LINE, recognition.selectedLine],
      [RECOGNITION_HOVER_LINE, recognition.hoverLine],
    ];
    layers.forEach(([layer, properties]) => {
      if (!mapInstance.getLayer(layer)) return;
      Object.entries(properties).forEach(([name, value]) =>
        mapInstance.setPaintProperty(layer, name as never, value as never)
      );
    });
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
      {
        padding: panelPadding(mapInstance),
        retainPadding: false,
        maxZoom: 10,
        duration: 800,
      }
    );
  }

  /** Fit the map to the selected place, even when it is already in view. */
  function zoomToSelectedPlace() {
    const mapInstance = readMap();
    if (!mapInstance) return;
    void frameSelectedPlace(mapInstance, true);
  }

  /** Remove the place, recognition, and ecoregion boundaries. */
  function removePlaceOverlay(mapInstance: mapboxgl.Map) {
    [
      ECOREGION_HOVER_LINE,
      ECOREGION_SELECT_LINE,
      ECOREGION_LINE,
      ECOREGION_FILL,
      RECOGNITION_HOVER_LINE,
      PLACE_HOVER_LINE,
      RECOGNITION_SELECT_LINE,
      RECOGNITION_LINE,
      RECOGNITION_FILL,
      PLACE_SELECT_LINE,
      PLACE_LINE,
      PLACE_FILL,
    ].forEach(layer => {
      if (mapInstance.getLayer(layer)) mapInstance.removeLayer(layer);
    });
    [RECOGNITION_SOURCE, PLACE_SOURCE, ECOREGION_SOURCE].forEach(source => {
      if (mapInstance.getSource(source)) mapInstance.removeSource(source);
    });
  }

  /**
   * Select the boundary under a click or tap, or clear it when it is already
   * selected.
   * @param event - The click or the end of the tap.
   */
  function choosePlace(event: mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent) {
    // A click while measuring places a point. It does not choose a place.
    if (measureStore.drawing) return;
    // An ecoregion lies under the parks drawn inside it. A click on a park opens the park.
    if (event.features?.[0]?.layer?.id === ECOREGION_FILL && drawnAbove(event))
      return;
    const id = event.features?.[0]?.properties?.id;
    if (id === undefined || id === null || id === '') return;
    const placeId = String(id);
    placesStore.selectPlace(placeId, 'map');
  }

  /**
   * Whether a drawn conservation area or recognition is under the event.
   * @param event - The click or the end of the tap.
   * @returns True when one is.
   */
  function drawnAbove(
    event: mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent
  ): boolean {
    const mapInstance = readMap();
    if (!mapInstance) return false;
    const layers = [PLACE_FILL, RECOGNITION_FILL].filter(
      layer =>
        mapInstance.getLayer(layer) &&
        mapInstance.getLayoutProperty(layer, 'visibility') !== 'none'
    );
    if (!layers.length) return false;
    return (
      mapInstance.queryRenderedFeatures(event.point, { layers }).length > 0
    );
  }

  /** The pointer rests this long, in ms, before a place's name shows. */
  const TIP_DELAY = 600;
  /** A move under this many pixels does not restart the wait. */
  const TIP_SLOP = 4;
  let tipTimer: ReturnType<typeof setTimeout> | null = null;
  let tipPoint: { x: number; y: number } | null = null;

  /**
   * The drawn place under a point: a conservation area or recognition before
   * the ecoregion under it, as for a click.
   * @param mapInstance - The map.
   * @param point - The point, in pixels.
   * @returns The place id, or null.
   */
  function placeAt(
    mapInstance: mapboxgl.Map,
    point: { x: number; y: number }
  ): string | null {
    const layers = [PLACE_FILL, RECOGNITION_FILL, ECOREGION_FILL].filter(
      layer =>
        mapInstance.getLayer(layer) &&
        mapInstance.getLayoutProperty(layer, 'visibility') !== 'none'
    );
    if (!layers.length) return null;
    const features = mapInstance.queryRenderedFeatures([point.x, point.y], {
      layers,
    });
    const top =
      features.find(feature => feature.layer?.id !== ECOREGION_FILL) ??
      features[0];
    const id = top?.properties?.id;
    return id === undefined || id === null || id === '' ? null : String(id);
  }

  /** Hide the name and stop waiting to show one. */
  function hideTip() {
    if (tipTimer) clearTimeout(tipTimer);
    tipTimer = null;
    tipPoint = null;
    placesStore.mapTip = null;
  }

  /**
   * Show the name of the place under the pointer once it has rested there.
   * @param event - The pointer move.
   */
  function onMapMouseMove(event: mapboxgl.MapMouseEvent) {
    const point = { x: event.point.x, y: event.point.y };
    if (
      tipPoint &&
      Math.abs(point.x - tipPoint.x) < TIP_SLOP &&
      Math.abs(point.y - tipPoint.y) < TIP_SLOP
    )
      return;
    hideTip();
    if (measureStore.drawing) return;
    tipPoint = point;
    tipTimer = setTimeout(async () => {
      tipTimer = null;
      const mapInstance = readMap();
      if (!mapInstance || tipPoint !== point) return;
      const id = placeAt(mapInstance, point);
      if (!id) return;
      const name = await loadPlaceName(id);
      if (name && tipPoint === point)
        placesStore.mapTip = { name, x: point.x, y: point.y };
    }, TIP_DELAY);
  }

  /** Where and when a one-finger touch on a boundary began. */
  let touchStart: { x: number; y: number; time: number } | null = null;
  /** When a tap last chose a place. */
  let lastTap = -Infinity;
  /** A tap moves less than this, in pixels, and lasts less than this, in ms. */
  const TAP_SLOP = 10;
  const TAP_TIME = 500;

  /**
   * Choose the clicked boundary. A click just after a tap is the browser's
   * copy of that tap, and is skipped.
   * @param event - The click.
   */
  function onPlaceClick(event: mapboxgl.MapMouseEvent) {
    if (event.originalEvent.timeStamp - lastTap < 800) return;
    choosePlace(event);
  }

  /**
   * Note where a one-finger touch on a boundary began.
   * @param event - The touch start.
   */
  function onPlaceTouchStart(event: mapboxgl.MapTouchEvent) {
    touchStart =
      event.originalEvent.touches.length === 1
        ? {
            x: event.point.x,
            y: event.point.y,
            time: event.originalEvent.timeStamp,
          }
        : null;
  }

  /**
   * Choose the tapped boundary. Mapbox Draw, which Measure uses, cancels the
   * click a browser makes from a tap, so a tap is read from the touch itself.
   * @param event - The touch end.
   */
  function onPlaceTouchEnd(event: mapboxgl.MapTouchEvent) {
    const start = touchStart;
    touchStart = null;
    if (!start) return;
    const time = event.originalEvent.timeStamp;
    const moved = Math.hypot(event.point.x - start.x, event.point.y - start.y);
    if (moved > TAP_SLOP || time - start.time > TAP_TIME) return;
    lastTap = time;
    choosePlace(event);
  }

  /**
   * Report a failed tile read as the overlay status.
   * @param event - A map error.
   */
  function onMapError(event: mapboxgl.ErrorEvent & { sourceId?: string }) {
    if (
      event.sourceId === PLACE_SOURCE ||
      event.sourceId === RECOGNITION_SOURCE ||
      event.sourceId === ECOREGION_SOURCE
    )
      placesStore.status = 'error';
  }

  /** Draw or clear the conservation-area, recognition, and ecoregion boundaries. */
  function syncPlaceOverlay(mapInstance: mapboxgl.Map) {
    if (
      !placesStore.visible &&
      !placesStore.shownAreaIds &&
      !placesStore.adminList
    ) {
      removePlaceOverlay(mapInstance);
      return;
    }
    const before = firstSymbolId(mapInstance);
    const onStandard = !!mapInstance.getStyle()?.imports?.length;
    // Ecoregions are added first, so parks and recognitions draw above them.
    if (!mapInstance.getSource(ECOREGION_SOURCE)) {
      mapInstance.addSource(ECOREGION_SOURCE, {
        type: 'vector',
        url: ECOREGION_TILES_URL,
      });
      const paint = ecoregionPaint(onSatellite());
      const layers: (mapboxgl.FillLayer | mapboxgl.LineLayer)[] = [
        {
          id: ECOREGION_FILL,
          type: 'fill',
          source: ECOREGION_SOURCE,
          'source-layer': ECOREGION_TILE_LAYER,
          paint: paint.fill,
        },
        {
          id: ECOREGION_LINE,
          type: 'line',
          source: ECOREGION_SOURCE,
          'source-layer': ECOREGION_TILE_LAYER,
          layout: { 'line-join': 'round' },
          paint: paint.line,
        },
        {
          id: ECOREGION_SELECT_LINE,
          type: 'line',
          source: ECOREGION_SOURCE,
          'source-layer': ECOREGION_TILE_LAYER,
          filter: selectionFilter(),
          layout: { 'line-join': 'round' },
          paint: paint.selectedLine,
        },
        {
          id: ECOREGION_HOVER_LINE,
          type: 'line',
          source: ECOREGION_SOURCE,
          'source-layer': ECOREGION_TILE_LAYER,
          filter: hoverFilter(),
          layout: { 'line-join': 'round' },
          paint: paint.hoverLine,
        },
      ];
      layers.forEach(layer => {
        if (onStandard) layer.slot = 'top';
        mapInstance.addLayer(layer, onStandard ? undefined : before);
      });
    }
    if (!mapInstance.getSource(PLACE_SOURCE)) {
      mapInstance.addSource(PLACE_SOURCE, {
        type: 'vector',
        url: PLACE_TILES_URL,
      });
      const paint = placePaint(onSatellite());
      const fill: mapboxgl.FillLayer = {
        id: PLACE_FILL,
        type: 'fill',
        source: PLACE_SOURCE,
        'source-layer': PLACE_TILE_LAYER,
        paint: paint.fill,
      };
      const line: mapboxgl.LineLayer = {
        id: PLACE_LINE,
        type: 'line',
        source: PLACE_SOURCE,
        'source-layer': PLACE_TILE_LAYER,
        paint: paint.line,
      };
      const selectedLine: mapboxgl.LineLayer = {
        id: PLACE_SELECT_LINE,
        type: 'line',
        source: PLACE_SOURCE,
        'source-layer': PLACE_TILE_LAYER,
        filter: selectionFilter(),
        paint: paint.selectedLine,
      };
      const hoverLine: mapboxgl.LineLayer = {
        id: PLACE_HOVER_LINE,
        type: 'line',
        source: PLACE_SOURCE,
        'source-layer': PLACE_TILE_LAYER,
        filter: hoverFilter(),
        paint: paint.hoverLine,
      };
      if (onStandard) {
        fill.slot = 'top';
        line.slot = 'top';
        selectedLine.slot = 'top';
        hoverLine.slot = 'top';
      }
      mapInstance.addLayer(fill, onStandard ? undefined : before);
      mapInstance.addLayer(line, onStandard ? undefined : before);
      mapInstance.addLayer(selectedLine, onStandard ? undefined : before);
      mapInstance.addLayer(hoverLine, onStandard ? undefined : before);
    }
    if (!mapInstance.getSource(RECOGNITION_SOURCE)) {
      mapInstance.addSource(RECOGNITION_SOURCE, {
        type: 'vector',
        url: RECOGNITION_TILES_URL,
      });
      const paint = recognitionPaint(onSatellite());
      const layers: (mapboxgl.FillLayer | mapboxgl.LineLayer)[] = [
        {
          id: RECOGNITION_FILL,
          type: 'fill',
          source: RECOGNITION_SOURCE,
          'source-layer': RECOGNITION_TILE_LAYER,
          paint: paint.fill,
        },
        {
          id: RECOGNITION_LINE,
          type: 'line',
          source: RECOGNITION_SOURCE,
          'source-layer': RECOGNITION_TILE_LAYER,
          layout: { 'line-join': 'round' },
          paint: paint.line,
        },
        {
          id: RECOGNITION_SELECT_LINE,
          type: 'line',
          source: RECOGNITION_SOURCE,
          'source-layer': RECOGNITION_TILE_LAYER,
          filter: selectionFilter(),
          layout: { 'line-join': 'round' },
          paint: paint.selectedLine,
        },
        {
          id: RECOGNITION_HOVER_LINE,
          type: 'line',
          source: RECOGNITION_SOURCE,
          'source-layer': RECOGNITION_TILE_LAYER,
          filter: hoverFilter(),
          layout: { 'line-join': 'round' },
          paint: paint.hoverLine,
        },
      ];
      layers.forEach(layer => {
        if (onStandard) layer.slot = 'top';
        mapInstance.addLayer(layer, onStandard ? undefined : before);
      });
    }
    if (!listening) {
      [PLACE_FILL, RECOGNITION_FILL, ECOREGION_FILL].forEach(layer => {
        mapInstance.on('click', layer, onPlaceClick);
        mapInstance.on('touchstart', layer, onPlaceTouchStart);
        mapInstance.on('touchend', layer, onPlaceTouchEnd);
        mapInstance.on('mouseenter', layer, () => {
          mapInstance.getCanvas().style.cursor = 'pointer';
        });
        mapInstance.on('mouseleave', layer, () => {
          mapInstance.getCanvas().style.cursor = '';
        });
      });
      mapInstance.on('mousemove', onMapMouseMove);
      mapInstance.on('mouseout', hideTip);
      mapInstance.on('movestart', hideTip);
      mapInstance.on('mousedown', hideTip);
      mapInstance.on('error', onMapError);
      listening = true;
    }
    applyKeptFilter(mapInstance);
    void frameSelectedPlace(mapInstance);
  }

  /** Draw once the style can accept layers. */
  function drawWhenReady(mapInstance: mapboxgl.Map) {
    whenStyleReady(mapInstance, () => syncPlaceOverlay(mapInstance));
  }

  /**
   * Run a change to the overlay now, or once the map is idle. `isStyleLoaded`
   * is also false while tiles load, so a change made then must not be dropped.
   * Layers can be changed as soon as the style itself has loaded.
   * @param mapInstance - The map.
   * @param change - The change to make.
   */
  function whenStyleReady(mapInstance: mapboxgl.Map, change: () => void) {
    const style = (mapInstance as unknown as { style?: { _loaded?: boolean } })
      .style;
    if (mapInstance.isStyleLoaded() || style?._loaded === true) {
      change();
      return;
    }
    mapInstance.once('idle', change);
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
    () =>
      [
        placesStore.visible,
        placesStore.shownAreaIds,
        placesStore.adminList,
      ] as const,
    () => {
      const mapInstance = readMap();
      if (mapInstance) drawWhenReady(mapInstance);
    }
  );

  watch(
    () => basemapStore.currentBasemap.title,
    () => {
      const mapInstance = readMap();
      if (mapInstance)
        whenStyleReady(mapInstance, () => applyBasemapPaint(mapInstance));
    }
  );

  watch(
    () =>
      [
        placesStore.tileFilter,
        placesStore.listTypes,
        placesStore.withdrawnIds,
        placesStore.ecoregionPlaceIds,
      ] as const,
    () => {
      const mapInstance = readMap();
      if (mapInstance)
        whenStyleReady(mapInstance, () => applyKeptFilter(mapInstance));
    }
  );

  watch(
    () => placesStore.hoveredId,
    () => {
      const mapInstance = readMap();
      if (mapInstance) highlightHover(mapInstance);
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
