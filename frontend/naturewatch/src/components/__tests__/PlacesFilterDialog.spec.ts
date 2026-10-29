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

  it('filters on exactly the size and cropland typed', async () => {
    const store = usePlacesStore();
    await mountDialog();
    const box = (label: string) =>
      body().get<HTMLInputElement>(`input[aria-label="${label}"]`);
    const type = async (label: string, text: string) => {
      await box(label).setValue(text);
      await flushPromises();
    };

    expect(box('Minimum size, km²').element.value).toBe('1,538.28');
    await type('Minimum size, km²', '2,000.5 km²');
    expect(box('Minimum size, km²').element.value).toBe('2,000.5');
    expect(button('Show 1 place').exists()).toBe(true);

    await type('Maximum size, km²', '100');
    expect(box('Maximum size, km²').element.value).toBe('2,000.5');
    await type('Maximum size, km²', 'lots');
    expect(box('Maximum size, km²').element.value).toBe('2,000.5');
    await type('Maximum size, km²', '50000');
    expect(box('Maximum size, km²').element.value).toBe('19,485.2');

    await type('Minimum cropland, percent', '0.5');
    await type('Maximum cropland, percent', '1 %');
    expect(box('Maximum cropland, percent').element.value).toBe('1.0');
    expect(button('Show 0 places').exists()).toBe(true);
    await type('Minimum size, km²', '0');
    expect(button('Show 1 place').exists()).toBe(true);

    await button('Show 1 place').trigger('click');
    expect(store.sizeKept).toEqual([null, null]);
    expect(store.croplandKept).toEqual([0.5, 1]);
    expect(store.filtering).toBe(true);
  });

  it('keeps a typed size when the other thumb moves', async () => {
    const store = usePlacesStore();
    await mountDialog();
    await body()
      .get('input[aria-label="Minimum size, km²"]')
      .setValue('1600.25');
    await flushPromises();

    const sizeMax = body().findAll('[role="slider"]')[1];
    await sizeMax.trigger('focus');
    await sizeMax.trigger('keydown', { key: 'ArrowLeft' });
    await flushPromises();
    await button('Show 0 places').trigger('click');
    expect(store.sizeKept[0]).toBe(1600.25);
    expect(store.sizeKept[1]).toBeLessThan(19485.2);
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
