import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DOMWrapper,
  flushPromises,
  mount,
  type VueWrapper,
} from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PlacesFilterDialog from '@/components/PlacesFilterDialog.vue';
import usePlacesStore from '@/store/PlacesStore';

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
);

const places = [
  {
    name: 'Addo Elephant National Park',
    area_km2: 1538.284,
    cropland_percent: 0.7,
  },
  { name: 'Kruger National Park', area_km2: 19485.2, cropland_percent: 0.06 },
];

/** The dialog is drawn in a portal on the page body. */
const body = () => new DOMWrapper(document.body);

let wrapper: VueWrapper | null = null;

/**
 * Mount the dialog closed, then open it as the list does.
 * @returns The mounted dialog.
 */
async function mountDialog() {
  const mounted = mount(PlacesFilterDialog, {
    props: {
      open: false,
      places,
      sizeFull: [1538.284, 19485.2] as [number, number],
      'onUpdate:open': (open: boolean) => mounted.setProps({ open }),
    },
    attachTo: document.body,
  });
  wrapper = mounted;
  await mounted.setProps({ open: true });
  await flushPromises();
  return mounted;
}

/**
 * A dialog button by its text.
 * @param text - The button text.
 * @returns The button.
 */
function button(text: string) {
  const found = body()
    .findAll('button')
    .find(item => item.text() === text);
  if (!found) throw new Error(`Missing ${text}`);
  return found;
}

describe('Places filter dialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('counts the draft, and applies it only from the show button', async () => {
    const store = usePlacesStore();
    const dialog = await mountDialog();

    expect(body().text()).toContain('Filters');
    expect(button('Show 2 places').exists()).toBe(true);
    expect(body().findAll('.filter-chart')).toHaveLength(2);

    const croplandMin = body().findAll('[role="slider"]')[2];
    await croplandMin.trigger('focus');
    await croplandMin.trigger('keydown', { key: 'ArrowRight' });
    await flushPromises();
    expect(button('Show 0 places').exists()).toBe(true);
    expect(store.filtering).toBe(false);

    await button('Show 0 places').trigger('click');
    await flushPromises();
    expect(store.croplandKept).toEqual([1, 100]);
    expect(store.filtering).toBe(true);
    expect(dialog.props('open')).toBe(false);
  });

  it('discards the draft when closed, and clears it from Clear all', async () => {
    const store = usePlacesStore();
    store.applyFilter([0, 100], [50, 100]);
    const dialog = await mountDialog();

    expect(button('Show 0 places').exists()).toBe(true);
    await button('Clear all').trigger('click');
    expect(button('Show 2 places').exists()).toBe(true);
    expect(store.croplandKept).toEqual([50, 100]);

    await body().get('button[aria-label="Close filters"]').trigger('click');
    await flushPromises();
    expect(dialog.props('open')).toBe(false);
    expect(store.croplandKept).toEqual([50, 100]);
  });
});
