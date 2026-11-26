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
      photoSuggestions: false,
    });
    expect(store.keptPlaceIds).toEqual(['park-in-e1', 'park-in-e2']);

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
    expect(store.keptPlaceIds).toEqual(['park-in-e1']);

    store.listTypes = ['ecoregion'];
    await flushPromises();
    expect(store.ecoregionIds).toEqual([]);
    expect(store.keptPlaceIds).toBeNull();
    expect(store.filtering).toBe(false);

    store.listTypes = [];
    await flushPromises();
    expect(store.ecoregionIds).toEqual([]);

    store.listTypes = ['world_heritage_site'];
    await flushPromises();
    expect(store.ecoregionIds).toEqual(['e1']);
    expect(store.keptPlaceIds).toEqual(['park-in-e1']);
  });

  it('keeps the places with photo suggestions on the map, with or without a type', async () => {
    const store = usePlacesStore();
    vi.mocked(loadKeptPlaceIds).mockResolvedValue({
      status: 'ok',
      ids: ['park-with-photos'],
    });
    store.applyFilter([null, null], [], true);
    await flushPromises();
    expect(store.filtering).toBe(true);
    expect(loadKeptPlaceIds).toHaveBeenLastCalledWith(
      expect.objectContaining({
        placeTypes: [],
        photoSuggestions: true,
      })
    );
    expect(store.keptPlaceIds).toEqual(['park-with-photos']);

    store.listTypes = ['ecoregion'];
    await flushPromises();
    expect(loadKeptPlaceIds).toHaveBeenLastCalledWith(
      expect.objectContaining({
        placeTypes: ['ecoregion'],
        photoSuggestions: true,
      })
    );

    store.clearFilter();
    await flushPromises();
    expect(store.photoSuggestions).toBe(false);
    expect(store.keptPlaceIds).toBeNull();
  });

  it('clears the ecoregions with the rest of the filter', async () => {
    const store = usePlacesStore();
    store.listTypes = ['conservation_area'];
    store.applyFilter([null, null], [savanna]);
    await flushPromises();
    store.clearFilter();
    await flushPromises();
    expect(store.ecoregionsKept).toEqual([]);
    expect(store.keptPlaceIds).toBeNull();
    expect(store.filtering).toBe(false);
  });
});

describe('Places store, navigation', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  /** Open an ecoregion on its Related tab, listing two parks. */
  function ecoregionOnRelated() {
    const store = usePlacesStore();
    store.selectPlace('eco');
    store.selectedName = 'Atlantic mixed forests';
    store.profileTab = 'related';
    store.showRelated('eco', 'Atlantic mixed forests', ['park1', 'park2']);
    return store;
  }

  it('keeps the tab when another place opens', () => {
    const store = ecoregionOnRelated();
    store.selectPlace('eco2', 'map');
    expect(store.profileTab).toBe('related');
    // A place outside the set removes it.
    expect(store.mapSets).toEqual([]);
    expect(store.shownAreaIds).toBeNull();
  });

  it('opens a place of the drawn set on Overview and keeps the set', () => {
    const store = ecoregionOnRelated();
    store.selectPlace('park1', 'map');
    expect(store.profileTab).toBe('overview');
    expect(store.shownAreaIds).toEqual(['park1', 'park2']);
    // The park's own profile says it lists nothing. The ecoregion's set stays.
    store.showRelated('park1', 'Park one', null);
    expect(store.shownAreaIds).toEqual(['park1', 'park2']);
    expect(store.temporarySet?.label).toBe('Related to Atlantic mixed forests');
  });

  it('steps back on the tab each place was on', () => {
    const store = ecoregionOnRelated();
    store.selectPlace('park1', 'map');
    store.selectedName = 'Park one';
    store.selectPlace('park2', 'list');
    expect(store.history.map(entry => entry.id)).toEqual(['eco', 'park1']);

    store.goBack();
    expect(store.selectedId).toBe('park1');
    expect(store.profileTab).toBe('overview');
    store.goBack();
    expect(store.selectedId).toBe('eco');
    expect(store.profileTab).toBe('related');
    expect(store.history).toEqual([]);
    expect(store.shownAreaIds).toEqual(['park1', 'park2']);
  });

  it('steps back several places from the breadcrumb', () => {
    const store = ecoregionOnRelated();
    store.selectPlace('park1');
    store.selectPlace('park2');
    store.goBack(0);
    expect(store.selectedId).toBe('eco');
    expect(store.history).toEqual([]);
  });

  it('empties the history and the temporary set on close, and keeps pinned sets', () => {
    const store = ecoregionOnRelated();
    store.pinSet('related:eco');
    store.selectPlace('eco2');
    store.profileTab = 'related';
    store.showRelated('eco2', 'Kalahari', ['park3']);
    expect(store.shownAreaIds).toEqual(['park1', 'park2', 'park3']);

    store.clearSelection();
    expect(store.history).toEqual([]);
    expect(store.mapSets.map(set => set.id)).toEqual(['related:eco']);
    expect(store.shownAreaIds).toEqual(['park1', 'park2']);

    store.removeSet('related:eco');
    expect(store.shownAreaIds).toBeNull();
  });

  it('opens a chip’s place on its Related tab', () => {
    const store = ecoregionOnRelated();
    store.pinSet('related:eco');
    store.selectPlace('park9');
    store.profileTab = 'overview';
    store.openSetOwner('related:eco');
    expect(store.selectedId).toBe('eco');
    expect(store.profileTab).toBe('related');
  });

  it('keeps at most one temporary set, replaced by the next Related tab', () => {
    const store = ecoregionOnRelated();
    store.selectPlace('park1');
    store.profileTab = 'related';
    store.showRelated('park1', 'Park one', ['park7']);
    expect(store.mapSets.map(set => set.id)).toEqual(['related:park1']);
    store.unpinSet('related:park1');
    expect(store.mapSets).toHaveLength(1);
  });

  it('opens the photo-filtered list and admin lists on their tab', () => {
    const store = usePlacesStore();
    store.openWithPhotos('p1');
    expect(store.profileTab).toBe('photos');
    store.openFromAdminList('p2');
    expect(store.profileTab).toBe('status');
    expect(store.history.map(entry => entry.tab)).toEqual(['photos']);
  });
});
