import { afterEach, describe, expect, it } from 'vitest';
import {
  DOMWrapper,
  flushPromises,
  mount,
  type VueWrapper,
} from '@vue/test-utils';
import PlacePhotos from '@/components/PlacePhotos.vue';
import { PHOTOS_NONE, stepPhoto, type PlacePhoto } from '@/places/photos';

const records: PlacePhoto[] = [1, 2, 3].map(number => ({
  src: `/record-${number}.jpg`,
  alt: `Record ${number}`,
  title: `Title ${number}`,
  photographer: `Photographer ${number}`,
  source: { name: `Source ${number}`, url: `https://example.org/${number}` },
  licence: { name: `Licence ${number}` },
}));

/** The gallery is drawn in a portal on the page body. */
const body = () => new DOMWrapper(document.body);

let wrapper: VueWrapper | null = null;

/**
 * Mount the photo area on the page.
 * @param photos - The records passed in.
 * @returns The mounted photo area.
 */
function mountPhotos(photos: PlacePhoto[]) {
  wrapper = mount(PlacePhotos, {
    props: { photos, placeName: 'Test place' },
    attachTo: document.body,
  });
  return wrapper;
}

/**
 * Open the gallery from the main image.
 * @returns The main image button.
 */
async function openGallery() {
  const opener = mountPhotos(records).get('button.place-photo');
  (opener.element as HTMLButtonElement).focus();
  await opener.trigger('click');
  await flushPromises();
  return opener;
}

/** The record the gallery shows now. */
const shown = () => body().get('.gallery-image').attributes('src');

/**
 * A key pressed inside the gallery.
 * @param key - The key name.
 */
async function press(key: string) {
  await body().get('.gallery').trigger('keydown', { key });
  await flushPromises();
}

describe('Place photographs', () => {
  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('shows the empty state and opens nothing without records', () => {
    const photos = mountPhotos([]);
    expect(photos.get('.place-photo-empty').text()).toBe(PHOTOS_NONE);
    expect(photos.find('button').exists()).toBe(false);
    expect(body().find('.gallery').exists()).toBe(false);
  });

  it('shows the first record as the main image', () => {
    const photos = mountPhotos(records);
    expect(photos.get('.place-photo-image').attributes('src')).toBe(
      '/record-1.jpg'
    );
    expect(photos.get('.place-photo-credit').text()).toBe(
      'Photo: Photographer 1 · Licence 1'
    );
    expect(photos.get('.place-photo-count').text()).toBe('3');
  });

  it('opens on the main image with its photographer, source, and licence', async () => {
    await openGallery();
    expect(body().get('.gallery-title').text()).toBe(
      'Photographs of Test place'
    );
    expect(shown()).toBe('/record-1.jpg');
    expect(body().get('.gallery-count').text()).toBe('1 of 3');
    const credit = body().get('.gallery-credit');
    expect(credit.findAll(':scope > *').map(part => part.text())).toEqual([
      'Photo: Photographer 1',
      '·',
      'Source 1',
      '·',
      'Licence 1',
    ]);
    expect(credit.get('a').attributes('href')).toBe('https://example.org/1');
  });

  it('moves with next and previous, and wraps at the ends', async () => {
    await openGallery();
    const next = body().get('button[aria-label="Next photograph"]');
    const previous = body().get('button[aria-label="Previous photograph"]');

    await next.trigger('click');
    expect(shown()).toBe('/record-2.jpg');
    expect(body().get('.gallery-credit').text()).toContain('Photographer 2');
    await previous.trigger('click');
    await previous.trigger('click');
    expect(shown()).toBe('/record-3.jpg');
    expect(body().get('.gallery-count').text()).toBe('3 of 3');
  });

  it('moves with the arrow keys and the thumbnails', async () => {
    await openGallery();
    await press('ArrowRight');
    expect(shown()).toBe('/record-2.jpg');
    await press('ArrowLeft');
    await press('ArrowLeft');
    expect(shown()).toBe('/record-3.jpg');

    await body().findAll('.gallery-thumb')[1].trigger('click');
    expect(shown()).toBe('/record-2.jpg');
  });

  it('closes on Escape and returns focus to the main image', async () => {
    const opener = await openGallery();
    await press('Escape');
    expect(body().find('.gallery').exists()).toBe(false);
    expect(document.activeElement).toBe(opener.element);
  });

  it('has no steps or thumbnails for one record', async () => {
    mountPhotos(records.slice(0, 1));
    await wrapper!.get('button.place-photo').trigger('click');
    await flushPromises();
    expect(shown()).toBe('/record-1.jpg');
    expect(body().find('.gallery-step').exists()).toBe(false);
    expect(body().find('.gallery-strip').exists()).toBe(false);
    expect(body().find('.gallery-count').exists()).toBe(false);
  });
});

describe('stepPhoto', () => {
  it('wraps both ways', () => {
    expect(stepPhoto(2, 1, 3)).toBe(0);
    expect(stepPhoto(0, -1, 3)).toBe(2);
    expect(stepPhoto(0, 1, 0)).toBe(0);
  });
});
