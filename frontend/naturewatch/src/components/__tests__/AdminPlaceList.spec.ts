import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AdminPlaceList from '@/components/AdminPlaceList.vue';
import { loadMainPhotos } from '@/places/images';
import { loadAdminPlaceList, type AdminListedPlace } from '@/places/status';
import usePlacesStore from '@/store/PlacesStore';
import useAuthStore from '@/store/AuthStore';

vi.mock('@/places/images', async importOriginal => {
  const actual = await importOriginal<typeof import('@/places/images')>();
  return { ...actual, loadMainPhotos: vi.fn() };
});

vi.mock('@/places/status', async importOriginal => {
  const actual = await importOriginal<typeof import('@/places/status')>();
  return { ...actual, loadAdminPlaceList: vi.fn() };
});

/**
 * A place on an admin list.
 * @param id - The place id.
 * @param name - The place name.
 * @param reason - The stored reason.
 * @returns The listed place.
 */
function listed(id: string, name: string, reason: string): AdminListedPlace {
  return {
    placeId: id,
    name,
    placeType: 'conservation_area',
    iso3: 'ZAF',
    areaKm2: 120,
    reason,
    note: null,
  };
}

describe('Admin place list', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(loadAdminPlaceList).mockReset();
    vi.mocked(loadAdminPlaceList).mockResolvedValue({
      status: 'ok',
      places: [
        listed('a', 'Alpha Reserve', 'boundary_wrong'),
        listed('b', 'Beta Park', 'possible_duplicate'),
      ],
      total: 2,
    });
    vi.mocked(loadMainPhotos).mockResolvedValue(new Map());
    useAuthStore().isAdmin = true;
  });

  it('lists the flagged places with their reasons', async () => {
    const wrapper = mount(AdminPlaceList, { props: { kind: 'attention' } });
    await flushPromises();
    expect(loadAdminPlaceList).toHaveBeenCalledWith('attention', 20, 0);
    const cards = wrapper.findAll('.place-result');
    expect(cards).toHaveLength(2);
    expect(cards[0].text()).toContain('Alpha Reserve');
    expect(cards[0].text()).toContain('Boundary looks wrong');
    expect(cards[1].text()).toContain('Possible duplicate');
    expect(wrapper.text()).toContain('2 places need attention');
  });

  it('opens a place in Edit mode on its Status tab', async () => {
    const places = usePlacesStore();
    places.adminList = 'withdrawn';
    const wrapper = mount(AdminPlaceList, { props: { kind: 'withdrawn' } });
    await flushPromises();
    await wrapper.findAll('.place-result')[1].trigger('click');
    expect(useAuthStore().editMode).toBe(true);
    expect(places.selectedId).toBe('b');
    expect(places.startTab).toBe('status');
  });

  it('reads the list again after a change, and says when it is empty', async () => {
    const places = usePlacesStore();
    const wrapper = mount(AdminPlaceList, { props: { kind: 'withdrawn' } });
    await flushPromises();
    expect(wrapper.text()).toContain('2 places withdrawn');
    vi.mocked(loadAdminPlaceList).mockResolvedValue({
      status: 'ok',
      places: [],
      total: 0,
    });
    places.adminListVersion += 1;
    await flushPromises();
    expect(loadAdminPlaceList).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('No place is withdrawn.');
  });
});
