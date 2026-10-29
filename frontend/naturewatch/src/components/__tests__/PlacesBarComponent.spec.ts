import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PlacesBarComponent from '@/components/PlacesBarComponent.vue';
import {
  loadPilotPlaceFilterStats,
  loadPilotPlaceKeptIds,
  loadPilotPlaceWindow,
  loadPlaceMap,
} from '@/places/api';
import {
  CROPLAND_FULL,
  filterPlaces,
  sortPlaces,
  type PlaceSort,
} from '@/places/display';
import usePlacesStore from '@/store/PlacesStore';

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
);

let ioCallback: IntersectionObserverCallback | null = null;
vi.stubGlobal(
  'IntersectionObserver',
  class {
    constructor(callback: IntersectionObserverCallback) {
      ioCallback = callback;
    }
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
);

vi.mock('@/places/api', () => ({
  loadPilotPlaceWindow: vi.fn(),
  loadPilotPlaceWindowCount: vi.fn(),
  loadPilotPlaceFilterStats: vi.fn(),
  loadPilotPlaceKeptIds: vi.fn(),
  loadPlaceMap: vi.fn(),
}));

const places = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Addo Elephant National Park',
    designation: 'National Park',
    iso3: 'ZAF',
    area_km2: 1538.284,
    cropland_percent: 0.7,
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Kruger National Park',
    designation: 'National Park',
    iso3: 'ZAF',
    area_km2: 19485.2,
    cropland_percent: 0.06,
  },
];

const sizeFull: [number, number] = [1538.284, 19485.2];
const missingPlace = {
  id: '33333333-3333-3333-3333-333333333333',
  name: 'A small reserve',
  designation: 'Nature Reserve',
  iso3: 'ZAF',
  area_km2: 12,
  cropland_percent: 2,
};

const drawn = {
  status: 'ok' as const,
  features: { type: 'FeatureCollection' as const, features: [] },
  releaseMonth: '',
};

const stats = {
  status: 'ok' as const,
  stats: {
    placeCount: 2,
    sizeFull,
    sizeBins: new Array(40).fill(0),
    croplandBins: new Array(40).fill(0),
  },
};

/**
 * Mount the places panel with a fresh store.
 * @param onPage - Attach to the page, so menus in a portal can be found.
 * @returns The mounted panel.
 */
function mountPlaces(onPage = false) {
  return mount(PlacesBarComponent, {
    global: { plugins: [createPinia()] },
    attachTo: onPage ? document.body : undefined,
  });
}

/**
 * A place-type button by its label.
 * @param wrapper - The mounted panel.
 * @param label - The button text.
 * @returns The button.
 */
function typeButton(wrapper: ReturnType<typeof mountPlaces>, label: string) {
  const button = wrapper
    .findAll('button.place-type')
    .find(item => item.text() === label);
  if (!button) throw new Error(`Missing ${label}`);
  return button;
}

describe('Places panel', () => {
  beforeEach(() => {
    ioCallback = null;
    vi.clearAllMocks();
    vi.mocked(loadPilotPlaceFilterStats).mockResolvedValue(stats);
    vi.mocked(loadPilotPlaceWindow).mockImplementation(async query => {
      const prefix = query.search.trim().toLocaleLowerCase();
      let list = places;
      if (prefix) {
        list = query.searchPrefix
          ? places.filter(place =>
              place.name.toLocaleLowerCase().startsWith(prefix)
            )
          : places.filter(place =>
              place.name.toLocaleLowerCase().includes(prefix)
            );
      }
      list = filterPlaces(
        list,
        {
          kept: [query.sizeMin ?? sizeFull[0], query.sizeMax ?? sizeFull[1]],
          full: sizeFull,
        },
        { kept: [query.cropMin, query.cropMax], full: CROPLAND_FULL }
      );
      if (query.extent) {
        list = list.filter(place => place.id === places[1].id);
      }
      list = sortPlaces(list, query.sort);
      return { status: 'ok', places: list, total: list.length };
    });
    vi.mocked(loadPilotPlaceKeptIds).mockImplementation(
      async (sizeMin, sizeMax, cropland) => ({
        status: 'ok',
        ids: filterPlaces(
          places,
          {
            kept: [sizeMin ?? sizeFull[0], sizeMax ?? sizeFull[1]],
            full: sizeFull,
          },
          { kept: cropland, full: CROPLAND_FULL }
        ).map(place => place.id),
      })
    );
    vi.mocked(loadPlaceMap).mockResolvedValue(drawn);
  });

  it('shows results and boundaries only after a place type is selected', async () => {
    const wrapper = mountPlaces();
    await flushPromises();

    expect(wrapper.text()).not.toContain('Addo Elephant National Park');
    const areas = typeButton(wrapper, 'Protected areas');
    expect(areas.attributes('aria-pressed')).toBe('false');
    expect(loadPlaceMap).not.toHaveBeenCalled();

    await typeButton(wrapper, 'Protected areas').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Addo Elephant National Park');
    expect(wrapper.text()).toContain('Kruger National Park');
    expect(typeButton(wrapper, 'Protected areas').classes()).toContain('is-on');
    expect(loadPlaceMap).toHaveBeenCalledTimes(1);
    expect(loadPilotPlaceWindow).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'size-desc' as PlaceSort, extent: null })
    );

    await wrapper.get('input[aria-label="Search places"]').setValue('kruger');
    await flushPromises();
    expect(wrapper.text()).toContain('Kruger National Park');
    expect(wrapper.text()).not.toContain('Addo Elephant National Park');

    await wrapper.get('input[aria-label="Search places"]').setValue('');
    await flushPromises();
    expect(wrapper.text()).toContain('Addo Elephant National Park');

    const place = wrapper.get('button.place-result');
    expect(place.text()).toContain('South Africa');
    expect(place.text()).toContain('19,485 km²');
    await place.trigger('click');
    expect(place.attributes('aria-current')).toBe('true');
    await place.trigger('click');
    expect(place.attributes('aria-current')).toBeUndefined();

    await wrapper.get('input[aria-label="Search places"]').setValue('zzz');
    await flushPromises();
    expect(wrapper.text()).toContain('No places match.');
    expect(loadPlaceMap).toHaveBeenCalledTimes(1);

    await typeButton(wrapper, 'Ecoregions').trigger('click');
    expect(wrapper.text()).toContain(
      'Well, this is awkward. We have nothing to show.'
    );
    expect(wrapper.text()).not.toContain('Kruger National Park');
    expect(wrapper.find('.places-frame').classes()).not.toContain('has-detail');
    expect(typeButton(wrapper, 'Ecoregions').classes()).toContain('is-on');
    expect(typeButton(wrapper, 'Protected areas').classes()).not.toContain(
      'is-on'
    );

    await typeButton(wrapper, 'Countries').trigger('click');
    expect(wrapper.text()).toContain(
      'Well, this is awkward. We have nothing to show.'
    );

    await typeButton(wrapper, 'Protected areas').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('No places match.');
    expect(loadPilotPlaceWindow).toHaveBeenCalled();
    expect(loadPlaceMap).toHaveBeenCalledTimes(1);

    await typeButton(wrapper, 'Protected areas').trigger('click');
    expect(wrapper.text()).toContain('No places match.');
    expect(wrapper.text()).not.toContain('Kruger National Park');
    expect(typeButton(wrapper, 'Protected areas').classes()).not.toContain(
      'is-on'
    );
    expect(loadPlaceMap).toHaveBeenCalledTimes(1);
  });

  it('caps the list at 50, largest first, with the matching total', async () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      id: `${String(index + 1).padStart(8, '0')}-1111-1111-1111-111111111111`,
      name: `Park ${String(index + 1).padStart(2, '0')}`,
      designation: 'National Park',
      iso3: 'ZAF',
      area_km2: 1000 - index,
      cropland_percent: 1,
    }));
    vi.mocked(loadPilotPlaceFilterStats).mockResolvedValue({
      status: 'ok',
      stats: {
        placeCount: 941,
        sizeFull: [10, 20000],
        sizeBins: new Array(40).fill(0),
        croplandBins: new Array(40).fill(0),
      },
    });
    vi.mocked(loadPilotPlaceWindow).mockResolvedValue({
      status: 'ok',
      places: many.slice(0, 50),
      total: 941,
    });

    const wrapper = mountPlaces();
    await typeButton(wrapper, 'Protected areas').trigger('click');
    await flushPromises();

    expect(wrapper.findAll('button.place-result')).toHaveLength(50);
    expect(wrapper.get('.places-count').text()).toBe('50 of 941 places');
    expect(wrapper.findAll('.place-number').map(item => item.text())).toEqual(
      Array.from({ length: 50 }, (_, index) => String(index + 1))
    );
    expect(wrapper.get('.place-card-name').text()).toBe('Park 01');
    expect(loadPilotPlaceWindow).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'size-desc' as PlaceSort })
    );
    expect(loadPlaceMap).toHaveBeenCalledTimes(1);
  });

  it('loads the next 50 when the end of the list is reached', async () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      id: `${String(index + 1).padStart(8, '0')}-1111-1111-1111-111111111111`,
      name: `Park ${String(index + 1).padStart(2, '0')}`,
      designation: 'National Park',
      iso3: 'ZAF',
      area_km2: 1000 - index,
      cropland_percent: 1,
    }));
    vi.mocked(loadPilotPlaceFilterStats).mockResolvedValue({
      status: 'ok',
      stats: {
        placeCount: 60,
        sizeFull: [10, 20000],
        sizeBins: new Array(40).fill(0),
        croplandBins: new Array(40).fill(0),
      },
    });
    vi.mocked(loadPilotPlaceWindow).mockImplementation(async query => {
      const offset = query.offset ?? 0;
      return {
        status: 'ok',
        places: many.slice(offset, offset + 50),
        total: 60,
      };
    });

    const wrapper = mountPlaces();
    await typeButton(wrapper, 'Protected areas').trigger('click');
    await flushPromises();

    expect(wrapper.findAll('button.place-result')).toHaveLength(50);
    expect(wrapper.get('.places-count').text()).toBe('50 of 60 places');
    expect(ioCallback).not.toBeNull();

    ioCallback?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver
    );
    await flushPromises();

    expect(wrapper.findAll('button.place-result')).toHaveLength(60);
    expect(wrapper.get('.places-count').text()).toBe('60 places');
    expect(wrapper.findAll('.place-number').at(-1)?.text()).toBe('60');
    expect(loadPilotPlaceWindow).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 50 })
    );
    expect(loadPlaceMap).toHaveBeenCalledTimes(1);
  });

  it('sorts and filters the protected areas', async () => {
    const wrapper = mountPlaces(true);
    const page = new DOMWrapper(document.body);
    await typeButton(wrapper, 'Protected areas').trigger('click');
    await flushPromises();
    const names = () =>
      wrapper.findAll('.place-card-name').map(item => item.text());

    expect(names()).toEqual([
      'Kruger National Park',
      'Addo Elephant National Park',
    ]);
    expect(wrapper.get('.places-count').text()).toBe('2 places');

    expect(wrapper.findAll('.place-number').map(item => item.text())).toEqual([
      '1',
      '2',
    ]);

    /**
     * Open the sort menu and choose an order.
     * @param label - The order's label.
     */
    async function sortBy(label: string) {
      await wrapper.get('button[aria-label^="Sort places"]').trigger('click');
      await flushPromises();
      const option = page
        .findAll('[role="radio"]')
        .find(item => item.text() === label);
      if (!option) throw new Error(`Missing ${label}`);
      await option.trigger('click');
      await flushPromises();
    }

    await sortBy('Name');
    expect(names()).toEqual([
      'Addo Elephant National Park',
      'Kruger National Park',
    ]);
    expect(page.find('[role="radio"]').exists()).toBe(false);
    await sortBy('Cropland %, highest first');
    expect(names()).toEqual([
      'Addo Elephant National Park',
      'Kruger National Park',
    ]);

    const search = wrapper.get('input[aria-label="Search places"]');
    await search.setValue('kruger');
    await flushPromises();
    expect(names()).toEqual(['Kruger National Park']);
    expect(wrapper.get('.place-number').text()).toBe('1');
    expect(wrapper.get('.places-count').text()).toBe('1 place');
    await search.setValue('');
    await flushPromises();

    const store = usePlacesStore();
    expect(store.keptIds).toBeNull();
    store.applyFilter([19000, null], [0, 100]);
    await flushPromises();
    expect(names()).toEqual(['Kruger National Park']);
    expect(wrapper.get('.places-count').text()).toBe('1 place');
    expect(store.keptIds).toEqual([places[1].id]);
    expect(wrapper.get('button.places-filter-toggle').classes()).toContain(
      'is-on'
    );
    expect(loadPlaceMap).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('limits the list to the map view only while In view is on', async () => {
    const wrapper = mountPlaces();
    const store = usePlacesStore();
    store.viewBounds = [20, -30, 40, -20];
    await typeButton(wrapper, 'Protected areas').trigger('click');
    await flushPromises();
    const names = () =>
      wrapper.findAll('.place-card-name').map(item => item.text());

    expect(names()).toEqual([
      'Kruger National Park',
      'Addo Elephant National Park',
    ]);
    const extent = wrapper.get('button.places-extent-toggle');
    expect(extent.classes()).not.toContain('is-on');
    expect(extent.attributes('aria-pressed')).toBe('false');
    expect(loadPilotPlaceWindow).toHaveBeenLastCalledWith(
      expect.objectContaining({ extent: null })
    );

    await extent.trigger('click');
    await flushPromises();
    expect(extent.classes()).toContain('is-on');
    expect(names()).toEqual(['Kruger National Park']);
    expect(loadPilotPlaceWindow).toHaveBeenLastCalledWith(
      expect.objectContaining({ extent: [20, -30, 40, -20] })
    );
    expect(loadPlaceMap).toHaveBeenCalledTimes(1);

    store.viewBounds = [21, -29, 39, -21];
    await flushPromises();
    expect(loadPilotPlaceWindow).toHaveBeenLastCalledWith(
      expect.objectContaining({ extent: [21, -29, 39, -21] })
    );

    await extent.trigger('click');
    await flushPromises();
    expect(extent.classes()).not.toContain('is-on');
    expect(names()).toEqual([
      'Kruger National Park',
      'Addo Elephant National Park',
    ]);
    expect(loadPilotPlaceWindow).toHaveBeenLastCalledWith(
      expect.objectContaining({ extent: null })
    );
    expect(loadPlaceMap).toHaveBeenCalledTimes(1);
  });

  it('lists places that start with the search when no type is selected', async () => {
    const wrapper = mountPlaces();
    await wrapper.get('input[aria-label="Search places"]').setValue('kru');
    await flushPromises();

    expect(wrapper.text()).toContain('Kruger National Park');
    expect(wrapper.text()).not.toContain('Addo Elephant National Park');
    expect(typeButton(wrapper, 'Protected areas').classes()).not.toContain(
      'is-on'
    );
    expect(loadPlaceMap).not.toHaveBeenCalled();
    expect(loadPilotPlaceWindow).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'kru', searchPrefix: true })
    );

    await wrapper.get('input[aria-label="Search places"]').setValue('park');
    await flushPromises();
    expect(wrapper.text()).toContain('No places match.');
    expect(wrapper.text()).not.toContain('Kruger National Park');
  });

  it('marks a place chosen on the map in the list', async () => {
    const pinia = createPinia();
    const wrapper = mount(PlacesBarComponent, {
      global: { plugins: [pinia] },
    });
    const store = usePlacesStore(pinia);
    await typeButton(wrapper, 'Protected areas').trigger('click');
    await flushPromises();

    store.selectPlace(places[1].id);
    await wrapper.vm.$nextTick();

    const kruger = wrapper.get(`[data-place-id="${places[1].id}"] button`);
    expect(kruger.attributes('aria-current')).toBe('true');
    expect(wrapper.find('.places-frame').classes()).toContain('has-detail');
    store.selectPlace(places[1].id);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.places-frame').classes()).not.toContain('has-detail');
    expect(typeButton(wrapper, 'Protected areas').classes()).toContain('is-on');
    expect(loadPlaceMap).toHaveBeenCalledTimes(1);
  });

  it('opens a map-chosen place that is not in the window', async () => {
    vi.mocked(loadPilotPlaceWindow).mockResolvedValue({
      status: 'ok',
      places: [places[1]],
      total: 941,
    });
    const pinia = createPinia();
    const wrapper = mount(PlacesBarComponent, {
      global: { plugins: [pinia] },
    });
    const store = usePlacesStore(pinia);
    await typeButton(wrapper, 'Protected areas').trigger('click');
    await flushPromises();

    store.selectPlace(missingPlace.id, 'map');
    await flushPromises();

    expect(wrapper.find('.places-frame').classes()).toContain('has-detail');
    expect(wrapper.text()).toContain('Kruger National Park');
    expect(wrapper.text()).not.toContain('A small reserve');
    expect(wrapper.get('.places-count').text()).toBe('1 of 941 places');
    expect(loadPlaceMap).toHaveBeenCalledTimes(1);
    expect(loadPilotPlaceWindow).toHaveBeenCalledTimes(1);
  });

  it('keeps the search and the place type when the profile closes', async () => {
    const pinia = createPinia();
    const wrapper = mount(PlacesBarComponent, {
      global: { plugins: [pinia] },
    });
    await typeButton(wrapper, 'Protected areas').trigger('click');
    await flushPromises();
    await wrapper.get('input[aria-label="Search places"]').setValue('kruger');
    await flushPromises();
    await wrapper.get('button.place-result').trigger('click');
    expect(wrapper.find('.places-frame').classes()).toContain('has-detail');

    usePlacesStore(pinia).clearSelection();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.places-frame').classes()).not.toContain('has-detail');
    expect(
      wrapper.get('input[aria-label="Search places"]').element
    ).toHaveProperty('value', 'kruger');
    expect(typeButton(wrapper, 'Protected areas').classes()).toContain('is-on');
    expect(loadPlaceMap).toHaveBeenCalledTimes(1);
  });

  it('scrolls a place chosen on the map to the top of the list', async () => {
    const pinia = createPinia();
    const wrapper = mount(PlacesBarComponent, {
      global: { plugins: [pinia] },
    });
    const store = usePlacesStore(pinia);
    await typeButton(wrapper, 'Protected areas').trigger('click');
    await flushPromises();

    const box = (top: number): DOMRect =>
      ({
        top,
        left: 0,
        right: 0,
        bottom: top,
        width: 0,
        height: 0,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
    const rects = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains('places-list')) return box(100);
        if (this.dataset.placeId === places[1].id) return box(340);
        return box(0);
      });

    store.selectPlace(places[1].id, 'map');
    await flushPromises();

    const list = wrapper.get('.places-list').element as HTMLElement;
    expect(list.scrollTop).toBe(240);
    expect(wrapper.text()).toContain('Kruger National Park');
    rects.mockRestore();
  });

  it('says the place store is not configured after Protected areas is selected', async () => {
    vi.mocked(loadPilotPlaceWindow).mockResolvedValue({
      status: 'unconfigured',
    });
    vi.mocked(loadPilotPlaceFilterStats).mockResolvedValue({
      status: 'unconfigured',
    });
    vi.mocked(loadPlaceMap).mockResolvedValue({ status: 'unconfigured' });

    const wrapper = mountPlaces();
    await flushPromises();
    expect(wrapper.text()).not.toContain('The place store is not configured.');

    await typeButton(wrapper, 'Protected areas').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('The place store is not configured.');
    expect(wrapper.text()).not.toContain(
      'Well, this is awkward. We have nothing to show.'
    );
    expect(loadPlaceMap).toHaveBeenCalledTimes(1);
  });

  it('says the places could not be loaded', async () => {
    vi.mocked(loadPilotPlaceWindow).mockResolvedValue({ status: 'error' });

    const wrapper = mountPlaces();
    await typeButton(wrapper, 'Protected areas').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('The places could not be loaded.');
    expect(loadPlaceMap).toHaveBeenCalledTimes(1);
  });
});
