import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PlaceStatusEditor from '@/components/PlaceStatusEditor.vue';
import {
  loadPlaceStatus,
  loadStatusReasons,
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
    loadStatusReasons: vi.fn(),
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
    // jsdom has no scrollIntoView, which the suggestion list calls
    Element.prototype.scrollIntoView = vi.fn();
    vi.mocked(setPlaceWithdrawn).mockReset().mockResolvedValue(null);
    vi.mocked(setPlaceAttention).mockReset().mockResolvedValue(null);
    vi.mocked(loadPlaceStatus).mockReset();
    vi.mocked(loadStatusReasons).mockImplementation(async kind =>
      kind === 'withdrawal'
        ? ['Inside a bigger park', 'Already captured by other places']
        : ['Boundary looks wrong']
    );
    vi.mocked(loadWithdrawnPlaceIds).mockResolvedValue({
      status: 'ok',
      ids: [placeId],
    });
  });

  it('withdraws a place only once a reason is chosen, and hides it on the map', async () => {
    const withdrawn: PlaceStatus = {
      ...PUBLISHED,
      withdrawn: true,
      withdrawalReason: 'Already captured by other places',
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
      .get('input[name="withdrawal-reason"]')
      .setValue('Already captured by other places');
    await wrapper
      .get('textarea[name="withdrawal-note"]')
      .setValue('  Inside Kruger. ');
    await button(wrapper, 0, 'Withdraw').trigger('click');
    await flushPromises();

    expect(setPlaceWithdrawn).toHaveBeenCalledWith(
      placeId,
      'Already captured by other places',
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
      withdrawalReason: 'Not a place',
    });
    expect(wrapper.text()).toContain('Withdrawn. Visitors do not see');
    expect(
      (
        wrapper.get('input[name="withdrawal-reason"]')
          .element as HTMLSelectElement
      ).value
    ).toBe('Not a place');
    await button(wrapper, 0, 'Restore').trigger('click');
    await flushPromises();
    expect(setPlaceWithdrawn).toHaveBeenCalledWith(placeId, null);
    expect(wrapper.emitted('changed')).toEqual([[PUBLISHED]]);
  });

  it('flags a place and clears the flag', async () => {
    const flagged: PlaceStatus = {
      ...PUBLISHED,
      attentionReason: 'Boundary looks wrong',
    };
    vi.mocked(loadPlaceStatus).mockResolvedValue({
      status: 'ok',
      placeStatus: flagged,
    });
    const wrapper = mountEditor();
    await wrapper
      .get('input[name="attention-reason"]')
      .setValue('Boundary looks wrong');
    await button(wrapper, 1, 'Flag').trigger('click');
    await flushPromises();
    expect(setPlaceAttention).toHaveBeenCalledWith(
      placeId,
      'Boundary looks wrong',
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

  it('suggests the reasons in use on focus, and takes a new one typed', async () => {
    const wrapper = mount(PlaceStatusEditor, {
      props: { placeId, placeStatus: PUBLISHED },
      attachTo: document.body,
    });
    await flushPromises();
    expect(loadStatusReasons).toHaveBeenCalledWith('withdrawal');
    expect(loadStatusReasons).toHaveBeenCalledWith('attention');
    const input = wrapper.get('input[name="withdrawal-reason"]');
    await input.trigger('focus');
    await flushPromises();
    const items = [...document.querySelectorAll('.suggest-item')].map(item =>
      item.textContent?.trim()
    );
    expect(items).toEqual([
      'Inside a bigger park',
      'Already captured by other places',
    ]);

    vi.mocked(loadPlaceStatus).mockResolvedValue({
      status: 'ok',
      placeStatus: PUBLISHED,
    });
    vi.mocked(loadStatusReasons).mockClear();
    await input.setValue('  Merged into its neighbour ');
    await button(wrapper, 0, 'Withdraw').trigger('click');
    await flushPromises();
    expect(setPlaceWithdrawn).toHaveBeenCalledWith(
      placeId,
      'Merged into its neighbour',
      null
    );
    // The reasons are read again after a change
    expect(loadStatusReasons).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('takes a suggested reason chosen with a slow press', async () => {
    vi.useFakeTimers();
    const wrapper = mount(PlaceStatusEditor, {
      props: { placeId, placeStatus: PUBLISHED },
      attachTo: document.body,
    });
    await flushPromises();
    const input = wrapper.get('input[name="withdrawal-reason"]');
    (input.element as HTMLInputElement).focus();
    await input.trigger('focus');
    await flushPromises();
    const item = [...document.querySelectorAll('.suggest-item')].find(
      element => element.textContent?.trim() === 'Inside a bigger park'
    ) as HTMLElement;

    // The press must not take focus from the field
    const press = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    item.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    vi.advanceTimersByTime(400);
    await flushPromises();
    item.click();
    await flushPromises();

    expect((input.element as HTMLInputElement).value).toBe(
      'Inside a bigger park'
    );
    expect(
      button(wrapper, 0, 'Withdraw').attributes('disabled')
    ).toBeUndefined();
    vi.useRealTimers();
    wrapper.unmount();
  });

  it('shows why a change failed', async () => {
    vi.mocked(setPlaceAttention).mockResolvedValue(
      'Only an admin can flag a place.'
    );
    const wrapper = mountEditor();
    await wrapper.get('input[name="attention-reason"]').setValue('Other');
    await button(wrapper, 1, 'Flag').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Only an admin can flag a place.'
    );
    expect(wrapper.emitted('changed')).toBeUndefined();
  });
});
