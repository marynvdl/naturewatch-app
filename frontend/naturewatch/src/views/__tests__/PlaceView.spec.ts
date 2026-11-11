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
        designation: 'National Park',
        iso3: 'ZAF',
        areaKm2: 19485.2,
        siteId: '873',
        releaseMonth: '2026-10-01',
        sourceName: 'World Database on Protected and Conserved Areas',
        citation:
          'UNEP-WCMC and IUCN (2026), Protected Planet: The World Database on Protected and Conserved Areas (WDPCA) [On-line], October 2026, Cambridge, UK: UNEP-WCMC and IUCN. Available at: www.protectedplanet.net.',
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

  it('moves the address of a merged place to the place it was merged into', async () => {
    const mergedId = '22222222-2222-2222-2222-222222222222';
    vi.mocked(loadPilotPlace).mockResolvedValue({
      status: 'ok',
      place: {
        id: placeId,
        name: 'Gobiin ikh',
        designation: 'Strictly Protected Area',
        iso3: 'MNG',
        areaKm2: 63884.6,
        siteId: '798',
        releaseMonth: '2026-10-01',
        sourceName: 'World Database on Protected and Conserved Areas',
        citation: 'UNEP-WCMC and IUCN (2026)',
        croplandKm2: null,
        percent: null,
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
    await router.push(`/places/${mergedId}`);

    const wrapper = mount(PlaceView, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(loadPilotPlace).toHaveBeenCalledWith(mergedId);
    expect(wrapper.text()).toContain('Gobiin ikh');
    expect(router.currentRoute.value.params.id).toBe(placeId);
  });
});
