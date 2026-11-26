import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AdminCorrectionList from '@/components/AdminCorrectionList.vue';
import {
  loadCorrections,
  photoUrls,
  removeCorrectionPhotoObjects,
  reviewCorrection,
  setCorrectionPhotos,
  uploadCorrectionPhoto,
  type StoredCorrection,
} from '@/corrections/api';
import useCorrectionsStore from '@/store/CorrectionsStore';

vi.mock('@/corrections/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/corrections/api')>();
  return {
    ...actual,
    loadCorrections: vi.fn(),
    reviewCorrection: vi.fn(),
    setCorrectionPhotos: vi.fn(),
    uploadCorrectionPhoto: vi.fn(),
    removeCorrectionPhotoObjects: vi.fn(),
    photoUrls: vi.fn(),
  };
});

/**
 * A stored correction.
 * @param id - Its id.
 * @param extra - Fields to change.
 */
function stored(
  id: string,
  extra: Partial<StoredCorrection> = {}
): StoredCorrection {
  return {
    id,
    layerId: 'cropland',
    layerVersion: 'v3',
    years: [2003, 2004, 2005],
    action: 'add',
    value: { share: 0.4 },
    note: 'Centre pivot',
    photoPaths: [],
    status: 'submitted',
    reviewNote: null,
    createdAt: '2026-11-26T10:00:00Z',
    reviewedAt: null,
    geometry: { type: 'MultiPolygon', coordinates: [] },
    ...extra,
  };
}

/**
 * Mount the list and wait for its first read.
 */
async function mountList() {
  const wrapper = mount(AdminCorrectionList);
  await flushPromises();
  return wrapper;
}

/**
 * A button by its text.
 * @param wrapper - The mounted list.
 * @param text - The button text.
 */
function button(wrapper: Awaited<ReturnType<typeof mountList>>, text: string) {
  return wrapper.findAll('button').find(item => item.text() === text)!;
}

describe('Admin correction list', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(loadCorrections).mockReset();
    vi.mocked(loadCorrections).mockResolvedValue({
      status: 'ok',
      corrections: [
        stored('a'),
        stored('b', {
          layerId: 'fire',
          value: null,
          action: 'remove',
          years: [2019, 2021],
        }),
      ],
      total: 2,
    });
    vi.mocked(reviewCorrection).mockReset().mockResolvedValue(null);
    vi.mocked(setCorrectionPhotos).mockReset().mockResolvedValue(null);
    vi.mocked(uploadCorrectionPhoto).mockReset();
    vi.mocked(removeCorrectionPhotoObjects).mockReset();
    vi.mocked(photoUrls).mockReset().mockResolvedValue({});
  });

  it('lists submitted corrections in words', async () => {
    const wrapper = await mountList();
    expect(loadCorrections).toHaveBeenCalledWith(['submitted'], 25, 0);
    expect(wrapper.text()).toContain('2 submitted corrections');
    const entries = wrapper.findAll('[data-correction-id]');
    expect(entries).toHaveLength(2);
    expect(entries[0].text()).toContain('Crops');
    expect(entries[0].text()).toContain('Add here · Cropland share 40%');
    expect(entries[0].text()).toContain('2003–2005');
    expect(entries[0].text()).toContain('Centre pivot');
    expect(entries[1].text()).toContain('Remove here');
    expect(entries[1].text()).toContain('2019, 2021');
  });

  it('switches status and reads that list', async () => {
    const wrapper = await mountList();
    await button(wrapper, 'Rejected').trigger('click');
    await flushPromises();
    expect(loadCorrections).toHaveBeenLastCalledWith(['rejected'], 25, 0);
  });

  it('chooses an entry and approves it with a note', async () => {
    const store = useCorrectionsStore();
    const wrapper = await mountList();
    await wrapper.get('[data-correction-id="a"] button').trigger('click');
    expect(store.chosen?.id).toBe('a');
    await wrapper.get('textarea[name="review-note"]').setValue(' Checked ');
    await button(wrapper, 'Approve').trigger('click');
    await flushPromises();
    expect(reviewCorrection).toHaveBeenCalledWith('a', 'approved', 'Checked');
    expect(store.chosen).toBeNull();
    expect(store.version).toBe(1);
    expect(loadCorrections).toHaveBeenCalledTimes(2);
  });

  it('sets a reviewed correction back to submitted', async () => {
    vi.mocked(loadCorrections).mockResolvedValue({
      status: 'ok',
      corrections: [
        stored('a', {
          status: 'rejected',
          reviewedAt: '2026-11-27T10:00:00Z',
          reviewNote: 'Real field',
        }),
      ],
      total: 1,
    });
    const wrapper = await mountList();
    await wrapper.get('[data-correction-id="a"] button').trigger('click');
    expect(wrapper.text()).toContain('Rejected 27 Nov 2026');
    expect(wrapper.text()).toContain('Real field');
    expect(button(wrapper, 'Approve')).toBeUndefined();
    await button(wrapper, 'Back to submitted').trigger('click');
    await flushPromises();
    expect(reviewCorrection).toHaveBeenCalledWith('a', 'submitted', null);
  });

  it('adds and removes photos of the chosen correction', async () => {
    vi.mocked(loadCorrections).mockResolvedValue({
      status: 'ok',
      corrections: [stored('a', { photoPaths: ['a/one.jpg'] })],
      total: 1,
    });
    vi.mocked(photoUrls).mockResolvedValue({ 'a/one.jpg': 'blob:one' });
    vi.mocked(uploadCorrectionPhoto).mockResolvedValue({ path: 'a/two.jpg' });
    const store = useCorrectionsStore();
    const wrapper = await mountList();
    await wrapper.get('[data-correction-id="a"] button').trigger('click');
    await flushPromises();
    expect(photoUrls).toHaveBeenCalledWith(['a/one.jpg']);
    expect(wrapper.get('img').attributes('src')).toBe('blob:one');

    const input = wrapper.get('input[type="file"]');
    const file = new File(['x'], 'two.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input.element, 'files', { value: [file] });
    await input.trigger('change');
    await flushPromises();
    expect(uploadCorrectionPhoto).toHaveBeenCalledWith('a', file);
    expect(setCorrectionPhotos).toHaveBeenCalledWith('a', [
      'a/one.jpg',
      'a/two.jpg',
    ]);
    expect(store.version).toBe(1);

    await wrapper.get('button[aria-label="Remove photo 1"]').trigger('click');
    await flushPromises();
    expect(setCorrectionPhotos).toHaveBeenLastCalledWith('a', []);
    expect(removeCorrectionPhotoObjects).toHaveBeenCalledWith(['a/one.jpg']);
  });

  it('reads again when the corrections change', async () => {
    const store = useCorrectionsStore();
    await mountList();
    store.changed();
    await flushPromises();
    expect(loadCorrections).toHaveBeenCalledTimes(2);
  });
});
