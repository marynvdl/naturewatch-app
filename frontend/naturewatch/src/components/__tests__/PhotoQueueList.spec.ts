import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PhotoQueueList from '@/components/PhotoQueueList.vue';
import {
  loadMainPhotos,
  loadPhotoQueue,
  type QueuedPlace,
} from '@/places/images';
import usePlacesStore from '@/store/PlacesStore';
import useAuthStore from '@/store/AuthStore';

vi.mock('@/places/images', async importOriginal => {
  const actual = await importOriginal<typeof import('@/places/images')>();
  return { ...actual, loadPhotoQueue: vi.fn(), loadMainPhotos: vi.fn() };
});

/**
 * A World Heritage Site in the queue.
 * @param id - The place id.
 * @param name - The place name.
 * @param suggested - How many photographs are suggested.
 * @returns The queued place.
 */
function queued(id: string, name: string, suggested: number): QueuedPlace {
  return {
    placeId: id,
    name,
    placeType: 'world_heritage_site',
    iso3: 'IRN',
    areaKm2: 34481,
    suggested,
  };
}

const PLACES = [
  queued('a', 'Lut Desert', 12),
  queued('b', 'Maloti-Drakensberg Park', 3),
  queued('c', 'Mammoth Cave National Park', 1),
];

/**
 * Mount the list and wait for the queue to load.
 * @returns The mounted list.
 */
async function mountList() {
  const wrapper = mount(PhotoQueueList);
  await flushPromises();
  return wrapper;
}

describe('Photo queue list', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(loadPhotoQueue).mockReset();
    vi.mocked(loadPhotoQueue).mockResolvedValue({
      status: 'ok',
      places: PLACES,
      total: 3,
    });
    vi.mocked(loadMainPhotos).mockResolvedValue(new Map());
    useAuthStore().isAdmin = true;
  });

  it('lists the places as cards with their counts', async () => {
    const wrapper = await mountList();
    expect(loadPhotoQueue).toHaveBeenCalledWith(20, 0);
    const cards = wrapper.findAll('.place-result');
    expect(cards).toHaveLength(3);
    expect(cards[0].text()).toContain('Lut Desert');
    expect(cards[0].text()).toContain('World Heritage');
    expect(cards[0].text()).toContain('12 suggested');
    expect(wrapper.text()).toContain('3 places with suggested photographs');
    expect(usePlacesStore().photoQueueIds).toEqual(['a', 'b', 'c']);
  });

  it('opens a place in Edit mode on its Photos tab, and Next place follows the list', async () => {
    const auth = useAuthStore();
    const places = usePlacesStore();
    places.photoQueueOpen = true;
    const wrapper = await mountList();
    await wrapper.findAll('.place-result')[1].trigger('click');
    expect(auth.editMode).toBe(true);
    expect(places.selectedId).toBe('b');
    expect(places.startTab).toBe('photos');
    expect(places.nextInPhotoQueue).toBe('c');
    expect(wrapper.findAll('.place-result')[1].attributes('aria-current')).toBe(
      'true'
    );

    // The last suggestion of b is reviewed: it leaves the list and stays open.
    vi.mocked(loadPhotoQueue).mockResolvedValue({
      status: 'ok',
      places: [PLACES[0], PLACES[2]],
      total: 2,
    });
    places.photoQueueVersion += 1;
    await flushPromises();
    expect(loadPhotoQueue).toHaveBeenCalledTimes(2);
    expect(wrapper.findAll('.place-result')).toHaveLength(2);
    expect(places.selectedId).toBe('b');
    expect(places.nextInPhotoQueue).toBe('c');

    places.openFromPhotoQueue('c');
    expect(places.selectedId).toBe('c');
    expect(places.nextInPhotoQueue).toBeNull();
  });

  it('shows more places on request', async () => {
    vi.mocked(loadPhotoQueue).mockResolvedValueOnce({
      status: 'ok',
      places: PLACES.slice(0, 2),
      total: 3,
    });
    const wrapper = await mountList();
    expect(wrapper.text()).toContain('2 of 3 places');
    vi.mocked(loadPhotoQueue).mockResolvedValueOnce({
      status: 'ok',
      places: [PLACES[2]],
      total: 3,
    });
    const more = wrapper
      .findAll('button')
      .find(button => button.text() === 'Show more');
    await more!.trigger('click');
    await flushPromises();
    expect(loadPhotoQueue).toHaveBeenLastCalledWith(20, 2);
    expect(wrapper.findAll('.place-result')).toHaveLength(3);
    expect(wrapper.text()).not.toContain('Show more');
  });

  it('says when the queue is empty or fails', async () => {
    vi.mocked(loadPhotoQueue).mockResolvedValue({
      status: 'ok',
      places: [],
      total: 0,
    });
    expect((await mountList()).text()).toContain(
      'No place has suggested photographs.'
    );
    vi.mocked(loadPhotoQueue).mockResolvedValue({ status: 'error' });
    expect((await mountList()).text()).toContain(
      'The photo queue could not be loaded.'
    );
  });
});
