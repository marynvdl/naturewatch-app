import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { shallowRef } from 'vue';
import {
  PLACE_TILES_URL,
  RECOGNITION_TILES_URL,
  loadPlaceBounds,
  loadPlaceRelease,
} from '@/places/api';
import { usePlaceBoundaries } from '@/places/usePlaceBoundaries';
import useBasemapStore from '@/store/BasemapStore';
import usePlacesStore from '@/store/PlacesStore';

vi.mock('@/places/api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/places/api')>()),
  loadPlaceBounds: vi.fn(),
  loadPlaceRelease: vi.fn(),
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
  easeTo = vi.fn();
  setFilter = vi.fn();
  setPaintProperty = vi.fn();
  setLayoutProperty = vi.fn();
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
      getBoundingClientRect: () => ({ left: 0, width: 1200, height: 800 }),
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

/**
 * Mount the overlay on a fake map and show Conservation areas.
 * @returns The map and the store.
 */
async function drawPlaces() {
  const map = new FakeMap();
  const ref = shallowRef<FakeMap | null>(null);
  usePlaceBoundaries(() => ref.value);
  ref.value = map;
  const store = usePlacesStore();
  store.toggle();
  await flushPromises();
  return { map, store };
}

describe('place boundaries from tiles', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
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

    store.applyFilter([100, null], [0, 100]);
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
    });
    expect(store.selectedId).toBe(outsideWindow);
    expect(store.selectedFrom).toBe('map');
    await vi.waitFor(() =>
      expect(map.easeTo).toHaveBeenCalledWith(
        expect.objectContaining({ center: [40.5, -9.5] })
      )
    );
    expect(loadPlaceBounds).toHaveBeenCalledWith(outsideWindow);
  });

  it('moves the map to a place chosen from the list when it is out of view', async () => {
    const { map, store } = await drawPlaces();

    store.selectPlace(outsideWindow);
    await flushPromises();

    expect(map.fitBounds).toHaveBeenCalledWith(
      [
        [40, -10],
        [41, -9],
      ],
      expect.objectContaining({ maxZoom: 10 })
    );
  });

  it('still draws boundaries when the place store is not configured', async () => {
    vi.mocked(loadPlaceRelease).mockResolvedValue({ status: 'unconfigured' });
    vi.mocked(loadPlaceBounds).mockResolvedValue({ status: 'unconfigured' });
    const { map, store } = await drawPlaces();

    expect(store.status).toBe('unconfigured');
    expect(map.getSource('places-tiles')).toBeDefined();

    store.selectPlace(outsideWindow);
    await flushPromises();
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it('marks a selection with a thicker outline and no extra fill', async () => {
    const { map } = await drawPlaces();

    expect(map.getLayer('places-select-fill')).toBeUndefined();
    expect(map.getLayer('places-select-line')).toMatchObject({
      paint: { 'line-width': 3 },
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
    store.listType = 'ramsar_site';
    store.applyFilter([100, null], [5, 50]);
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
      ['==', ['get', 'place_type_id'], 'ramsar_site'],
      ['all', ['>=', ['to-number', ['get', 'area_km2'], -1], 100]],
    ]);
  });

  it('opens a clicked recognition and highlights it from its archive', async () => {
    const { map, store } = await drawPlaces();
    store.listType = 'world_heritage_site';
    await flushPromises();

    map.fire('click', 'recognitions-fill', {
      features: [{ properties: { id: outsideWindow } }],
    });
    expect(store.selectedId).toBe(outsideWindow);
    await flushPromises();
    expect(map.setFilter).toHaveBeenCalledWith('recognitions-select-line', [
      '==',
      ['get', 'id'],
      outsideWindow,
    ]);
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
    store.listType = 'world_heritage_site';
    store.toggle();
    await flushPromises();
    expect(map.getSource('places-tiles')).toBeUndefined();

    map.setLayoutProperty.mockClear();
    store.shownAreaIds = [outsideWindow];
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

    store.shownAreaIds = null;
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
    expect(map.fitBounds).not.toHaveBeenCalled();
    expect(map.easeTo).not.toHaveBeenCalled();

    store.hoverPlace(outsideWindow, false);
    await flushPromises();
    expect(map.setFilter).toHaveBeenLastCalledWith('recognitions-hover-line', [
      '==',
      ['get', 'id'],
      '',
    ]);
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
