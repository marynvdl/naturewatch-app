import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PlaceStatusEditor from '@/components/PlaceStatusEditor.vue';
import {
  loadPlaceStatus,
  setPlaceAttention,
  setPlaceWithdrawn,
  type PlaceStatus,
} from '@/places/status';
import { loadWithdrawnPlaceIds } from '@/places/api';
import usePlacesStore from '@/store/PlacesStore';

vi.mock('@/places/status', async importOriginal => {
  const actual = await importOriginal<typeof import('@/places/status')>();
  return {
    ...actual,
    loadPlaceStatus: vi.fn(),
    setPlaceWithdrawn: vi.fn(),
    setPlaceAttention: vi.fn(),
  };
});

vi.mock('@/places/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/places/api')>();
  return { ...actual, loadWithdrawnPlaceIds: vi.fn() };
});

const placeId = '33333333-3333-3333-3333-333333333333';

const PUBLISHED: PlaceStatus = {
  withdrawn: false,
  withdrawalReason: null,
  withdrawalNote: null,
  attentionReason: null,
  attentionNote: null,
};

/**
 * Mount the Status tab.
 * @param placeStatus - The status the profile read.
 * @returns The mounted tab.
 */
function mountEditor(placeStatus: PlaceStatus = PUBLISHED) {
  return mount(PlaceStatusEditor, { props: { placeId, placeStatus } });
}

/**
 * A button by its text, within one form.
 * @param wrapper - The mounted tab.
 * @param form - The form's index: 0 withdraw, 1 attention.
 * @param text - The button's text.
 */
function button(
  wrapper: ReturnType<typeof mountEditor>,
  form: number,
  text: string
) {
  const found = wrapper
    .findAll('.status-form')
    [form].findAll('button')
    .find(item => item.text() === text);
  if (!found) throw new Error(`No ${text} button`);
  return found;
}

describe('Place status editor', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(setPlaceWithdrawn).mockReset().mockResolvedValue(null);
    vi.mocked(setPlaceAttention).mockReset().mockResolvedValue(null);
    vi.mocked(loadPlaceStatus).mockReset();
    vi.mocked(loadWithdrawnPlaceIds).mockResolvedValue({
      status: 'ok',
      ids: [placeId],
    });
  });

  it('withdraws a place only once a reason is chosen, and hides it on the map', async () => {
    const withdrawn: PlaceStatus = {
      ...PUBLISHED,
      withdrawn: true,
      withdrawalReason: 'captured_by_other_places',
      withdrawalNote: 'Inside Kruger.',
    };
    vi.mocked(loadPlaceStatus).mockResolvedValue({
      status: 'ok',
      placeStatus: withdrawn,
    });
    const store = usePlacesStore();
    const wrapper = mountEditor();
    const withdraw = button(wrapper, 0, 'Withdraw');
    expect(withdraw.attributes('disabled')).toBeDefined();

    await wrapper
      .get('select[name="withdrawal-reason"]')
      .setValue('captured_by_other_places');
    await wrapper
      .get('textarea[name="withdrawal-note"]')
      .setValue('  Inside Kruger. ');
    await button(wrapper, 0, 'Withdraw').trigger('click');
    await flushPromises();

    expect(setPlaceWithdrawn).toHaveBeenCalledWith(
      placeId,
      'captured_by_other_places',
      'Inside Kruger.'
    );
    expect(wrapper.emitted('changed')).toEqual([[withdrawn]]);
    expect(store.withdrawnIds).toEqual([placeId]);
    expect(store.adminListVersion).toBe(1);
  });

  it('restores a withdrawn place', async () => {
    vi.mocked(loadPlaceStatus).mockResolvedValue({
      status: 'ok',
      placeStatus: PUBLISHED,
    });
    const wrapper = mountEditor({
      ...PUBLISHED,
      withdrawn: true,
      withdrawalReason: 'not_a_place',
    });
    expect(wrapper.text()).toContain('Withdrawn. Visitors do not see');
    expect(
      (
        wrapper.get('select[name="withdrawal-reason"]')
          .element as HTMLSelectElement
      ).value
    ).toBe('not_a_place');
    await button(wrapper, 0, 'Restore').trigger('click');
    await flushPromises();
    expect(setPlaceWithdrawn).toHaveBeenCalledWith(placeId, null);
    expect(wrapper.emitted('changed')).toEqual([[PUBLISHED]]);
  });

  it('flags a place and clears the flag', async () => {
    const flagged: PlaceStatus = {
      ...PUBLISHED,
      attentionReason: 'boundary_wrong',
    };
    vi.mocked(loadPlaceStatus).mockResolvedValue({
      status: 'ok',
      placeStatus: flagged,
    });
    const wrapper = mountEditor();
    await wrapper
      .get('select[name="attention-reason"]')
      .setValue('boundary_wrong');
    await button(wrapper, 1, 'Flag').trigger('click');
    await flushPromises();
    expect(setPlaceAttention).toHaveBeenCalledWith(
      placeId,
      'boundary_wrong',
      null
    );
    expect(setPlaceWithdrawn).not.toHaveBeenCalled();
    await wrapper.setProps({ placeStatus: flagged });

    vi.mocked(loadPlaceStatus).mockResolvedValue({
      status: 'ok',
      placeStatus: PUBLISHED,
    });
    await button(wrapper, 1, 'Clear').trigger('click');
    await flushPromises();
    expect(setPlaceAttention).toHaveBeenLastCalledWith(placeId, null);
  });

  it('shows why a change failed', async () => {
    vi.mocked(setPlaceAttention).mockResolvedValue(
      'Only an admin can flag a place.'
    );
    const wrapper = mountEditor();
    await wrapper.get('select[name="attention-reason"]').setValue('other');
    await button(wrapper, 1, 'Flag').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Only an admin can flag a place.'
    );
    expect(wrapper.emitted('changed')).toBeUndefined();
  });
});
