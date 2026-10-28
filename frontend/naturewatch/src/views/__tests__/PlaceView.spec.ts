import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import PlaceView from '@/views/PlaceView.vue';
import { loadPilotPlace } from '@/places/api';

vi.mock('@/places/api', () => ({
  loadPilotPlace: vi.fn(),
}));

const placeId = '11111111-1111-1111-1111-111111111111';

describe('Place view', () => {
  it('shows the name, stored cropland figure, release month, and Protected Planet link', async () => {
    vi.mocked(loadPilotPlace).mockResolvedValue({
      status: 'ok',
      place: {
        id: placeId,
        name: 'Kruger National Park',
        siteId: '873',
        releaseMonth: '2026-10-01',
        sourceName: 'WDPCA',
        croplandKm2: 11.455618,
        percent: 0.0598,
      },
    });

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'Home', component: { template: '<div />' } },
        { path: '/places', name: 'Places', component: { template: '<div />' } },
        { path: '/places/:id', name: 'Place', component: PlaceView },
      ],
    });
    await router.push(`/places/${placeId}`);

    const wrapper = mount(PlaceView, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Kruger National Park');
    expect(wrapper.text()).toContain('11.46 km²');
    expect(wrapper.text()).toContain('0.1%');
    expect(wrapper.text()).toContain('October 2026');
    expect(wrapper.text()).toContain('WDPCA');
    expect(wrapper.text()).toContain('UNEP-WCMC and IUCN');
    const link = wrapper.get('a[href="https://www.protectedplanet.net/873"]');
    expect(link.text()).toContain('Protected Planet');
    expect(loadPilotPlace).toHaveBeenCalledWith(placeId);
  });
});
