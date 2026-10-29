import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PlacesBarComponent from '@/components/PlacesBarComponent.vue';
import { loadPilotPlaces, loadPlaceMap } from '@/places/api';
import usePlacesStore from '@/store/PlacesStore';

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
);

vi.mock('@/places/api', () => ({
  loadPilotPlaces: vi.fn(),
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

const drawn = {
  status: 'ok' as const,
  features: { type: 'FeatureCollection' as const, features: [] },
  releaseMonth: '',
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
    vi.clearAllMocks();
  });

  it('shows results and boundaries only after a place type is selected', async () => {
    vi.mocked(loadPilotPlaces).mockResolvedValue({ status: 'ok', places });
    vi.mocked(loadPlaceMap).mockResolvedValue(drawn);

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

    await wrapper.get('input[aria-label="Search places"]').setValue('kruger');
    expect(wrapper.text()).toContain('Kruger National Park');
    expect(wrapper.text()).not.toContain('Addo Elephant National Park');

    await wrapper.get('input[aria-label="Search places"]').setValue('');
    expect(wrapper.text()).toContain('Addo Elephant National Park');

    const place = wrapper.get('button.place-result');
    expect(place.text()).toContain('South Africa');
    expect(place.text()).toContain('1,538 km²');
    await place.trigger('click');
    expect(place.attributes('aria-current')).toBe('true');
    await place.trigger('click');
    expect(place.attributes('aria-current')).toBeUndefined();

    await wrapper.get('input[aria-label="Search places"]').setValue('zzz');
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
    expect(loadPilotPlaces).toHaveBeenCalledTimes(1);
    expect(loadPlaceMap).toHaveBeenCalledTimes(1);

    await typeButton(wrapper, 'Protected areas').trigger('click');
    expect(wrapper.text()).toContain('No places match.');
    expect(wrapper.text()).not.toContain('Kruger National Park');
    expect(typeButton(wrapper, 'Protected areas').classes()).not.toContain(
      'is-on'
    );
    expect(loadPlaceMap).toHaveBeenCalledTimes(1);
  });

  it('sorts and filters the protected areas', async () => {
    vi.mocked(loadPilotPlaces).mockResolvedValue({ status: 'ok', places });
    vi.mocked(loadPlaceMap).mockResolvedValue(drawn);

    const wrapper = mountPlaces(true);
    const page = new DOMWrapper(document.body);
    await typeButton(wrapper, 'Protected areas').trigger('click');
    await flushPromises();
    const names = () =>
      wrapper.findAll('.place-card-name').map(item => item.text());

    expect(names()).toEqual([
      'Addo Elephant National Park',
      'Kruger National Park',
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

    await sortBy('Size, largest first');
    expect(names()).toEqual([
      'Kruger National Park',
      'Addo Elephant National Park',
    ]);
    expect(page.find('[role="radio"]').exists()).toBe(false);
    await sortBy('Cropland %, highest first');
    expect(names()).toEqual([
      'Addo Elephant National Park',
      'Kruger National Park',
    ]);

    const search = wrapper.get('input[aria-label="Search places"]');
    await search.setValue('kruger');
    expect(names()).toEqual(['Kruger National Park']);
    expect(wrapper.get('.place-number').text()).toBe('2');
    await search.setValue('');

    const store = usePlacesStore();
    expect(store.keptIds).toBeNull();
    store.applyFilter([99, 100], [0, 100]);
    await flushPromises();
    expect(names()).toEqual(['Kruger National Park']);
    expect(wrapper.get('.places-count').text()).toBe('1 of 2 places');
    expect(store.keptIds).toEqual([places[1].id]);
    expect(wrapper.get('button.places-filter-toggle').classes()).toContain(
      'is-on'
    );
    expect(loadPlaceMap).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('lists places that start with the search when no type is selected', async () => {
    vi.mocked(loadPilotPlaces).mockResolvedValue({ status: 'ok', places });

    const wrapper = mountPlaces();
    await wrapper.get('input[aria-label="Search places"]').setValue('kru');
    await flushPromises();

    expect(wrapper.text()).toContain('Kruger National Park');
    expect(wrapper.text()).not.toContain('Addo Elephant National Park');
    expect(typeButton(wrapper, 'Protected areas').classes()).not.toContain(
      'is-on'
    );
    expect(loadPlaceMap).not.toHaveBeenCalled();

    await wrapper.get('input[aria-label="Search places"]').setValue('park');
    expect(wrapper.text()).toContain('No places match.');
    expect(wrapper.text()).not.toContain('Kruger National Park');
  });

  it('marks a place chosen on the map in the list', async () => {
    vi.mocked(loadPilotPlaces).mockResolvedValue({ status: 'ok', places });
    vi.mocked(loadPlaceMap).mockResolvedValue(drawn);

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

  it('keeps the search and the place type when the profile closes', async () => {
    vi.mocked(loadPilotPlaces).mockResolvedValue({ status: 'ok', places });
    vi.mocked(loadPlaceMap).mockResolvedValue(drawn);

    const pinia = createPinia();
    const wrapper = mount(PlacesBarComponent, {
      global: { plugins: [pinia] },
    });
    await typeButton(wrapper, 'Protected areas').trigger('click');
    await flushPromises();
    await wrapper.get('input[aria-label="Search places"]').setValue('kruger');
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
    vi.mocked(loadPilotPlaces).mockResolvedValue({ status: 'ok', places });
    vi.mocked(loadPlaceMap).mockResolvedValue(drawn);

    const pinia = createPinia();
    const wrapper = mount(PlacesBarComponent, {
      global: { plugins: [pinia] },
    });
    const store = usePlacesStore(pinia);
    await typeButton(wrapper, 'Protected areas').trigger('click');
    await flushPromises();
    await wrapper.get('input[aria-label="Search places"]').setValue('zzz');

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
    vi.mocked(loadPilotPlaces).mockResolvedValue({ status: 'unconfigured' });
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
    vi.mocked(loadPilotPlaces).mockResolvedValue({ status: 'error' });
    vi.mocked(loadPlaceMap).mockResolvedValue(drawn);

    const wrapper = mountPlaces();
    await typeButton(wrapper, 'Protected areas').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('The places could not be loaded.');
    expect(loadPlaceMap).toHaveBeenCalledTimes(1);
  });
});
