import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PlaceProfileComponent from '@/components/PlaceProfileComponent.vue';
import {
  curatePlace,
  loadPilotPlace,
  loadPlaceCuration,
  loadPlaceRecognitions,
  loadRecognisedPlaces,
  type PlaceDetail,
} from '@/places/api';
import { PHOTOS_NONE } from '@/places/photos';
import useAuthStore from '@/store/AuthStore';

vi.mock('@/places/api', async importOriginal => ({
  PLACE_TYPE: 'conservation_area',
  applyCuration: (await importOriginal<typeof import('@/places/api')>())
    .applyCuration,
  curatePlace: vi.fn(),
  loadDesignations: vi
    .fn()
    .mockResolvedValue(['National Park', 'Nature Reserve', 'Game Reserve']),
  loadPlaceCuration: vi.fn(),
  loadPilotPlace: vi.fn(),
  loadPlaceRecognitions: vi.fn(),
  loadRecognisedPlaces: vi.fn(),
}));

const placeId = '22222222-2222-2222-2222-222222222222';

const kruger: PlaceDetail = {
  id: placeId,
  name: 'Kruger National Park',
  placeTypeId: 'conservation_area',
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
  tagline: null,
  description: null,
  source: {
    name: 'Kruger National Park',
    designation: 'National Park',
    iso3: 'ZAF',
  },
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
    setActivePinia(createPinia());
    vi.mocked(loadPlaceRecognitions).mockResolvedValue({
      status: 'ok',
      recognitions: [],
    });
    vi.mocked(loadPlaceCuration).mockResolvedValue({
      status: 'ok',
      curation: null,
    });
  });

  it('shows the tagline under the title and the description in Overview', async () => {
    const wrapper = await mountProfile({
      ...kruger,
      tagline: 'Where the lowveld meets the Lebombo.',
      description: 'First paragraph.\n\nSecond\nline.',
    });
    expect(wrapper.get('.place-tagline').text()).toBe(
      'Where the lowveld meets the Lebombo.'
    );
    const paragraphs = wrapper.findAll('.place-description p');
    expect(paragraphs.map(item => item.text())).toEqual([
      'First paragraph.',
      'Second\nline.',
    ]);
    expect(wrapper.find('.edit-field-pencil').exists()).toBe(false);
  });

  it('shows no tagline or description when none is curated', async () => {
    const wrapper = await mountProfile(kruger);
    expect(wrapper.find('.place-tagline').exists()).toBe(false);
    expect(wrapper.find('.place-description').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('No tagline yet');
  });

  it('shows no pencils to an admin in view mode', async () => {
    const auth = useAuthStore();
    auth.isAdmin = true;
    const wrapper = await mountProfile(kruger);
    expect(wrapper.find('.edit-field-pencil').exists()).toBe(false);
    expect(loadPlaceCuration).not.toHaveBeenCalled();
  });

  describe('in edit mode', () => {
    beforeEach(() => {
      const auth = useAuthStore();
      auth.isAdmin = true;
      auth.editMode = true;
    });

    /** The edit field with this label. */
    function field(
      wrapper: Awaited<ReturnType<typeof mountProfile>>,
      label: string
    ) {
      return wrapper.get(`[data-field="${label}"]`);
    }

    it('shows a pencil on each of the five fields', async () => {
      const wrapper = await mountProfile(kruger);
      expect(loadPlaceCuration).toHaveBeenCalledWith(placeId);
      const labels = wrapper
        .findAll('.edit-field-pencil')
        .map(item => item.attributes('aria-label'));
      expect(labels).toEqual([
        'Edit display name',
        'Edit tagline',
        'Edit description',
        'Edit designation',
        'Edit countries',
      ]);
    });

    it('saves a tagline and shows it', async () => {
      vi.mocked(curatePlace).mockResolvedValue({
        status: 'ok',
        curation: {
          display_name: null,
          tagline: 'A new line.',
          description: null,
          designation: null,
          iso3: null,
        },
      });
      const wrapper = await mountProfile(kruger);
      await field(wrapper, 'Tagline')
        .get('.edit-field-pencil')
        .trigger('click');
      await field(wrapper, 'Tagline').get('input').setValue('A new line.');
      await field(wrapper, 'Tagline').get('form').trigger('submit');
      await flushPromises();
      expect(curatePlace).toHaveBeenCalledWith(placeId, {
        tagline: 'A new line.',
      });
      expect(field(wrapper, 'Tagline').find('form').exists()).toBe(false);
      expect(wrapper.get('.place-tagline').text()).toBe('A new line.');
    });

    it('keeps the field open with the error when a save fails', async () => {
      vi.mocked(curatePlace).mockResolvedValue({
        status: 'error',
        message: 'Only an admin can curate a place.',
      });
      const wrapper = await mountProfile(kruger);
      await field(wrapper, 'Designation')
        .get('.edit-field-pencil')
        .trigger('click');
      await field(wrapper, 'Designation').get('input').setValue('Reserve');
      await flushPromises();
      // Suggestions open while typing. New text is still allowed.
      expect(field(wrapper, 'Designation').text()).toContain('Nature Reserve');
      await field(wrapper, 'Designation').get('form').trigger('submit');
      await flushPromises();
      expect(field(wrapper, 'Designation').get('[role="alert"]').text()).toBe(
        'Only an admin can curate a place.'
      );
    });

    it('cancels without saving', async () => {
      const wrapper = await mountProfile(kruger);
      await field(wrapper, 'Display name')
        .get('.edit-field-pencil')
        .trigger('click');
      expect(
        (
          field(wrapper, 'Display name').get('input')
            .element as HTMLInputElement
        ).value
      ).toBe('Kruger National Park');
      expect(field(wrapper, 'Display name').text()).toContain(
        'Source: Kruger National Park'
      );
      const cancel = field(wrapper, 'Display name')
        .findAll('button')
        .find(item => item.text() === 'Cancel');
      await cancel?.trigger('click');
      expect(curatePlace).not.toHaveBeenCalled();
      expect(wrapper.get('h2').text()).toBe('Kruger National Park');
    });

    it('resets a curated name to the source', async () => {
      vi.mocked(loadPlaceCuration).mockResolvedValue({
        status: 'ok',
        curation: {
          display_name: 'Kruger',
          tagline: null,
          description: null,
          designation: null,
          iso3: null,
        },
      });
      vi.mocked(curatePlace).mockResolvedValue({
        status: 'ok',
        curation: null,
      });
      const wrapper = await mountProfile({ ...kruger, name: 'Kruger' });
      await field(wrapper, 'Display name')
        .get('.edit-field-pencil')
        .trigger('click');
      const reset = field(wrapper, 'Display name')
        .findAll('button')
        .find(item => item.text() === 'Reset to source');
      await reset?.trigger('click');
      await flushPromises();
      expect(curatePlace).toHaveBeenCalledWith(placeId, { display_name: null });
      expect(wrapper.get('h2').text()).toBe('Kruger National Park');
    });

    it('saves countries as codes', async () => {
      vi.mocked(curatePlace).mockResolvedValue({
        status: 'ok',
        curation: {
          display_name: null,
          tagline: null,
          description: null,
          designation: null,
          iso3: [],
        },
      });
      const wrapper = await mountProfile({
        ...kruger,
        iso3: 'LSO;ZAF',
        source: { ...kruger.source, iso3: 'LSO;ZAF' },
      });
      await field(wrapper, 'Countries')
        .get('.edit-field-pencil')
        .trigger('click');
      await field(wrapper, 'Countries')
        .get('button[aria-label="Remove Lesotho"]')
        .trigger('click');
      await field(wrapper, 'Countries').get('form').trigger('submit');
      await flushPromises();
      expect(curatePlace).toHaveBeenCalledWith(placeId, { iso3: ['ZAF'] });
    });
  });

  it('shows confirmed recognitions as badges that open them', async () => {
    const heritageId = '66666666-6666-6666-6666-666666666666';
    vi.mocked(loadPlaceRecognitions).mockResolvedValue({
      status: 'ok',
      recognitions: [
        {
          id: heritageId,
          name: 'Kruger to Canyons',
          placeTypeId: 'biosphere_reserve',
        },
        {
          id: '55555555-5555-5555-5555-555555555555',
          name: 'Nylsvley Nature Reserve',
          placeTypeId: 'ramsar_site',
        },
      ],
    });
    const wrapper = await mountProfile(kruger);

    expect(loadPlaceRecognitions).toHaveBeenCalledWith(placeId);
    const badges = wrapper.findAll('.place-recognition');
    expect(badges.map(badge => badge.text())).toEqual(['UNESCO-MAB', 'Ramsar']);
    expect(badges[0].attributes('title')).toBe('Kruger to Canyons');
    expect(badges[1].attributes('aria-label')).toBe(
      'Ramsar: Nylsvley Nature Reserve'
    );
    expect(loadRecognisedPlaces).not.toHaveBeenCalled();
    expect(
      badges[0].get('.place-recognition-dot').attributes('style')
    ).toContain('background-color: rgb(122, 74, 156)');
    await badges[0].trigger('click');
    expect(wrapper.emitted('open')).toEqual([[heritageId]]);
  });

  it('shows each country of a transboundary place as a tag', async () => {
    const wrapper = await mountProfile({ ...kruger, iso3: 'LSO;ZAF' });
    // Tags in the Overview table, not under the title
    const tags = wrapper.findAll('[role="tabpanel"] .place-country');
    expect(tags.map(tag => tag.text())).toEqual(['Lesotho', 'South Africa']);
    expect(wrapper.get('[role="tabpanel"]').text()).toContain('Countries');
    expect(wrapper.findAll('.place-meta .place-country')).toHaveLength(0);
  });

  it('lists the conservation areas a recognition recognises as cards', async () => {
    const parks = Array.from({ length: 23 }, (_, index) => ({
      id: `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
      name: `Park ${index + 1}`,
      designation: 'Nature Reserve',
      iso3: 'ZAF',
      area_km2: 1000 - index,
      cropland_percent: null,
    }));
    vi.mocked(loadRecognisedPlaces).mockResolvedValue({
      status: 'ok',
      places: parks,
    });
    const wrapper = await mountProfile({
      ...kruger,
      placeTypeId: 'world_heritage_site',
      name: 'Maloti-Drakensberg Park',
    });

    expect(loadPlaceRecognitions).not.toHaveBeenCalled();
    expect(loadRecognisedPlaces).toHaveBeenCalledWith(placeId);
    expect(wrapper.find('.place-recognitions').exists()).toBe(false);
    expect(wrapper.find('.place-recognised').exists()).toBe(false);
    const tabs = wrapper.findAll('[role="tab"]').map(tab => tab.text());
    expect(tabs).toEqual(['Overview', 'Areas', 'Landscape', 'Species']);
    await openTab(wrapper, 'Areas');
    expect(wrapper.get('.place-profile').classes()).toContain('is-list-tab');
    expect(wrapper.get('.place-recognised-count').text()).toBe(
      '23 conservation areas at least 75% inside'
    );
    const section = wrapper.get('.place-recognised');
    expect(section.findAll('.place-result')).toHaveLength(20);
    expect(section.find('.place-thumb').exists()).toBe(true);

    await section.get('.place-recognised-more').trigger('click');
    expect(section.findAll('.place-result')).toHaveLength(23);
    expect(section.find('.place-recognised-more').exists()).toBe(false);

    await section.findAll('.place-result')[0].trigger('click');
    expect(wrapper.emitted('open')).toEqual([[parks[0].id]]);
    // The map draws the listed areas only while the tab is open
    expect(wrapper.emitted('areas')?.at(-1)).toEqual([
      parks.map(park => park.id),
    ]);
    await openTab(wrapper, 'Overview');
    expect(wrapper.emitted('areas')?.at(-1)).toEqual([null]);
    wrapper.unmount();
  });

  it('shows no Edit/View toggle to a visitor', async () => {
    const wrapper = await mountProfile(kruger);
    expect(wrapper.find('[aria-label="Profile mode"]').exists()).toBe(false);
  });

  it('lets an admin switch the profile to edit mode', async () => {
    const auth = useAuthStore();
    auth.isAdmin = true;
    const wrapper = await mountProfile(kruger);
    const toggle = wrapper.find('[aria-label="Profile mode"]');
    expect(toggle.exists()).toBe(true);
    const edit = toggle
      .findAll('button')
      .find(button => button.text() === 'Edit');
    if (!edit) throw new Error('Missing Edit');
    await edit.trigger('click');
    expect(auth.editMode).toBe(true);
  });

  it('shows no badges for a place without recognitions', async () => {
    const wrapper = await mountProfile(kruger);
    expect(wrapper.find('.place-recognitions').exists()).toBe(false);
  });

  it('says when no conservation area is linked to a recognition', async () => {
    vi.mocked(loadRecognisedPlaces).mockResolvedValue({
      status: 'ok',
      places: [],
    });
    const wrapper = await mountProfile({
      ...kruger,
      placeTypeId: 'ramsar_site',
    });
    await openTab(wrapper, 'Areas');
    expect(wrapper.get('[role="tabpanel"]').text()).toBe(
      'No conservation area lies at least 75% inside this recognition.'
    );
  });

  it('shows the stored name, country, designation, area, and source', async () => {
    const wrapper = await mountProfile(kruger);

    expect(loadPilotPlace).toHaveBeenCalledWith(placeId);
    expect(wrapper.get('h2').text()).toBe('Kruger National Park');
    expect(wrapper.get('.place-subtitle').text()).toBe(
      'South Africa · National Park'
    );
    expect(wrapper.findAll('.place-country').map(tag => tag.text())).toEqual([
      'South Africa',
    ]);
    expect(wrapper.get('.place-area').text()).toBe('19,485 km²');
    const tabs = wrapper.findAll('[role="tab"]').map(tab => tab.text());
    expect(tabs).toEqual(['Overview', 'Landscape', 'Species']);
    const overview = wrapper.get('[role="tabpanel"]').text();
    expect(overview).toContain('19,485.20 km²');
    const source = wrapper.get('.place-source').text();
    expect(source).toBe(kruger.citation);
    expect(source).toContain('(WDPCA) [On-line], October 2026');
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

  it('shows the empty photograph state, and keeps the placeholder', async () => {
    const wrapper = await mountProfile(kruger);

    expect(wrapper.get('.place-photo-empty').text()).toBe(PHOTOS_NONE);
    expect(wrapper.find('.place-photo-icon').exists()).toBe(true);
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('button.place-photo').exists()).toBe(false);
  });

  it('asks to zoom and to close', async () => {
    const wrapper = await mountProfile(kruger);
    await wrapper.get('button.place-zoom').trigger('click');
    await wrapper.get('button[aria-label="Close place"]').trigger('click');
    expect(wrapper.emitted('zoom')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('says when a merged place opened the place it was merged into', async () => {
    const mergedId = '33333333-3333-3333-3333-333333333333';
    vi.mocked(loadPilotPlace).mockResolvedValue({
      status: 'ok',
      place: kruger,
    });
    const wrapper = mount(PlaceProfileComponent, {
      props: { placeId: mergedId },
    });
    await flushPromises();

    expect(loadPilotPlace).toHaveBeenCalledWith(mergedId);
    expect(wrapper.get('h2').text()).toBe('Kruger National Park');
    expect(wrapper.emitted('moved')).toEqual([[placeId]]);
  });

  it('does not say moved for the place asked for', async () => {
    const wrapper = await mountProfile(kruger);
    expect(wrapper.emitted('moved')).toBeUndefined();
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
