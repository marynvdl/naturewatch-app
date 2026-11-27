import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AdminBoundaryList from '@/components/AdminBoundaryList.vue';
import { loadMainPhotos } from '@/places/images';
import { loadBoundaryList, type ListedBoundary } from '@/places/boundaryReview';
import usePlacesStore from '@/store/PlacesStore';
import useAuthStore from '@/store/AuthStore';

vi.mock('@/places/images', async importOriginal => {
  const actual = await importOriginal<typeof import('@/places/images')>();
  return { ...actual, loadMainPhotos: vi.fn() };
});

vi.mock('@/places/boundaryReview', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/places/boundaryReview')>();
  return { ...actual, loadBoundaryList: vi.fn() };
});

/**
 * A boundary on the review list.
 * @param id - The place id.
 * @param name - The place name.
 * @param extra - Values to change.
 * @returns The listed boundary.
 */
function listed(
  id: string,
  name: string,
  extra: Partial<ListedBoundary> = {}
): ListedBoundary {
  return {
    placeId: id,
    name,
    placeType: 'conservation_area',
    iso3: 'ZAF',
    areaKm2: 120,
    boundaryId: `b-${id}`,
    qcStatus: 'flagged',
    reason: null,
    warnings: ['holes', 'small_components'],
    vertexCount: 1200,
    ...extra,
  };
}

describe('Admin boundary list', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(loadBoundaryList).mockReset();
    vi.mocked(loadBoundaryList).mockImplementation(async view =>
      view === 'pending'
        ? {
            status: 'ok',
            boundaries: [
              listed('a', 'Alpha Reserve'),
              listed('b', 'Beta Park', {
                qcStatus: 'passed',
                warnings: ['vertex_count'],
                vertexCount: 412000,
              }),
            ],
            total: 2,
          }
        : {
            status: 'ok',
            boundaries: [
              listed('c', 'Gamma Site', {
                qcStatus: 'passed',
                warnings: [],
                reason: 'Duplicate of a park',
              }),
            ],
            total: 1,
          }
    );
    vi.mocked(loadMainPhotos).mockResolvedValue(new Map());
    useAuthStore().isAdmin = true;
  });

  it('lists the pending boundaries with their warnings', async () => {
    const wrapper = mount(AdminBoundaryList);
    await flushPromises();
    expect(loadBoundaryList).toHaveBeenCalledWith('pending', 20, 0);
    const cards = wrapper.findAll('.place-result');
    expect(cards).toHaveLength(2);
    expect(cards[0].text()).toContain('Alpha Reserve');
    expect(cards[0].text()).toContain(
      'Tiny holes · Small parts · 1,200 vertices'
    );
    expect(cards[1].text()).toContain('412,000 vertices');
    expect(cards[1].text()).not.toContain('Over the vertex cap');
    expect(wrapper.text()).toContain('2 pending boundaries');
  });

  it('switches to Excluded and shows the reasons', async () => {
    const wrapper = mount(AdminBoundaryList);
    await flushPromises();
    const excluded = wrapper
      .findAll('button')
      .find(button => button.text() === 'Excluded')!;
    await excluded.trigger('click');
    await flushPromises();
    expect(loadBoundaryList).toHaveBeenLastCalledWith('excluded', 20, 0);
    const cards = wrapper.findAll('.place-result');
    expect(cards).toHaveLength(1);
    expect(cards[0].text()).toContain('Duplicate of a park');
    expect(wrapper.text()).toContain('1 excluded boundary');
  });

  it('opens a place in Edit mode on its Status tab', async () => {
    const places = usePlacesStore();
    places.adminList = 'boundaries';
    const wrapper = mount(AdminBoundaryList);
    await flushPromises();
    await wrapper.findAll('.place-result')[1].trigger('click');
    expect(useAuthStore().editMode).toBe(true);
    expect(places.selectedId).toBe('b');
    expect(places.profileTab).toBe('status');
  });

  it('reads the list again after a change, and says when it is empty', async () => {
    const places = usePlacesStore();
    const wrapper = mount(AdminBoundaryList);
    await flushPromises();
    vi.mocked(loadBoundaryList).mockResolvedValue({
      status: 'ok',
      boundaries: [],
      total: 0,
    });
    places.adminListVersion += 1;
    await flushPromises();
    expect(wrapper.text()).toContain('No boundary is pending.');
  });
});
