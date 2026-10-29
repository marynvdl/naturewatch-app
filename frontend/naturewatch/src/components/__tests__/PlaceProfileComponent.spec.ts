import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PlaceProfileComponent from '@/components/PlaceProfileComponent.vue';
import { loadPilotPlace, type PlaceDetail } from '@/places/api';

vi.mock('@/places/api', () => ({
  loadPilotPlace: vi.fn(),
}));

const placeId = '22222222-2222-2222-2222-222222222222';

const kruger: PlaceDetail = {
  id: placeId,
  name: 'Kruger National Park',
  designation: 'National Park',
  iso3: 'ZAF',
  areaKm2: 19485.2,
  siteId: '873',
  releaseMonth: '2026-10-01',
  sourceName: 'WDPCA',
  croplandKm2: 11.455618,
  percent: 0.0598,
};

/**
 * Mount the profile for one stored place.
 * @param place - What `loadPilotPlace` returns.
 * @returns The mounted profile, after the place has loaded.
 */
async function mountProfile(place: PlaceDetail) {
  vi.mocked(loadPilotPlace).mockResolvedValue({ status: 'ok', place });
  const wrapper = mount(PlaceProfileComponent, {
    props: { placeId: place.id, name: place.name },
  });
  await flushPromises();
  return wrapper;
}

/**
 * Open a profile tab by its label.
 * @param wrapper - The mounted profile.
 * @param label - The tab text.
 */
async function openTab(
  wrapper: Awaited<ReturnType<typeof mountProfile>>,
  label: string
) {
  const tab = wrapper
    .findAll('[role="tab"]')
    .find(item => item.text() === label);
  if (!tab) throw new Error(`Missing ${label}`);
  await tab.trigger('click');
}

describe('Place profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the stored name, country, designation, area, and source', async () => {
    const wrapper = await mountProfile(kruger);

    expect(loadPilotPlace).toHaveBeenCalledWith(placeId);
    expect(wrapper.get('h2').text()).toBe('Kruger National Park');
    expect(wrapper.get('.place-subtitle').text()).toBe(
      'South Africa · National Park'
    );
    expect(wrapper.get('.place-area').text()).toBe('19,485 km²');
    const tabs = wrapper.findAll('[role="tab"]').map(tab => tab.text());
    expect(tabs).toEqual(['Overview', 'Landscape', 'Species']);
    const overview = wrapper.get('[role="tabpanel"]').text();
    expect(overview).toContain('19,485.20 km²');
    const source = wrapper.get('.place-source').text();
    expect(source).toContain('WDPCA, October 2026.');
    expect(source).toContain('UNEP-WCMC and IUCN');
    expect(wrapper.text()).not.toMatch(/\bha\b|hectare/);
  });

  it('uses two decimals on the area tag below 100 km²', async () => {
    const wrapper = await mountProfile({ ...kruger, areaKm2: 15.284 });
    expect(wrapper.get('.place-area').text()).toBe('15.28 km²');
  });

  it('shows the stored cropland fact under Landscape', async () => {
    const wrapper = await mountProfile(kruger);
    await openTab(wrapper, 'Landscape');

    const panel = wrapper.get('[role="tabpanel"]').text();
    expect(panel).toContain('11.46 km²');
    expect(panel).toContain('0.1%');
    expect(panel).not.toContain('Cropland has not been calculated');
  });

  it('says cropland has not been calculated when no fact is stored', async () => {
    const wrapper = await mountProfile({
      ...kruger,
      croplandKm2: null,
      percent: null,
    });
    await openTab(wrapper, 'Landscape');

    expect(wrapper.get('[role="tabpanel"]').text()).toBe(
      'Cropland, 2024Cropland has not been calculated for this place.'
    );
  });

  it('says there is nothing to show under Species without claiming none live there', async () => {
    const wrapper = await mountProfile(kruger);
    await openTab(wrapper, 'Species');

    const panel = wrapper.get('[role="tabpanel"]').text();
    expect(panel).toBe('Oops, we have nothing to show you yet.');
    expect(panel.toLowerCase()).not.toMatch(/no species|none/);
  });

  it('asks to zoom and to close', async () => {
    const wrapper = await mountProfile(kruger);
    await wrapper.get('button.place-zoom').trigger('click');
    await wrapper.get('button[aria-label="Close place"]').trigger('click');
    expect(wrapper.emitted('zoom')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('says the place store is not configured', async () => {
    vi.mocked(loadPilotPlace).mockResolvedValue({ status: 'unconfigured' });
    const wrapper = mount(PlaceProfileComponent, {
      props: { placeId, name: 'Kruger National Park' },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('The place store is not configured.');
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false);
  });
});
