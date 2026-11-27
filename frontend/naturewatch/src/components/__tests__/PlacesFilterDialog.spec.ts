import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DOMWrapper,
  flushPromises,
  mount,
  type VueWrapper,
} from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PlacesFilterDialog from '@/components/PlacesFilterDialog.vue';
import { loadPilotPlaceWindowCount } from '@/places/api';
import {
  CROPLAND_FULL,
  filterPlaces,
  type FigureRange,
} from '@/places/display';
import usePlacesStore from '@/store/PlacesStore';
import useAuthStore from '@/store/AuthStore';

vi.mock('@/places/api', () => ({
  loadPilotPlaceWindowCount: vi.fn(),
  loadKeptPlaceIds: vi.fn(async () => ({ status: 'ok', ids: [] })),
  loadEcoregionNames: vi.fn(async () => ({
    status: 'ok',
    ecoregions: [
      { id: 'e1', name: 'Zambezian mopane woodlands' },
      { id: 'e2', name: 'Zambezian Baikiaea woodlands' },
      { id: 'e3', name: 'Kalahari xeric savanna' },
    ],
  })),
}));

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
);

// The combobox scrolls its highlighted item into view.
Element.prototype.scrollIntoView = vi.fn();

const places = [
  {
    name: 'Addo Elephant National Park',
    area_km2: 1538.284,
    cropland_percent: 0.7,
  },
  { name: 'Kruger National Park', area_km2: 19485.2, cropland_percent: 0.06 },
];
const sizeFull: FigureRange = [1538.284, 19485.2];
const emptyBins = new Array(40).fill(0);

/** The dialog is drawn in a portal on the page body. */
const body = () => new DOMWrapper(document.body);

let wrapper: VueWrapper | null = null;

/**
 * Mount the dialog closed, then open it as the list does.
 * @returns The mounted dialog.
 */
async function mountDialog(placeTypes?: string[], countTypes?: string[]) {
  const mounted = mount(PlacesFilterDialog, {
    props: {
      placeTypes,
      countTypes,
      open: false,
      sizeFull,
      sizeBins: emptyBins,
      search: '',
      searchPrefix: false,
      extent: null,
      matchedTotal: 2,
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
    vi.mocked(loadPilotPlaceWindowCount).mockImplementation(async query => ({
      status: 'ok',
      total: filterPlaces(
        places,
        {
          kept: [query.sizeMin ?? sizeFull[0], query.sizeMax ?? sizeFull[1]],
          full: sizeFull,
        },
        {
          kept: [query.cropMin, query.cropMax],
          full: CROPLAND_FULL,
        }
      ).length,
    }));
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('offers the photo filter to admins in Edit mode only, and applies it', async () => {
    const store = usePlacesStore();
    const auth = useAuthStore();
    await mountDialog();
    expect(body().find('#filter-photos').exists()).toBe(false);
    wrapper?.unmount();

    auth.isAdmin = true;
    await mountDialog();
    expect(body().find('#filter-photos').exists()).toBe(false);
    wrapper?.unmount();

    auth.editMode = true;
    await mountDialog();
    expect(body().get('label[for="filter-photos"]').text()).toBe(
      'Has photo suggestions'
    );
    await body().get('#filter-photos').trigger('click');
    await flushPromises();
    expect(loadPilotPlaceWindowCount).toHaveBeenLastCalledWith(
      expect.objectContaining({ photoSuggestions: true })
    );
    expect(store.photoSuggestions).toBe(false);
    await button('Show 2 places').trigger('click');
    await flushPromises();
    expect(store.photoSuggestions).toBe(true);
    expect(store.filtering).toBe(true);
    wrapper?.unmount();

    await mountDialog();
    await button('Clear all').trigger('click');
    await flushPromises();
    await button('Show 2 places').trigger('click');
    await flushPromises();
    expect(store.photoSuggestions).toBe(false);
  });

  it('offers the boundary review filter to admins in Edit mode, and applies it', async () => {
    const store = usePlacesStore();
    const auth = useAuthStore();
    await mountDialog();
    expect(body().text()).not.toContain('Boundary review');
    wrapper?.unmount();

    auth.isAdmin = true;
    auth.editMode = true;
    await mountDialog();
    expect(body().text()).toContain('Boundary review');
    await button('Needs fixing').trigger('click');
    await flushPromises();
    expect(loadPilotPlaceWindowCount).toHaveBeenLastCalledWith(
      expect.objectContaining({ boundaryReview: 'needs_fixing' })
    );
    expect(store.boundaryReview).toBeNull();
    await button('Show 2 places').trigger('click');
    await flushPromises();
    expect(store.boundaryReview).toBe('needs_fixing');
    expect(store.filtering).toBe(true);
    wrapper?.unmount();

    await mountDialog();
    await button('All').trigger('click');
    await button('Show 2 places').trigger('click');
    await flushPromises();
    expect(store.boundaryReview).toBeNull();
  });

  it('counts the draft, and applies it only from the show button', async () => {
    const store = usePlacesStore();
    const dialog = await mountDialog();

    expect(body().text()).toContain('Filters');
    expect(button('Show 2 places').exists()).toBe(true);
    // The size range only: cropland is not a filter
    expect(body().findAll('.filter-chart')).toHaveLength(1);
    expect(body().text()).not.toContain('Cropland');

    await body().get('input[aria-label="Minimum size, km²"]').setValue('2000');
    await flushPromises();
    expect(loadPilotPlaceWindowCount).toHaveBeenLastCalledWith(
      expect.objectContaining({ sizeMin: 2000, cropMin: 0, cropMax: 100 })
    );
    expect(button('Show 1 place').exists()).toBe(true);
    expect(store.filtering).toBe(false);

    await button('Show 1 place').trigger('click');
    await flushPromises();
    expect(store.sizeKept).toEqual([2000, null]);
    expect(store.filtering).toBe(true);
    expect(dialog.props('open')).toBe(false);
  });

  it('filters on exactly the size typed', async () => {
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
    await flushPromises();
    expect(button('Show 1 place').exists()).toBe(true);

    await type('Maximum size, km²', '100');
    expect(box('Maximum size, km²').element.value).toBe('2,000.5');
    await type('Maximum size, km²', 'lots');
    expect(box('Maximum size, km²').element.value).toBe('2,000.5');
    await type('Maximum size, km²', '50000');
    expect(box('Maximum size, km²').element.value).toBe('19,485.2');

    await type('Maximum size, km²', '5000');
    expect(button('Show 0 places').exists()).toBe(true);
    await type('Minimum size, km²', '0');
    expect(button('Show 1 place').exists()).toBe(true);

    await button('Show 1 place').trigger('click');
    expect(store.sizeKept).toEqual([null, 5000]);
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
    store.applyFilter([2000, 3000]);
    const dialog = await mountDialog();

    expect(button('Show 0 places').exists()).toBe(true);
    await button('Clear all').trigger('click');
    await flushPromises();
    expect(button('Show 2 places').exists()).toBe(true);
    expect(store.sizeKept).toEqual([2000, 3000]);

    await body().get('button[aria-label="Close filters"]').trigger('click');
    await flushPromises();
    expect(dialog.props('open')).toBe(false);
    expect(store.sizeKept).toEqual([2000, 3000]);
  });

  it('chooses ecoregions by name, counts them, and applies them', async () => {
    const store = usePlacesStore();
    store.listTypes = ['conservation_area'];
    await mountDialog(['conservation_area']);
    const input = body().get<HTMLInputElement>(
      'input[aria-labelledby="filter-ecoregion-title"]'
    );
    expect(body().text()).toContain('Ecoregion');

    await input.setValue('zambez');
    await flushPromises();
    const items = body().findAll('.ecoregions-item');
    expect(items.map(item => item.text())).toEqual([
      'Zambezian Baikiaea woodlands',
      'Zambezian mopane woodlands',
    ]);
    await items[1].trigger('click');
    await flushPromises();
    await input.setValue('kalahari');
    await flushPromises();
    await body().get('.ecoregions-item').trigger('click');
    await flushPromises();

    expect(
      body()
        .findAll('.ecoregions-chip')
        .map(chip => chip.text())
    ).toEqual(['Zambezian mopane woodlands', 'Kalahari xeric savanna']);
    expect(loadPilotPlaceWindowCount).toHaveBeenLastCalledWith(
      expect.objectContaining({ ecoregionIds: ['e1', 'e3'] })
    );
    await body()
      .get('button[aria-label="Remove Kalahari xeric savanna"]')
      .trigger('click');
    await flushPromises();
    expect(loadPilotPlaceWindowCount).toHaveBeenLastCalledWith(
      expect.objectContaining({ ecoregionIds: ['e1'] })
    );
    expect(store.ecoregionsKept).toEqual([]);

    await button('Show 2 places').trigger('click');
    expect(store.ecoregionsKept).toEqual([
      { id: 'e1', name: 'Zambezian mopane woodlands' },
    ]);
    expect(store.ecoregionIds).toEqual(['e1']);
    expect(store.filtering).toBe(true);
  });

  it('clears the ecoregions from Clear all', async () => {
    const store = usePlacesStore();
    store.applyFilter(
      [null, null],
      [{ id: 'e1', name: 'Zambezian mopane woodlands' }]
    );
    await mountDialog(['conservation_area']);
    expect(body().findAll('.ecoregions-chip')).toHaveLength(1);
    await button('Clear all').trigger('click');
    await flushPromises();
    expect(body().findAll('.ecoregions-chip')).toHaveLength(0);
    await button('Show 2 places').trigger('click');
    expect(store.ecoregionsKept).toEqual([]);
  });

  it('has no Ecoregion field for Ecoregions, and keeps the chosen ones', async () => {
    const store = usePlacesStore();
    const chosen = [{ id: 'e1', name: 'Zambezian mopane woodlands' }];
    store.applyFilter([null, null], chosen);
    await mountDialog(['ecoregion']);
    expect(
      body().find('input[aria-labelledby="filter-ecoregion-title"]').exists()
    ).toBe(false);
    expect(loadPilotPlaceWindowCount).toHaveBeenLastCalledWith(
      expect.objectContaining({ ecoregionIds: [] })
    );
    await button('Show 2 places').trigger('click');
    expect(store.ecoregionsKept).toEqual(chosen);
  });

  it('with no type, counts every type it is given, and Apply asks the map to fit', async () => {
    vi.mocked(loadPilotPlaceWindowCount).mockClear();
    await mountDialog([], ['conservation_area', 'ecoregion']);
    const store = usePlacesStore();
    const fits = store.fitRequest;

    expect(body().find('.filter-chart').exists()).toBe(true);
    expect(body().find('#filter-ecoregion-title').exists()).toBe(true);
    expect(body().find('#filter-types-title').exists()).toBe(true);
    expect(loadPilotPlaceWindowCount).toHaveBeenLastCalledWith(
      expect.objectContaining({
        placeTypes: ['conservation_area', 'ecoregion'],
      })
    );

    await button('Show 2 places').trigger('click');
    await flushPromises();
    expect(store.fitRequest).toBe(fits + 1);
  });
});
