import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PlacesBarComponent from '@/components/PlacesBarComponent.vue';
import { loadPilotPlaces, loadPlaceMap } from '@/places/api';

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

  it('searches stored protected areas by name and does not load boundaries', async () => {
    vi.mocked(loadPilotPlaces).mockResolvedValue({ status: 'ok', places });
    vi.mocked(loadPlaceMap).mockResolvedValue({ status: 'unconfigured' });

    const wrapper = mountPlaces();
    await flushPromises();

    expect(wrapper.text()).toContain('Addo Elephant National Park');
    expect(wrapper.text()).toContain('Kruger National Park');
    expect(loadPlaceMap).not.toHaveBeenCalled();

    await wrapper.get('input[aria-label="Search places"]').setValue('kruger');
    expect(wrapper.text()).toContain('Kruger National Park');
    expect(wrapper.text()).not.toContain('Addo Elephant National Park');

    await wrapper.get('input[aria-label="Search places"]').setValue('');
    expect(wrapper.text()).toContain('Addo Elephant National Park');
    expect(wrapper.text()).toContain('Kruger National Park');

    await wrapper.get('input[aria-label="Search places"]').setValue('zzz');
    expect(wrapper.text()).toContain('No places match.');

    await typeButton(wrapper, 'Ecoregions').trigger('click');
    expect(wrapper.text()).toContain('None are stored.');
    expect(wrapper.text()).not.toContain('Kruger National Park');

    await typeButton(wrapper, 'Countries').trigger('click');
    expect(wrapper.text()).toContain('None are stored.');

    await typeButton(wrapper, 'Protected areas').trigger('click');
    expect(wrapper.text()).toContain('No places match.');
    expect(loadPilotPlaces).toHaveBeenCalledTimes(1);
    expect(loadPlaceMap).not.toHaveBeenCalled();

    await typeButton(wrapper, 'Protected areas').trigger('click');
    await flushPromises();
    expect(loadPlaceMap).toHaveBeenCalledTimes(1);
  });

  it('says the place store is not configured', async () => {
    vi.mocked(loadPilotPlaces).mockResolvedValue({ status: 'unconfigured' });
    vi.mocked(loadPlaceMap).mockResolvedValue({ status: 'unconfigured' });

    const wrapper = mountPlaces();
    await flushPromises();

    expect(wrapper.text()).toContain('The place store is not configured.');
    expect(wrapper.text()).not.toContain('None are stored.');
    expect(loadPlaceMap).not.toHaveBeenCalled();
  });

  it('says the places could not be loaded', async () => {
    vi.mocked(loadPilotPlaces).mockResolvedValue({ status: 'error' });
    vi.mocked(loadPlaceMap).mockResolvedValue({ status: 'error' });

    const wrapper = mountPlaces();
    await flushPromises();

    expect(wrapper.text()).toContain('The places could not be loaded.');
    expect(loadPlaceMap).not.toHaveBeenCalled();
  });
});
