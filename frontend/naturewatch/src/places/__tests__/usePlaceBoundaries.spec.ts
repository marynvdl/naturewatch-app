import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { shallowRef } from 'vue';
import {
  ECOREGION_TILES_URL,
  PLACE_TILES_URL,
  RECOGNITION_TILES_URL,
  loadEcoregionColours,
  loadPlaceBounds,
  loadPlaceExtent,
  loadPlaceRelease,
} from '@/places/api';
import { usePlaceBoundaries } from '@/places/usePlaceBoundaries';
import useBasemapStore from '@/store/BasemapStore';
import usePlacesStore from '@/store/PlacesStore';

vi.mock('@/places/api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/places/api')>()),
  loadEcoregionColours: vi.fn(),
  loadPlaceBounds: vi.fn(),
  loadPlaceExtent: vi.fn(),
  loadPlaceRelease: vi.fn(),
  loadPlaceName: vi.fn(async (id: string) => `Name of ${id}`),
}));

vi.stubGlobal(
  'matchMedia',
  (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    }) as unknown as MediaQueryList
);

type Handler = (event: unknown) => void;

/** The parts of a Mapbox map the overlay touches. */
class FakeMap {
  sources = new Map<string, Record<string, unknown>>();
  layers = new Map<string, Record<string, unknown>>();
  handlers: { type: string; layer?: string; handler: Handler }[] = [];
  fitBounds = vi.fn();
  /** The camera a fit would take: a zoom only. */
  cameraForBounds = vi.fn(() => ({ zoom: 6 }));
  /** The map's own padding, which an ease or a jump sets. */
  padding = { top: 0, right: 0, bottom: 0, left: 0 };
  easeTo = vi.fn((options: { padding?: FakeMap['padding'] }) => {
    if (
      options.padding &&
      (options as { retainPadding?: boolean }).retainPadding !== false
    )
      this.padding = options.padding;
  });
  flyTo = vi.fn((options: { padding?: FakeMap['padding'] }) => {
    if (options.padding) this.padding = options.padding;
  });
  jumpTo = vi.fn((options: { padding?: FakeMap['padding'] }) => {
    if (options.padding) this.padding = options.padding;
  });
  /** Whether a camera move is under way. */
  moving = false;
  isMoving() {
    return this.moving;
  }
  getPadding() {
    return this.padding;
  }
  unproject([x, y]: [number, number]) {
    return { lng: x, lat: y };
  }
  setFilter = vi.fn();
  setPaintProperty = vi.fn();
  setLayoutProperty = vi.fn();
  /** Features under a point, by layer: none unless a test sets them. */
  queryRenderedFeatures = vi.fn((): unknown[] => []);
  /** The last visibility set on a layer. */
  getLayoutProperty(layer: string, name: string) {
    const calls = this.setLayoutProperty.mock.calls.filter(
      call => call[0] === layer && call[1] === name
    );
    return calls.length ? calls[calls.length - 1][2] : undefined;
  }
  /** False while tiles load, as Mapbox reports it. */
  tilesLoaded = true;
  /** The style itself, which is all a layer change needs. */
  style = { _loaded: true };
  isStyleLoaded() {
    return this.tilesLoaded;
  }
  once(type: string, handler: Handler) {
    this.handlers.push({ type, handler });
    return this;
  }
  getStyle() {
    return { layers: [], imports: [{}] };
  }
  getBounds() {
    return {
      getWest: () => 16,
      getSouth: () => -35,
      getEast: () => 33,
      getNorth: () => -22,
    };
  }
  getCanvas() {
    return {
      style: {} as Record<string, string>,
      getBoundingClientRect: () => ({
        left: 0,
        right: 1200,
        width: 1200,
        height: 800,
      }),
    };
  }
  project([lng, lat]: [number, number]) {
    return { x: lng, y: lat };
  }
  addSource(id: string, spec: Record<string, unknown>) {
    this.sources.set(id, spec);
  }
  getSource(id: string) {
    return this.sources.get(id);
  }
  removeSource(id: string) {
    this.sources.delete(id);
  }
  addLayer(spec: Record<string, unknown>) {
    this.layers.set(spec.id as string, spec);
  }
  getLayer(id: string) {
    return this.layers.get(id);
  }
  removeLayer(id: string) {
    this.layers.delete(id);
  }
  on(type: string, layerOrHandler: string | Handler, maybe?: Handler) {
    if (typeof layerOrHandler === 'string')
      this.handlers.push({ type, layer: layerOrHandler, handler: maybe! });
    else this.handlers.push({ type, handler: layerOrHandler });
    return this;
  }
  fire(type: string, layer: string | undefined, event: unknown) {
    this.handlers
      .filter(item => item.type === type && item.layer === layer)
      .forEach(item => item.handler(event));
  }
}

const outsideWindow = '33333333-3333-3333-3333-333333333333';
const parkId = '11111111-1111-1111-1111-111111111111';

/**
 * Mount the overlay on a fake map and show Conservation areas.
 * @returns The map and the store.
 */
async function drawPlaces() {
  const map = new FakeMap();
  const ref = shallowRef<FakeMap | null>(null);
  const { followPanels } = usePlaceBoundaries(() => ref.value);
  ref.value = map;
  const store = usePlacesStore();
  store.toggle();
  await flushPromises();
  // Let the first frame check wait out the panels, as it does on the page.
  for (let frame = 0; frame < 10; frame += 1)
    await new Promise(resolve => requestAnimationFrame(resolve));
  await flushPromises();
  return { map, store, followPanels };
}

/**
 * A panel's box, the full height of the map.
 * @param box - Its left and right edges.
 * @param box.left - Left edge, in pixels.
 * @param box.right - Right edge, in pixels.
 * @returns The box.
 */
function panelBox(box: { left: number; right: number }): DOMRect {
  return {
    ...box,
    top: 0,
    bottom: 800,
    width: box.right - box.left,
    height: 800,
  } as DOMRect;
}

/**
 * Put a panel in the page at a given box.
 * @param attributes - Its class or id.
 * @param attributes.className - Its class.
 * @param attributes.id - Its id.
 * @param box - Where it sits, in pixels.
 * @param box.left - Left edge, in pixels.
 * @param box.right - Right edge, in pixels.
 * @returns The panel.
 */
function addPanel(
  attributes: { className?: string; id?: string },
  box: { left: number; right: number }
): HTMLElement {
  const panel = document.createElement('div');
  if (attributes.className) panel.className = attributes.className;
  if (attributes.id) panel.id = attributes.id;
  panel.getBoundingClientRect = () => panelBox(box);
  document.body.append(panel);
  return panel;
}

describe('place boundaries from tiles', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.mocked(loadEcoregionColours).mockResolvedValue({ status: 'error' });
    vi.mocked(loadPlaceRelease).mockResolvedValue({
      status: 'ok',
      releaseMonth: '2026-10-01',
    });
    vi.mocked(loadPlaceBounds).mockResolvedValue({
      status: 'ok',
      bounds: [40, -10, 41, -9],
    });
  });

  it('draws from the PMTiles archive and filters on the tile fields', async () => {
    const { map, store } = await drawPlaces();

    expect(map.getSource('places-tiles')).toEqual({
      type: 'vector',
      url: PLACE_TILES_URL,
    });
    expect(map.getLayer('places-fill')).toMatchObject({
      'source-layer': 'places',
    });
    expect(store.notice).toContain('October 2026');

    store.applyFilter([100, null]);
    await flushPromises();
    expect(map.setFilter).toHaveBeenCalledWith('places-fill', [
      'all',
      ['>=', ['to-number', ['get', 'area_km2'], -1], 100],
    ]);
  });

  it('opens a clicked place that is not in the list window and frames it', async () => {
    const { map, store } = await drawPlaces();

    map.fire('click', 'places-fill', {
      features: [{ properties: { id: outsideWindow } }],
      originalEvent: { timeStamp: 0 },
    });
    expect(store.selectedId).toBe(outsideWindow);
    expect(store.selectedFrom).toBe('map');
    await vi.waitFor(() =>
      expect(map.flyTo).toHaveBeenCalledWith(
        expect.objectContaining({
          center: [40.5, expect.closeTo(-9.5, 2)],
          speed: 0.35,
        })
      )
    );
    expect(loadPlaceBounds).toHaveBeenCalledWith(outsideWindow);
  });

  it('opens a tapped place, and skips the click a browser may send after it', async () => {
    const { map, store } = await drawPlaces();
    const features = [{ properties: { id: outsideWindow } }];

    map.fire('touchstart', 'places-fill', {
      point: { x: 100, y: 100 },
      originalEvent: { touches: [{}], timeStamp: 1000 },
      features,
    });
    map.fire('touchend', 'places-fill', {
      point: { x: 103, y: 101 },
      originalEvent: { touches: [], timeStamp: 1120 },
      features,
    });
    expect(store.selectedId).toBe(outsideWindow);

    // The same tap as a click would close the place again
    map.fire('click', 'places-fill', {
      features,
      originalEvent: { timeStamp: 1200 },
    });
    expect(store.selectedId).toBe(outsideWindow);
  });

  it('does not take a drag that starts on a boundary as a tap', async () => {
    const { map, store } = await drawPlaces();
    const features = [{ properties: { id: outsideWindow } }];

    map.fire('touchstart', 'places-fill', {
      point: { x: 100, y: 100 },
      originalEvent: { touches: [{}], timeStamp: 1000 },
      features,
    });
    map.fire('touchend', 'places-fill', {
      point: { x: 160, y: 100 },
      originalEvent: { touches: [], timeStamp: 1120 },
      features,
    });
    expect(store.selectedId).toBeNull();
  });

  it('moves the map to a place chosen from the list when it is out of view', async () => {
    const { map, store } = await drawPlaces();

    store.selectPlace(outsideWindow);
    await vi.waitFor(() => expect(map.flyTo).toHaveBeenCalled());

    expect(map.cameraForBounds).toHaveBeenCalledWith(
      [
        [40, -10],
        [41, -9],
      ],
      expect.objectContaining({ maxZoom: 10 })
    );
    expect(map.flyTo).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 6, speed: 0.35, curve: 1.42 })
    );
    // One flight: the padding does not slide on its own as well
    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it('still draws boundaries when the place store is not configured', async () => {
    vi.mocked(loadPlaceRelease).mockResolvedValue({ status: 'unconfigured' });
    vi.mocked(loadPlaceBounds).mockResolvedValue({ status: 'unconfigured' });
    const { map, store } = await drawPlaces();

    expect(store.status).toBe('unconfigured');
    expect(map.getSource('places-tiles')).toBeDefined();

    store.selectPlace(outsideWindow);
    await flushPromises();
    expect(map.flyTo).not.toHaveBeenCalled();
  });

  it('marks a selection with a thicker outline and no extra fill', async () => {
    const { map } = await drawPlaces();

    expect(map.getLayer('places-select-fill')).toBeUndefined();
    expect(map.getLayer('places-select-line')).toMatchObject({
      paint: { 'line-width': 2 },
    });
    expect(map.getLayer('recognitions-select-line')).toMatchObject({
      paint: { 'line-width': 2.5 },
    });
  });

  it('draws places off-white on the satellite basemap', async () => {
    const { map } = await drawPlaces();
    expect(map.getLayer('places-fill')).toMatchObject({
      paint: { 'fill-color': '#1f4b3a' },
    });

    useBasemapStore().toggleBasemap();
    await flushPromises();
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'places-fill',
      'fill-color',
      '#f4f1e8'
    );
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'places-line',
      'line-color',
      '#f4f1e8'
    );
  });

  it('draws recognition outlines only while a recognition type is listed', async () => {
    const { map, store } = await drawPlaces();

    expect(map.getSource('recognitions-tiles')).toEqual({
      type: 'vector',
      url: RECOGNITION_TILES_URL,
    });
    expect(map.getLayer('recognitions-line')).toMatchObject({
      'source-layer': 'recognitions',
    });
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      'recognitions-line',
      'visibility',
      'none'
    );
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      'places-fill',
      'visibility',
      'visible'
    );

    map.setLayoutProperty.mockClear();
    store.listTypes = ['ramsar_site'];
    store.applyFilter([100, null]);
    await flushPromises();
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      'places-fill',
      'visibility',
      'none'
    );
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      'recognitions-line',
      'visibility',
      'visible'
    );
    // Size only: the recognitions archive has no cropland field
    expect(map.setFilter).toHaveBeenLastCalledWith('recognitions-line', [
      'all',
      ['in', ['get', 'place_type_id'], ['literal', ['ramsar_site']]],
      ['all', ['>=', ['to-number', ['get', 'area_km2'], -1], 100]],
    ]);
  });

  it('draws conservation areas and recognitions together when both are listed', async () => {
    const { map, store } = await drawPlaces();
    map.setLayoutProperty.mockClear();
    store.listTypes = ['conservation_area', 'world_heritage_site'];
    await flushPromises();
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      'places-fill',
      'visibility',
      'visible'
    );
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      'recognitions-line',
      'visibility',
      'visible'
    );
    expect(map.setFilter).toHaveBeenLastCalledWith('recognitions-line', [
      'in',
      ['get', 'place_type_id'],
      ['literal', ['world_heritage_site']],
    ]);
  });

  it('leaves withdrawn places out of every layer', async () => {
    const { map, store } = await drawPlaces();
    store.listTypes = ['conservation_area', 'ramsar_site'];
    store.withdrawnIds = [outsideWindow];
    await flushPromises();
    const hidden = ['!', ['in', ['get', 'id'], ['literal', [outsideWindow]]]];
    expect(map.setFilter).toHaveBeenCalledWith('places-fill', hidden);
    expect(map.setFilter).toHaveBeenLastCalledWith('recognitions-line', [
      'all',
      ['in', ['get', 'place_type_id'], ['literal', ['ramsar_site']]],
      hidden,
    ]);
  });

  it('keeps only the places linked to the chosen ecoregions, by id', async () => {
    const { map, store } = await drawPlaces();
    store.listTypes = ['conservation_area', 'ramsar_site'];
    store.applyFilter([100, null]);
    await flushPromises();
    // As the store sets it once the linked places are read
    store.ecoregionPlaceIds = [outsideWindow];
    await flushPromises();
    const size = ['all', ['>=', ['to-number', ['get', 'area_km2'], -1], 100]];
    const linked = ['in', ['get', 'id'], ['literal', [outsideWindow]]];
    expect(map.setFilter).toHaveBeenCalledWith('places-fill', [
      'all',
      size,
      linked,
    ]);
    expect(map.setFilter).toHaveBeenLastCalledWith('recognitions-line', [
      'all',
      ['in', ['get', 'place_type_id'], ['literal', ['ramsar_site']]],
      ['all', size, linked],
    ]);

    store.ecoregionPlaceIds = null;
    await flushPromises();
    expect(map.setFilter).toHaveBeenCalledWith('places-fill', size);
  });

  it('draws ecoregions only while Ecoregions is listed', async () => {
    const { map, store } = await drawPlaces();
    expect(map.getSource('ecoregions-tiles')).toEqual({
      type: 'vector',
      url: ECOREGION_TILES_URL,
    });
    expect(map.getLayer('ecoregions-fill')).toMatchObject({
      'source-layer': 'ecoregions',
    });
    // Added first, so parks and recognitions draw above
    expect([...map.layers.keys()][0]).toBe('ecoregions-fill');
    expect(map.getLayoutProperty('ecoregions-fill', 'visibility')).toBe('none');

    store.listTypes = ['ecoregion'];
    store.applyFilter([100, null]);
    await flushPromises();
    expect(map.getLayoutProperty('ecoregions-fill', 'visibility')).toBe(
      'visible'
    );
    expect(map.getLayoutProperty('places-fill', 'visibility')).toBe('none');
    expect(map.getLayoutProperty('recognitions-line', 'visibility')).toBe(
      'none'
    );
    // Size only: the ecoregions archive has no cropland field
    expect(map.setFilter).toHaveBeenCalledWith('ecoregions-fill', [
      'all',
      ['>=', ['to-number', ['get', 'area_km2'], -1], 100],
    ]);
  });

  it('draws conservation areas and recognitions together with ecoregions', async () => {
    const { map, store } = await drawPlaces();
    store.listTypes = ['conservation_area', 'ecoregion', 'ramsar_site'];
    await flushPromises();

    expect(map.getLayoutProperty('ecoregions-fill', 'visibility')).toBe(
      'visible'
    );
    expect(map.getLayoutProperty('places-fill', 'visibility')).toBe('visible');
    expect(map.getLayoutProperty('recognitions-line', 'visibility')).toBe(
      'visible'
    );
  });

  it('opens a clicked ecoregion, unless a drawn park is under the click', async () => {
    const { map, store } = await drawPlaces();
    store.listTypes = ['ecoregion'];
    await flushPromises();

    const click = {
      point: { x: 1, y: 1 },
      features: [
        { layer: { id: 'ecoregions-fill' }, properties: { id: outsideWindow } },
      ],
      originalEvent: { timeStamp: 0 },
    };
    map.fire('click', 'ecoregions-fill', click);
    expect(store.selectedId).toBe(outsideWindow);
    await flushPromises();
    expect(map.setFilter).toHaveBeenCalledWith('ecoregions-select-line', [
      '==',
      ['get', 'id'],
      outsideWindow,
    ]);

    store.clearSelection();
    store.showRelated(outsideWindow, 'Ecoregion', [parkId]);
    await flushPromises();
    map.queryRenderedFeatures.mockReturnValue([{ properties: { id: parkId } }]);
    map.fire('click', 'ecoregions-fill', {
      ...click,
      originalEvent: { timeStamp: 2000 },
    });
    expect(store.selectedId).toBeNull();
  });

  it('opens a clicked recognition and highlights it from its archive', async () => {
    const { map, store } = await drawPlaces();
    store.listTypes = ['world_heritage_site'];
    await flushPromises();

    map.fire('click', 'recognitions-fill', {
      features: [{ properties: { id: outsideWindow } }],
      originalEvent: { timeStamp: 0 },
    });
    expect(store.selectedId).toBe(outsideWindow);
    await flushPromises();
    expect(map.setFilter).toHaveBeenCalledWith('recognitions-select-line', [
      '==',
      ['get', 'id'],
      outsideWindow,
    ]);
  });

  it('fills ecoregions with no outline and marks a selection in grey', async () => {
    const { map } = await drawPlaces();
    expect(map.getLayer('ecoregions-fill')).toMatchObject({
      paint: {
        'fill-color': '#5b6b2f',
        'fill-opacity': 0.35,
        'fill-antialias': false,
      },
    });
    expect(map.getLayer('ecoregions-line')).toBeUndefined();
    expect(map.getLayer('ecoregions-select-line')).toMatchObject({
      paint: { 'line-color': '#6b6a65', 'line-width': 1.5 },
    });
    expect(map.getLayer('ecoregions-hover-line')).toMatchObject({
      paint: { 'line-color': '#6b6a65', 'line-width': 1.25 },
    });

    useBasemapStore().toggleBasemap();
    await flushPromises();
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'ecoregions-fill',
      'fill-opacity',
      0.35
    );
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'ecoregions-select-line',
      'line-color',
      '#e4e4e2'
    );
    // Recognitions keep their own outline
    expect(map.getLayer('recognitions-line')).toMatchObject({
      paint: {
        'line-width': [
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
        ],
      },
    });
  });

  it("fills each ecoregion in RESOLVE's colour once the colours are read", async () => {
    vi.mocked(loadEcoregionColours).mockResolvedValue({
      status: 'ok',
      colours: { 'eco-a': '#A87001', 'eco-b': '#63CFAB' },
    });
    const { map } = await drawPlaces();
    await flushPromises();
    expect(loadEcoregionColours).toHaveBeenCalledTimes(1);
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'ecoregions-fill',
      'fill-color',
      [
        'match',
        ['get', 'id'],
        'eco-a',
        '#ceaf72',
        'eco-b',
        '#abdfc7',
        '#5b6b2f',
      ]
    );

    // Over imagery the colours are not mixed towards paper
    useBasemapStore().toggleBasemap();
    await flushPromises();
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'ecoregions-fill',
      'fill-color',
      [
        'match',
        ['get', 'id'],
        'eco-a',
        '#A87001',
        'eco-b',
        '#63CFAB',
        '#e3e8a0',
      ]
    );
    expect(loadEcoregionColours).toHaveBeenCalledTimes(1);
  });

  it('keeps the outline colour as the fill when the colours cannot be read', async () => {
    const { map } = await drawPlaces();
    await flushPromises();
    expect(loadEcoregionColours).toHaveBeenCalledTimes(1);
    expect(map.setPaintProperty).not.toHaveBeenCalledWith(
      'ecoregions-fill',
      'fill-color',
      expect.arrayContaining(['match'])
    );
  });

  it('colours recognitions by group and lightens them on satellite', async () => {
    const { map } = await drawPlaces();
    const colour = [
      'match',
      ['get', 'place_type_id'],
      'world_heritage_site',
      '#a8730f',
      'ramsar_site',
      '#1f6f9a',
      'biosphere_reserve',
      '#7a4a9c',
      '#7d7a72',
    ];
    expect(map.getLayer('recognitions-line')).toMatchObject({
      paint: { 'line-color': colour },
    });
    expect(map.getLayer('recognitions-fill')).toMatchObject({
      paint: { 'fill-opacity': 0 },
    });

    useBasemapStore().toggleBasemap();
    await flushPromises();
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'recognitions-line',
      'line-color',
      [
        'match',
        ['get', 'place_type_id'],
        'world_heritage_site',
        '#f2c14e',
        'ramsar_site',
        '#8fd3f4',
        'biosphere_reserve',
        '#d9b3f5',
        '#d8d5cc',
      ]
    );
  });

  it('removes the boundaries even while tiles are still loading', async () => {
    const { map, store } = await drawPlaces();
    map.tilesLoaded = false;

    store.toggle();
    await flushPromises();
    expect(map.getSource('places-tiles')).toBeUndefined();
    expect(map.getSource('recognitions-tiles')).toBeUndefined();
  });

  it('waits for the map to be idle when the style is not loaded', async () => {
    const { map, store } = await drawPlaces();
    map.tilesLoaded = false;
    map.style._loaded = false;

    store.toggle();
    await flushPromises();
    expect(map.getSource('places-tiles')).toBeDefined();
    map.fire('idle', undefined, {});
    expect(map.getSource('places-tiles')).toBeUndefined();
  });

  it('draws the conservation areas of an open Areas tab', async () => {
    const { map, store } = await drawPlaces();
    store.listTypes = ['world_heritage_site'];
    store.toggle();
    await flushPromises();
    expect(map.getSource('places-tiles')).toBeUndefined();

    map.setLayoutProperty.mockClear();
    store.showRelated(parkId, 'Park', [outsideWindow]);
    await flushPromises();
    expect(map.getSource('places-tiles')).toBeDefined();
    expect(map.setFilter).toHaveBeenCalledWith('places-fill', [
      'in',
      ['get', 'id'],
      ['literal', [outsideWindow]],
    ]);
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      'places-fill',
      'visibility',
      'visible'
    );

    store.showRelated(parkId, 'Park', null);
    await flushPromises();
    expect(map.getSource('places-tiles')).toBeUndefined();
  });

  it('draws a set with the listed conservation areas, outlined above them', async () => {
    const { map, store } = await drawPlaces();
    store.listTypes = ['conservation_area'];
    await flushPromises();
    store.selectPlace(parkId);
    store.showRelated(parkId, 'Park', [outsideWindow]);
    store.pinSet(`related:${parkId}`);
    await flushPromises();
    const inSet = ['in', ['get', 'id'], ['literal', [outsideWindow]]];
    expect(map.getLayer('places-set-line')).toBeDefined();
    expect(map.setFilter).toHaveBeenCalledWith('places-set-line', inSet);
    expect(map.setFilter).toHaveBeenCalledWith('places-fill', [
      'any',
      ['literal', true],
      inSet,
    ]);
    expect(map.getLayoutProperty('places-set-line', 'visibility')).toBe(
      'visible'
    );

    // With Places closed, only the pinned set draws.
    store.toggle();
    await flushPromises();
    expect(map.setFilter).toHaveBeenCalledWith('places-fill', inSet);

    store.removeSet(`related:${parkId}`);
    await flushPromises();
    expect(map.getSource('places-tiles')).toBeUndefined();
  });

  it('outlines only the selected place while the photo queue is open', async () => {
    const { map, store } = await drawPlaces();
    store.toggle();
    await flushPromises();
    expect(map.getSource('places-tiles')).toBeUndefined();

    map.setLayoutProperty.mockClear();
    store.photoQueueOpen = true;
    await flushPromises();
    expect(map.getSource('places-tiles')).toBeDefined();
    expect(map.getSource('recognitions-tiles')).toBeDefined();
    [
      'places-fill',
      'places-line',
      'recognitions-fill',
      'recognitions-line',
    ].forEach(layer =>
      expect(map.setLayoutProperty).toHaveBeenCalledWith(
        layer,
        'visibility',
        'none'
      )
    );

    store.openFromPhotoQueue(outsideWindow);
    await flushPromises();
    const selection = ['==', ['get', 'id'], outsideWindow];
    expect(map.setFilter).toHaveBeenCalledWith('places-select-line', selection);
    expect(map.setFilter).toHaveBeenCalledWith(
      'recognitions-select-line',
      selection
    );

    store.photoQueueOpen = false;
    await flushPromises();
    expect(map.getSource('places-tiles')).toBeUndefined();
  });

  it('outlines the place of a hovered card from either archive', async () => {
    const { map, store } = await drawPlaces();
    expect(map.getLayer('places-hover-line')).toBeDefined();
    expect(map.getLayer('recognitions-hover-line')).toBeDefined();

    store.hoverPlace(outsideWindow, true);
    await flushPromises();
    const filter = ['==', ['get', 'id'], outsideWindow];
    expect(map.setFilter).toHaveBeenCalledWith('places-hover-line', filter);
    expect(map.setFilter).toHaveBeenCalledWith(
      'recognitions-hover-line',
      filter
    );
    // Hovering does not move the map
    expect(map.flyTo).not.toHaveBeenCalled();
    expect(map.easeTo).not.toHaveBeenCalled();

    store.hoverPlace(outsideWindow, false);
    await flushPromises();
    expect(map.setFilter).toHaveBeenLastCalledWith('recognitions-hover-line', [
      '==',
      ['get', 'id'],
      '',
    ]);
  });

  it('names the place the pointer rests on, park before ecoregion', async () => {
    const { map, store } = await drawPlaces();
    vi.useFakeTimers();
    map.queryRenderedFeatures.mockReturnValue([
      { layer: { id: 'ecoregions-fill' }, properties: { id: outsideWindow } },
      { layer: { id: 'places-fill' }, properties: { id: parkId } },
    ]);
    map.fire('mousemove', undefined, { point: { x: 40, y: 50 } });
    await vi.advanceTimersByTimeAsync(300);
    expect(store.mapTip).toBeNull();
    // A small move keeps waiting.
    map.fire('mousemove', undefined, { point: { x: 42, y: 51 } });
    await vi.advanceTimersByTimeAsync(400);
    expect(store.mapTip).toEqual({ name: `Name of ${parkId}`, x: 40, y: 50 });
    // The card is not highlighted.
    expect(store.hoveredId).toBeNull();

    map.fire('mousemove', undefined, { point: { x: 90, y: 90 } });
    expect(store.mapTip).toBeNull();
    map.queryRenderedFeatures.mockReturnValue([]);
    await vi.advanceTimersByTimeAsync(700);
    expect(store.mapTip).toBeNull();

    map.queryRenderedFeatures.mockReturnValue([
      { layer: { id: 'places-fill' }, properties: { id: parkId } },
    ]);
    map.fire('mousemove', undefined, { point: { x: 10, y: 10 } });
    await vi.advanceTimersByTimeAsync(700);
    expect(store.mapTip).not.toBeNull();
    map.fire('mouseout', undefined, {});
    expect(store.mapTip).toBeNull();
    vi.useRealTimers();
  });

  it('reports a failed tile read', async () => {
    const { map, store } = await drawPlaces();

    map.fire('error', undefined, {
      sourceId: 'places-tiles',
      error: new Error('403'),
    });
    expect(store.status).toBe('error');
  });
});

describe('map padding from the open panels', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    document.body.innerHTML = '';
    vi.mocked(loadPlaceRelease).mockResolvedValue({
      status: 'ok',
      releaseMonth: '2026-10-01',
    });
  });

  it('eases to the Places columns on the left, and leaves Landscape out', async () => {
    const { map, followPanels } = await drawPlaces();
    addPanel({ className: 'places-frame' }, { left: 0, right: 360 });
    addPanel({ id: 'layers-panel' }, { left: 960, right: 1200 });

    await followPanels();

    expect(map.easeTo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        padding: { top: 0, right: 0, bottom: 0, left: 360 },
        duration: 900,
      })
    );
  });

  it('leaves out a hidden column, and returns to no padding when they close', async () => {
    const { map, followPanels } = await drawPlaces();
    const list = addPanel(
      { className: 'places-frame' },
      { left: 0, right: 360 }
    );
    const profile = addPanel(
      { className: 'place-profile' },
      { left: 360, right: 740 }
    );
    profile.style.visibility = 'hidden';

    await followPanels();
    expect(map.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 360 });

    list.remove();
    await followPanels();
    expect(map.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('takes the padding after a move ends, keeping the view where it is', async () => {
    const { map, followPanels } = await drawPlaces();
    addPanel({ className: 'places-frame' }, { left: 0, right: 400 });
    map.moving = true;

    await followPanels();
    expect(map.easeTo).not.toHaveBeenCalledWith(
      expect.objectContaining({ padding: expect.anything() })
    );

    map.moving = false;
    map.fire('moveend', undefined, {});
    await vi.waitFor(() =>
      expect(map.jumpTo).toHaveBeenCalledWith({
        center: { lng: 800, lat: 400 },
        padding: { top: 0, right: 0, bottom: 0, left: 400 },
      })
    );
  });

  it('flies to a place in the free map, taking the panels as its padding', async () => {
    const { map, store } = await drawPlaces();
    addPanel({ className: 'places-frame' }, { left: 0, right: 360 });
    addPanel({ id: 'layers-panel' }, { left: 960, right: 1200 });

    store.selectPlace(outsideWindow);
    await vi.waitFor(() => expect(map.flyTo).toHaveBeenCalled());

    // The zoom leaves a margin beside the panels; Landscape takes no room
    expect(map.cameraForBounds).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        padding: { top: 72, right: 72, bottom: 72, left: 384 },
      })
    );
    const flight = map.flyTo.mock.calls[0][0] as {
      center: [number, number];
      retainPadding?: boolean;
    };
    expect(flight).toMatchObject({
      padding: { top: 0, right: 0, bottom: 0, left: 360 },
      speed: 0.35,
      curve: 1.42,
    });
    expect(flight.retainPadding).toBeUndefined();
    expect(flight.center[0]).toBe(40.5);
  });

  it('flies to the places the filter keeps once it is applied', async () => {
    vi.mocked(loadPlaceExtent).mockResolvedValue({
      status: 'ok',
      bounds: [10, -95, 50, 20],
    });
    const { map, store } = await drawPlaces();

    // No type listed: nothing to fly to
    store.fitToKept();
    await flushPromises();
    expect(loadPlaceExtent).not.toHaveBeenCalled();

    store.listTypes = ['conservation_area'];
    store.applyFilter([2000, null]);
    store.fitToKept();
    await vi.waitFor(() => expect(map.flyTo).toHaveBeenCalled());
    expect(loadPlaceExtent).toHaveBeenCalledWith({
      placeTypes: ['conservation_area'],
      sizeMin: 2000,
      sizeMax: null,
      ecoregionIds: [],
    });
    expect(map.cameraForBounds).toHaveBeenLastCalledWith(
      [
        [10, -85],
        [50, 20],
      ],
      expect.anything()
    );
    expect(map.flyTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ zoom: 6, speed: 0.35 })
    );
  });
});
