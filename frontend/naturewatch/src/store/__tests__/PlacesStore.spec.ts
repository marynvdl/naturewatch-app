import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { loadKeptPlaceIds } from '@/places/api';
import { CROPLAND_FULL } from '@/places/display';
import usePlacesStore from '@/store/PlacesStore';

vi.mock('@/places/api', () => ({
  loadKeptPlaceIds: vi.fn(),
  loadPlaceRelease: vi.fn(),
  loadWithdrawnPlaceIds: vi.fn(),
}));

const savanna = { id: 'e1', name: 'Zambezian mopane woodlands' };
const desert = { id: 'e2', name: 'Kalahari xeric savanna' };

describe('Places store, Ecoregion filter', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.mocked(loadKeptPlaceIds).mockImplementation(async query => ({
      status: 'ok',
      ids: query.ecoregionIds.map(id => `park-in-${id}`),
    }));
  });

  it('reads the linked places of the listed types for the map', async () => {
    const store = usePlacesStore();
    store.listTypes = ['conservation_area', 'ramsar_site'];
    store.applyFilter([100, null], [savanna, desert]);
    await flushPromises();

    expect(store.ecoregionIds).toEqual(['e1', 'e2']);
    expect(store.filtering).toBe(true);
    expect(loadKeptPlaceIds).toHaveBeenLastCalledWith({
      placeTypes: ['conservation_area', 'ramsar_site'],
      sizeMin: null,
      sizeMax: null,
      cropMin: CROPLAND_FULL[0],
      cropMax: CROPLAND_FULL[1],
      ecoregionIds: ['e1', 'e2'],
    });
    expect(store.ecoregionPlaceIds).toEqual(['park-in-e1', 'park-in-e2']);

    // A size alone keeps the chosen ecoregions
    store.applyFilter([null, null]);
    await flushPromises();
    expect(store.ecoregionsKept).toEqual([savanna, desert]);
    expect(loadKeptPlaceIds).toHaveBeenCalledTimes(1);
  });

  it('does not apply to Ecoregions or with no type, and keeps the choice', async () => {
    const store = usePlacesStore();
    store.listTypes = ['conservation_area'];
    store.applyFilter([null, null], [savanna]);
    await flushPromises();
    expect(store.ecoregionPlaceIds).toEqual(['park-in-e1']);

    store.listTypes = ['ecoregion'];
    await flushPromises();
    expect(store.ecoregionIds).toEqual([]);
    expect(store.ecoregionPlaceIds).toBeNull();
    expect(store.filtering).toBe(false);

    store.listTypes = [];
    await flushPromises();
    expect(store.ecoregionIds).toEqual([]);

    store.listTypes = ['world_heritage_site'];
    await flushPromises();
    expect(store.ecoregionIds).toEqual(['e1']);
    expect(store.ecoregionPlaceIds).toEqual(['park-in-e1']);
  });

  it('clears the ecoregions with the rest of the filter', async () => {
    const store = usePlacesStore();
    store.listTypes = ['conservation_area'];
    store.applyFilter([null, null], [savanna]);
    await flushPromises();
    store.clearFilter();
    await flushPromises();
    expect(store.ecoregionsKept).toEqual([]);
    expect(store.ecoregionPlaceIds).toBeNull();
    expect(store.filtering).toBe(false);
  });
});
