import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { MultiPolygon } from 'geojson';
import PlaceBoundaryUpload from '@/components/PlaceBoundaryUpload.vue';
import {
  approveBoundary,
  loadCurrentBoundary,
  loadProposedBoundary,
  readBoundaryFile,
  rejectBoundary,
  submitBoundary,
  type ProposedBoundary,
} from '@/places/replacementBoundary';
import usePlacesStore from '@/store/PlacesStore';

vi.mock('@/places/replacementBoundary', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/places/replacementBoundary')>();
  return {
    ...actual,
    approveBoundary: vi.fn(),
    loadCurrentBoundary: vi.fn(),
    loadProposedBoundary: vi.fn(),
    readBoundaryFile: vi.fn(),
    rejectBoundary: vi.fn(),
    submitBoundary: vi.fn(),
  };
});

const placeId = '44444444-4444-4444-4444-444444444444';
const SHAPE: MultiPolygon = {
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [30, -20],
        [30.1, -20],
        [30.1, -19.9],
        [30, -20],
      ],
    ],
  ],
};
const PROPOSED: ProposedBoundary = {
  boundaryId: 'b2',
  areaKm2: 412.3,
  points: 8214,
  sourceUrl: 'https://example.test/park',
  submittedBy: 'someone',
  createdAt: '2026-11-28T10:00:00Z',
  derivedFrom: null,
  shape: SHAPE,
};

/**
 * Mount the upload on a place with the given proposed boundary.
 * @param proposed - The proposed boundary, or null.
 */
async function mountWith(proposed: ProposedBoundary | null) {
  vi.mocked(loadProposedBoundary).mockResolvedValue({ status: 'ok', proposed });
  const wrapper = mount(PlaceBoundaryUpload, { props: { placeId } });
  await flushPromises();
  return wrapper;
}

/**
 * The buttons' labels.
 * @param wrapper - The mounted upload.
 */
function labels(wrapper: Awaited<ReturnType<typeof mountWith>>) {
  return wrapper.findAll('button').map(button => button.text());
}

/**
 * Click the button with this label.
 * @param wrapper - The mounted upload.
 * @param label - Its text.
 */
async function click(
  wrapper: Awaited<ReturnType<typeof mountWith>>,
  label: string
) {
  const button = wrapper.findAll('button').find(b => b.text() === label);
  if (!button) throw new Error(`no button ${label}`);
  await button.trigger('click');
  await flushPromises();
}

/**
 * Choose a file in the hidden input.
 * @param wrapper - The mounted upload.
 */
async function chooseFile(wrapper: Awaited<ReturnType<typeof mountWith>>) {
  const input = wrapper.find('input[type="file"]');
  Object.defineProperty(input.element, 'files', {
    value: [new File(['{}'], 'park.geojson')],
    configurable: true,
  });
  await input.trigger('change');
  await flushPromises();
}

describe('PlaceBoundaryUpload', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('offers Replace boundary and Edit on map when nothing is proposed', async () => {
    const wrapper = await mountWith(null);
    expect(labels(wrapper)).toEqual(['Replace boundary', 'Edit on map']);
    expect(usePlacesStore().boundaryPreview).toBeNull();
  });

  it('shows nothing when the database is not configured', async () => {
    vi.mocked(loadProposedBoundary).mockResolvedValue({
      status: 'unconfigured',
    });
    const wrapper = mount(PlaceBoundaryUpload, { props: { placeId } });
    await flushPromises();
    expect(wrapper.find('.boundary-upload').exists()).toBe(false);
  });

  it('outlines a chosen file and submits it', async () => {
    vi.mocked(readBoundaryFile).mockResolvedValue({
      ok: true,
      shape: SHAPE,
      points: 4,
      areaKm2: 60.2,
    });
    vi.mocked(submitBoundary).mockResolvedValue(null);
    const wrapper = await mountWith(null);
    await chooseFile(wrapper);
    expect(wrapper.text()).toContain(
      '60.20 km², 4 points, outlined on the map.'
    );
    expect(labels(wrapper)).toEqual(['Submit', 'Cancel']);
    expect(usePlacesStore().boundaryPreview).toEqual(SHAPE);

    await wrapper.find('input[type="url"]').setValue(' https://example.test ');
    vi.mocked(loadProposedBoundary).mockResolvedValue({
      status: 'ok',
      proposed: PROPOSED,
    });
    await click(wrapper, 'Submit');
    expect(submitBoundary).toHaveBeenCalledWith(
      placeId,
      SHAPE,
      'https://example.test',
      null
    );
    expect(labels(wrapper)).toEqual(['Approve', 'Discard']);
  });

  it('cancels a chosen file', async () => {
    vi.mocked(readBoundaryFile).mockResolvedValue({
      ok: true,
      shape: SHAPE,
      points: 4,
      areaKm2: 60.2,
    });
    const wrapper = await mountWith(null);
    await chooseFile(wrapper);
    await click(wrapper, 'Cancel');
    expect(labels(wrapper)).toEqual(['Replace boundary', 'Edit on map']);
    expect(usePlacesStore().boundaryPreview).toBeNull();
  });

  it('says why a file was refused', async () => {
    vi.mocked(readBoundaryFile).mockResolvedValue({
      ok: false,
      message: 'The file must hold a polygon or a multipolygon.',
    });
    const wrapper = await mountWith(null);
    await chooseFile(wrapper);
    expect(wrapper.find('[role="alert"]').text()).toBe(
      'The file must hold a polygon or a multipolygon.'
    );
    expect(labels(wrapper)).toEqual(['Replace boundary', 'Edit on map']);
  });

  it('clears a refusal when a good file follows', async () => {
    vi.mocked(readBoundaryFile)
      .mockResolvedValueOnce({ ok: false, message: 'The file is not GeoJSON.' })
      .mockResolvedValueOnce({
        ok: true,
        shape: SHAPE,
        points: 4,
        areaKm2: 60.2,
      });
    const wrapper = await mountWith(null);
    await chooseFile(wrapper);
    await chooseFile(wrapper);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(labels(wrapper)).toEqual(['Submit', 'Cancel']);
  });

  it('shows a proposed boundary with Approve and Discard', async () => {
    const wrapper = await mountWith(PROPOSED);
    expect(wrapper.text()).toContain('Proposed boundary');
    expect(wrapper.text()).toContain(
      '412 km², 8,214 points. Uploaded 28 Nov 2026, by another admin.'
    );
    expect(wrapper.find('a').attributes('href')).toBe(
      'https://example.test/park'
    );
    expect(labels(wrapper)).toEqual(['Approve', 'Discard']);
    expect(usePlacesStore().boundaryPreview).toEqual(SHAPE);
  });

  it('approves, says the map lags, and tells the section', async () => {
    vi.mocked(approveBoundary).mockResolvedValue(null);
    const wrapper = await mountWith(PROPOSED);
    vi.mocked(loadProposedBoundary).mockResolvedValue({
      status: 'ok',
      proposed: null,
    });
    await click(wrapper, 'Approve');
    expect(approveBoundary).toHaveBeenCalledWith('b2');
    expect(wrapper.emitted('approved')).toHaveLength(1);
    expect(wrapper.text()).toContain(
      'Approved. The map shows the old boundary until the tiles are rebuilt.'
    );
    expect(usePlacesStore().boundaryPreview).toBeNull();
  });

  it('discards', async () => {
    vi.mocked(rejectBoundary).mockResolvedValue(null);
    const wrapper = await mountWith(PROPOSED);
    vi.mocked(loadProposedBoundary).mockResolvedValue({
      status: 'ok',
      proposed: null,
    });
    await click(wrapper, 'Discard');
    expect(rejectBoundary).toHaveBeenCalledWith('b2');
    expect(wrapper.emitted('approved')).toBeUndefined();
    expect(labels(wrapper)).toEqual(['Replace boundary', 'Edit on map']);
  });

  it('shows a refusal from the database', async () => {
    vi.mocked(approveBoundary).mockResolvedValue(
      'Only a proposed boundary can be approved.'
    );
    const wrapper = await mountWith(PROPOSED);
    await click(wrapper, 'Approve');
    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Only a proposed boundary can be approved.'
    );
  });

  it('clears the outline when it closes', async () => {
    const wrapper = await mountWith(PROPOSED);
    wrapper.unmount();
    expect(usePlacesStore().boundaryPreview).toBeNull();
  });

  describe('Edit on map', () => {
    /** The edited shape, one point moved. */
    const MOVED: MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [30, -20],
            [30.2, -20],
            [30.1, -19.9],
            [30, -20],
          ],
        ],
      ],
    };

    /**
     * Open the edit on a boundary of at most 5,000 points.
     * @param wrapper - The mounted upload.
     */
    async function openEdit(wrapper: Awaited<ReturnType<typeof mountWith>>) {
      vi.mocked(loadCurrentBoundary).mockResolvedValue({
        status: 'ok',
        current: { boundaryId: 'b1', points: 4, shape: SHAPE },
      });
      await click(wrapper, 'Edit on map');
      // The map's draw tool writes the shape back as it opens.
      usePlacesStore().boundaryEdited = SHAPE;
      await flushPromises();
    }

    it('opens the current boundary in the draw tool', async () => {
      const wrapper = await mountWith(null);
      await openEdit(wrapper);
      const store = usePlacesStore();
      expect(store.boundaryEdit).toEqual(SHAPE);
      expect(store.boundaryPreview).toBeNull();
      expect(wrapper.text()).toContain('Editing boundary');
      expect(wrapper.text()).toContain('4 points.');
      expect(labels(wrapper)).toEqual(['Delete point', 'Submit', 'Cancel']);
      await click(wrapper, 'Delete point');
      expect(store.boundaryEditTrash).toBe(1);
    });

    it('says to upload a boundary of more than 5,000 points', async () => {
      vi.mocked(loadCurrentBoundary).mockResolvedValue({
        status: 'ok',
        current: { boundaryId: 'b1', points: 12345, shape: null },
      });
      const wrapper = await mountWith(null);
      await click(wrapper, 'Edit on map');
      expect(wrapper.text()).toContain(
        'This boundary has 12,345 points. Edit on map takes at most 5,000. Use Replace boundary instead.'
      );
      expect(labels(wrapper)).toEqual(['Replace boundary', 'Edit on map']);
      expect(usePlacesStore().boundaryEdit).toBeNull();
    });

    it('submits the edit with the boundary it came from', async () => {
      vi.mocked(submitBoundary).mockResolvedValue(null);
      const wrapper = await mountWith(null);
      await openEdit(wrapper);
      usePlacesStore().boundaryEdited = MOVED;
      await flushPromises();
      vi.mocked(loadProposedBoundary).mockResolvedValue({
        status: 'ok',
        proposed: { ...PROPOSED, derivedFrom: 'b1', submittedBy: null },
      });
      await click(wrapper, 'Submit');
      expect(submitBoundary).toHaveBeenCalledWith(placeId, MOVED, null, 'b1');
      expect(usePlacesStore().boundaryEdit).toBeNull();
      expect(wrapper.text()).toContain('Edited 28 Nov 2026.');
      expect(labels(wrapper)).toEqual(['Approve', 'Discard']);
    });

    it('keeps the edit open when the database refuses it', async () => {
      vi.mocked(submitBoundary).mockResolvedValue(
        'The shape is not valid: Self-intersection[30.1 -19.95]'
      );
      const wrapper = await mountWith(null);
      await openEdit(wrapper);
      await click(wrapper, 'Submit');
      expect(wrapper.find('[role="alert"]').text()).toBe(
        'The shape is not valid: Self-intersection[30.1 -19.95]'
      );
      expect(labels(wrapper)).toEqual(['Delete point', 'Submit', 'Cancel']);
      expect(usePlacesStore().boundaryEdit).toEqual(SHAPE);
    });

    it('drops the edit on Cancel, on another place, and on close', async () => {
      const wrapper = await mountWith(null);
      await openEdit(wrapper);
      await click(wrapper, 'Cancel');
      expect(usePlacesStore().boundaryEdit).toBeNull();
      expect(labels(wrapper)).toEqual(['Replace boundary', 'Edit on map']);

      await openEdit(wrapper);
      await wrapper.setProps({
        placeId: '55555555-5555-5555-5555-555555555555',
      });
      await flushPromises();
      expect(usePlacesStore().boundaryEdit).toBeNull();

      await openEdit(wrapper);
      wrapper.unmount();
      expect(usePlacesStore().boundaryEdit).toBeNull();
    });
  });
});
