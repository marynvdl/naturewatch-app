import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PlaceBoundaryReview from '@/components/PlaceBoundaryReview.vue';
import {
  acceptBoundaryQc,
  loadBoundaryReview,
  setStatsEligibility,
  type BoundaryReview,
} from '@/places/boundaryReview';
import usePlacesStore from '@/store/PlacesStore';

vi.mock('@/places/boundaryReview', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/places/boundaryReview')>();
  return {
    ...actual,
    loadBoundaryReview: vi.fn(),
    acceptBoundaryQc: vi.fn(),
    setStatsEligibility: vi.fn(),
  };
});

const placeId = '44444444-4444-4444-4444-444444444444';

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
    reason: null,
    setBy: null,
    setAt: null,
    findings: [
      {
        checkId: 'small_components',
        outcome: 'warn',
        measuredValue: 0.7,
        thresholdUsed: 0.5,
        details: { parts: 600, small_parts: 412, part_km2: 0.01 },
        checkedAt: '2026-11-26T10:00:00Z',
      },
      {
        checkId: 'vertex_count',
        outcome: 'warn',
        measuredValue: 412000,
        thresholdUsed: 100000,
        details: {},
        checkedAt: '2026-11-26T10:00:00Z',
      },
    ],
    ...extra,
  };
}

/**
 * The buttons' labels.
 * @param wrapper - The mounted section.
 */
function labels(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').map(button => button.text());
}

/**
 * A button by its label.
 * @param wrapper - The mounted section.
 * @param text - The label.
 */
function button(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find(b => b.text() === text)!;
}

describe('Place boundary review', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(loadBoundaryReview).mockReset();
    vi.mocked(acceptBoundaryQc).mockReset().mockResolvedValue(null);
    vi.mocked(setStatsEligibility).mockReset().mockResolvedValue(null);
  });

  it('shows the findings of a flagged boundary and offers to accept them', async () => {
    vi.mocked(loadBoundaryReview).mockResolvedValue({
      status: 'ok',
      review: review(),
    });
    const wrapper = mount(PlaceBoundaryReview, { props: { placeId } });
    await flushPromises();
    expect(loadBoundaryReview).toHaveBeenCalledWith(placeId);
    expect(wrapper.text()).toContain(
      'Small parts: 412 of 600 parts under 0.01 km²'
    );
    expect(wrapper.text()).toContain(
      'Vertices: 412,000, over the cap of 100,000'
    );
    expect(wrapper.text()).toContain('Pending for Stats');
    expect(labels(wrapper)).toEqual(['Accept warnings', 'Excluded']);
  });

  it('accepts the warnings, then sets eligible with a reason', async () => {
    const places = usePlacesStore();
    vi.mocked(loadBoundaryReview)
      .mockResolvedValueOnce({ status: 'ok', review: review() })
      .mockResolvedValue({
        status: 'ok',
        review: review({ qcStatus: 'accepted' }),
      });
    const wrapper = mount(PlaceBoundaryReview, { props: { placeId } });
    await flushPromises();
    await button(wrapper, 'Accept warnings').trigger('click');
    await flushPromises();
    expect(acceptBoundaryQc).toHaveBeenCalledWith('b1');
    expect(places.adminListVersion).toBe(1);
    expect(labels(wrapper)).toEqual(['Eligible', 'Excluded']);

    // An accepted boundary needs a reason to become eligible.
    expect(button(wrapper, 'Eligible').attributes('disabled')).toBeDefined();
    await wrapper.get('textarea').setValue('  Real islands  ');
    await button(wrapper, 'Eligible').trigger('click');
    await flushPromises();
    expect(setStatsEligibility).toHaveBeenCalledWith(
      'b1',
      'eligible',
      'Real islands'
    );
    expect(places.adminListVersion).toBe(2);
  });

  it('makes a passed boundary eligible without a reason', async () => {
    vi.mocked(loadBoundaryReview).mockResolvedValue({
      status: 'ok',
      review: review({ qcStatus: 'passed' }),
    });
    const wrapper = mount(PlaceBoundaryReview, { props: { placeId } });
    await flushPromises();
    expect(button(wrapper, 'Excluded').attributes('disabled')).toBeDefined();
    await button(wrapper, 'Eligible').trigger('click');
    await flushPromises();
    expect(setStatsEligibility).toHaveBeenCalledWith('b1', 'eligible', null);
  });

  it('sets an excluded boundary back to pending, and shows an error', async () => {
    vi.mocked(loadBoundaryReview).mockResolvedValue({
      status: 'ok',
      review: review({
        qcStatus: 'passed',
        eligibility: 'excluded',
        reason: 'Duplicate of a park',
        setAt: '2026-11-27T09:00:00Z',
      }),
    });
    vi.mocked(setStatsEligibility).mockResolvedValue('Nope.');
    const wrapper = mount(PlaceBoundaryReview, { props: { placeId } });
    await flushPromises();
    expect(wrapper.text()).toContain('Excluded from Stats');
    expect(wrapper.text()).toContain('27 Nov 2026');
    expect(wrapper.text()).toContain('Duplicate of a park');
    expect(labels(wrapper)).toEqual(['Eligible', 'Back to pending']);
    await button(wrapper, 'Back to pending').trigger('click');
    await flushPromises();
    expect(setStatsEligibility).toHaveBeenCalledWith('b1', 'pending', null);
    expect(wrapper.get('[role="alert"]').text()).toBe('Nope.');
  });

  it('shows nothing for a place without a current boundary', async () => {
    vi.mocked(loadBoundaryReview).mockResolvedValue({
      status: 'ok',
      review: null,
    });
    const wrapper = mount(PlaceBoundaryReview, { props: { placeId } });
    await flushPromises();
    expect(wrapper.text()).toBe('');
  });
});
