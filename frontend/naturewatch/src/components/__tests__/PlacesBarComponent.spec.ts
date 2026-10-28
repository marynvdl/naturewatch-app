import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PlacesBarComponent from '@/components/PlacesBarComponent.vue';
import { loadPilotPlaces, loadPlaceMap } from '@/places/api';
import usePlacesStore from '@/store/PlacesStore';

vi.mock('@/places/api', () => ({
  loadPilotPlaces: vi.fn(),
  loadPlaceMap: vi.fn(),
}));

const places = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Addo Elephant National Park',
  },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Kruger National Park' },
];

const drawn = {
  status: 'ok' as const,
  features: { type: 'FeatureCollection' as const, features: [] },
  releaseMonth: '',
};

/**
 * Mount the places panel with a fresh store.
 * @returns The mounted panel.
 */
function mountPlaces() {
  return mount(PlacesBarComponent, {
    global: { plugins: [createPinia()] },
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
    expect(wrapper.find('.places-detail').exists()).toBe(false);
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
    await place.trigger('click');
    expect(wrapper.find('.places-detail').exists()).toBe(true);
    await place.trigger('click');
    expect(wrapper.find('.places-detail').exists()).toBe(false);

    await wrapper.get('input[aria-label="Search places"]').setValue('zzz');
    expect(wrapper.text()).toContain('No places match.');
    expect(loadPlaceMap).toHaveBeenCalledTimes(1);

    await typeButton(wrapper, 'Ecoregions').trigger('click');
    expect(wrapper.text()).toContain(
      'Well, this is awkward. We have nothing to show.'
    );
    expect(wrapper.text()).not.toContain('Kruger National Park');
    expect(wrapper.find('.places-detail').exists()).toBe(false);
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
    expect(wrapper.text()).not.toContain('No places match.');
    expect(wrapper.text()).not.toContain('Kruger National Park');
    expect(loadPlaceMap).toHaveBeenCalledTimes(1);
  });

  it('opens the detail column for a place chosen on the map', async () => {
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

    expect(wrapper.find('.places-detail').exists()).toBe(true);
    expect(wrapper.find('.places-frame').classes()).toContain('has-detail');
    store.selectPlace(places[1].id);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.places-detail').exists()).toBe(false);
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
    expect(wrapper.find('.places-detail').exists()).toBe(true);
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
