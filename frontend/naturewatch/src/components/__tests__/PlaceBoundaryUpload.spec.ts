import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { MultiPolygon } from 'geojson';
import PlaceBoundaryUpload from '@/components/PlaceBoundaryUpload.vue';
import {
  approveBoundary,
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

  it('offers Replace boundary when nothing is proposed', async () => {
    const wrapper = await mountWith(null);
    expect(labels(wrapper)).toEqual(['Replace boundary']);
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
      'https://example.test'
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
    expect(labels(wrapper)).toEqual(['Replace boundary']);
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
    expect(labels(wrapper)).toEqual(['Replace boundary']);
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
    expect(labels(wrapper)).toEqual(['Replace boundary']);
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
});
