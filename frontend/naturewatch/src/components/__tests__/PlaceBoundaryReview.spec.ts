import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PlaceBoundaryReview from '@/components/PlaceBoundaryReview.vue';
import {
  loadBoundaryReview,
  reviewBoundary,
  type BoundaryReview,
} from '@/places/boundaryReview';
import usePlacesStore from '@/store/PlacesStore';

vi.mock('@/places/boundaryReview', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/places/boundaryReview')>();
  return {
    ...actual,
    loadBoundaryReview: vi.fn(),
    reviewBoundary: vi.fn(),
  };
});

const placeId = '44444444-4444-4444-4444-444444444444';

const PIECES = {
  checkId: 'small_components',
  outcome: 'warn' as const,
  measuredValue: 0.64,
  thresholdUsed: 0.5,
  details: { parts: 129, small_parts: 82, part_km2: 0.01 },
  checkedAt: '2026-11-26T10:00:00Z',
};
const POINTS = {
  checkId: 'vertex_count',
  outcome: 'pass' as const,
  measuredValue: 7239,
  thresholdUsed: 100000,
  details: {},
  checkedAt: '2026-11-26T10:00:00Z',
};

/**
 * A boundary as the review reads it.
 * @param extra - Values to change.
 * @returns The review.
 */
function review(extra: Partial<BoundaryReview> = {}): BoundaryReview {
  return {
    boundaryId: 'b1',
    qcStatus: 'flagged',
    eligibility: 'pending',
    note: null,
    setBy: null,
    setAt: null,
    findings: [PIECES, POINTS],
    ...extra,
  };
}

/**
 * Mount the section on a place whose boundary reads as given.
 * @param read - The review, or null for no boundary.
 * @param hidden - Whether the place is hidden from the map.
 */
async function mountWith(read: BoundaryReview | null, hidden = false) {
  vi.mocked(loadBoundaryReview).mockResolvedValue({
    status: 'ok',
    review: read,
  });
  const wrapper = mount(PlaceBoundaryReview, { props: { placeId, hidden } });
  await flushPromises();
  return wrapper;
}

/**
 * The buttons' labels.
 * @param wrapper - The mounted section.
 */
function labels(wrapper: Awaited<ReturnType<typeof mountWith>>) {
  return wrapper.findAll('button').map(button => button.text());
}

/**
 * A button by its label.
 * @param wrapper - The mounted section.
 * @param text - The label.
 */
function button(wrapper: Awaited<ReturnType<typeof mountWith>>, text: string) {
  return wrapper.findAll('button').find(b => b.text() === text)!;
}

describe('Place boundary review', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(loadBoundaryReview).mockReset();
    vi.mocked(reviewBoundary).mockReset().mockResolvedValue(null);
  });

  it('shows the shape check in plain words and the three verdicts', async () => {
    const wrapper = await mountWith(review());
    expect(loadBoundaryReview).toHaveBeenCalledWith(placeId);
    expect(wrapper.text()).toContain('Not counted in Stats yet: not reviewed.');
    expect(wrapper.find('.is-warn').text()).toContain(
      'Many tiny pieces: 82 of 129 under 0.01 km²'
    );
    expect(wrapper.text()).toContain('7,239 points');
    expect(wrapper.text()).not.toMatch(/QC|warning|eligib|exclud|pending/i);
    expect(labels(wrapper)).toEqual([
      'Shape is right, count it',
      'Needs fixing',
      'Leave out of Stats',
    ]);
  });

  it('counts a shape the check warned about only with a note', async () => {
    const places = usePlacesStore();
    const wrapper = await mountWith(review());
    const count = button(wrapper, 'Shape is right, count it');
    expect(count.attributes('disabled')).toBeDefined();
    await wrapper.get('textarea').setValue('  Real islands  ');
    vi.mocked(loadBoundaryReview).mockResolvedValue({
      status: 'ok',
      review: review({
        qcStatus: 'accepted',
        eligibility: 'eligible',
        note: 'Real islands',
        setAt: '2026-11-27T09:00:00Z',
      }),
    });
    await count.trigger('click');
    await flushPromises();
    expect(reviewBoundary).toHaveBeenCalledWith('b1', 'count', 'Real islands');
    expect(places.adminListVersion).toBe(1);
    expect(wrapper.text()).toContain('Counted in Stats.');
    expect(wrapper.text()).toContain('Reviewed 27 Nov 2026.');
    expect(wrapper.text()).toContain('Real islands');
    expect(labels(wrapper)).toEqual(['Back to review']);
  });

  it('counts a passed shape without a note, and leaves out only with one', async () => {
    const wrapper = await mountWith(
      review({ qcStatus: 'passed', findings: [POINTS] })
    );
    expect(button(wrapper, 'Leave out of Stats').attributes('disabled')).toBe(
      ''
    );
    await button(wrapper, 'Shape is right, count it').trigger('click');
    await flushPromises();
    expect(reviewBoundary).toHaveBeenCalledWith('b1', 'count', null);
  });

  it('says why a place is not counted, once', async () => {
    const leftOut = review({
      eligibility: 'excluded',
      note: 'Duplicate of a park',
      setAt: '2026-11-27T09:00:00Z',
    });
    let wrapper = await mountWith(leftOut);
    expect(wrapper.text()).toContain(
      'Not counted in Stats: left out. Duplicate of a park'
    );
    expect(wrapper.text().match(/Duplicate of a park/g)).toHaveLength(1);

    wrapper = await mountWith(leftOut, true);
    expect(wrapper.text()).toContain('Not counted in Stats: hidden from map.');
    expect(wrapper.text()).toContain(
      'Left out of Stats. Reviewed 27 Nov 2026.'
    );
    expect(wrapper.text()).toContain('Duplicate of a park');

    wrapper = await mountWith(review({ qcStatus: 'rejected' }));
    expect(wrapper.text()).toContain(
      'Not counted in Stats: the shape needs fixing.'
    );
    expect(labels(wrapper)).toEqual(['Back to review']);

    wrapper = await mountWith(
      review({
        qcStatus: 'passed',
        eligibility: 'eligible',
        findings: [{ ...POINTS, outcome: 'warn', measuredValue: 412000 }],
      })
    );
    expect(wrapper.text()).toContain(
      'Counted in Stats, in a separate run: over 100,000 points.'
    );
  });

  it('marks a boundary for fixing, undoes it, and shows an error', async () => {
    const wrapper = await mountWith(review());
    await button(wrapper, 'Needs fixing').trigger('click');
    await flushPromises();
    expect(reviewBoundary).toHaveBeenCalledWith('b1', 'fix', null);

    vi.mocked(loadBoundaryReview).mockResolvedValue({
      status: 'ok',
      review: review({ qcStatus: 'rejected' }),
    });
    const again = await mountWith(review({ qcStatus: 'rejected' }));
    vi.mocked(reviewBoundary).mockResolvedValue('Nope.');
    await button(again, 'Back to review').trigger('click');
    await flushPromises();
    expect(reviewBoundary).toHaveBeenLastCalledWith('b1', 'undo', null);
    expect(again.get('[role="alert"]').text()).toBe('Nope.');
  });

  it('shows only the Stats line for a place without a boundary', async () => {
    const wrapper = await mountWith(null);
    expect(wrapper.text()).toBe('Not counted in Stats: no boundary.');
  });
});
