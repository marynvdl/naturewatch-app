import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MapSetChips from '@/components/MapSetChips.vue';
import usePlacesStore from '@/store/PlacesStore';

describe('MapSetChips', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('shows nothing without a set', () => {
    const wrapper = mount(MapSetChips);
    expect(wrapper.find('.map-set-chips').exists()).toBe(false);
  });

  it('pins, unpins, and removes a set', async () => {
    const store = usePlacesStore();
    store.selectPlace('eco');
    store.showRelated('eco', 'Atlantic mixed forests', ['park1']);
    const wrapper = mount(MapSetChips);
    const chip = wrapper.get('.map-set-chip');
    expect(chip.text()).toContain('Related to Atlantic mixed forests');
    expect(chip.classes()).not.toContain('is-on');

    await wrapper
      .get('[aria-label="Pin Related to Atlantic mixed forests"]')
      .trigger('click');
    expect(store.mapSets[0].pinned).toBe(true);
    expect(wrapper.get('.map-set-chip').classes()).toContain('is-on');

    await wrapper
      .get('[aria-label="Unpin Related to Atlantic mixed forests"]')
      .trigger('click');
    expect(store.mapSets[0].pinned).toBe(false);

    await wrapper
      .get('[aria-label="Remove Related to Atlantic mixed forests"]')
      .trigger('click');
    expect(store.mapSets).toEqual([]);
  });
});
