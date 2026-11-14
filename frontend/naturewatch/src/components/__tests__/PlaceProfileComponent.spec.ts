import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PlaceProfileComponent from '@/components/PlaceProfileComponent.vue';
import {
  curatePlace,
  loadPilotPlace,
  loadPlaceCuration,
  loadPlaceRecognitions,
  loadPlaceLinks,
  loadRelatedPlaces,
  searchPlaces,
  setPlaceRelationship,
  type PlaceDetail,
  type PlaceLink,
} from '@/places/api';
import { PHOTOS_NONE } from '@/places/photos';
import useAuthStore from '@/store/AuthStore';

vi.mock('@/places/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/places/api')>();
  return {
    PLACE_TYPE: 'conservation_area',
    LINK_CHOICES: actual.LINK_CHOICES,
    linkLabel: actual.linkLabel,
    applyCuration: actual.applyCuration,
    curatePlace: vi.fn(),
    loadDesignations: vi
      .fn()
      .mockResolvedValue(['National Park', 'Nature Reserve', 'Game Reserve']),
    loadPlaceCuration: vi.fn(),
    loadPilotPlace: vi.fn(),
    loadPlaceRecognitions: vi.fn(),
    loadPlaceLinks: vi.fn(),
    loadRelatedPlaces: vi.fn(),
    searchPlaces: vi.fn(),
    setPlaceRelationship: vi.fn(),
  };
});

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
 * @param attach - Mount in the document, for popovers rendered outside the profile.
 * @returns The mounted profile, after the place has loaded.
 */
async function mountProfile(place: PlaceDetail, attach = false) {
  vi.mocked(loadPilotPlace).mockResolvedValue({ status: 'ok', place });
  const wrapper = mount(PlaceProfileComponent, {
    props: { placeId: place.id, name: place.name },
    attachTo: attach ? document.body : undefined,
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
    vi.mocked(loadRelatedPlaces).mockResolvedValue({ status: 'ok', links: [] });
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

  describe('links', () => {
    const siteId = '77777777-7777-7777-7777-777777777777';
    const parkId = '88888888-8888-8888-8888-888888888888';

    /** A link from Kruger's side. */
    function link(values: Partial<PlaceLink>): PlaceLink {
      return {
        id: '99999999-9999-9999-9999-999999999999',
        typeId: 'recognises',
        outward: false,
        otherId: siteId,
        otherName: 'Kruger to Canyons',
        otherTypeId: 'biosphere_reserve',
        otherIso3: 'ZAF',
        otherAreaKm2: 26000,
        origin: 'derived',
        status: 'proposed',
        coverage: 0.62,
        ...values,
      };
    }

    /** Switch to edit mode and open the Links tab. */
    async function openLinks(attach = false) {
      const auth = useAuthStore();
      auth.isAdmin = true;
      auth.editMode = true;
      const wrapper = await mountProfile(kruger, attach);
      await openTab(wrapper, 'Links');
      await flushPromises();
      return wrapper;
    }

    beforeEach(() => {
      // jsdom has no scrollIntoView, which the combobox calls
      Element.prototype.scrollIntoView = vi.fn();
      vi.mocked(setPlaceRelationship).mockResolvedValue({ status: 'ok' });
    });

    it('groups related places by relationship as cards with a type label', async () => {
      const parks = Array.from({ length: 23 }, (_, index) =>
        link({
          id: `p${index}`,
          typeId: 'overlaps',
          outward: true,
          otherId: `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
          otherName: `Park ${index + 1}`,
          otherTypeId: 'conservation_area',
          otherAreaKm2: 1000 - index,
          status: 'confirmed',
          coverage: null,
        })
      );
      vi.mocked(loadRelatedPlaces).mockResolvedValue({
        status: 'ok',
        links: [
          ...parks,
          link({ id: 's', status: 'confirmed' }),
          link({
            id: 'c',
            typeId: 'located_in',
            outward: false,
            otherId: parkId,
            otherName: 'Makuleke Contract Park',
            otherTypeId: 'conservation_area',
            status: 'confirmed',
          }),
        ],
      });
      const wrapper = await mountProfile(kruger);
      expect(loadRelatedPlaces).toHaveBeenCalledWith(placeId);
      const tabs = wrapper.findAll('[role="tab"]').map(tab => tab.text());
      expect(tabs).toEqual(['Overview', 'Related', 'Landscape', 'Species']);
      expect(wrapper.find('.place-related').exists()).toBe(false);
      await openTab(wrapper, 'Related');
      expect(wrapper.get('.place-profile').classes()).toContain('is-list-tab');

      const groups = wrapper.findAll('.place-related-group');
      expect(groups.map(group => group.attributes('aria-label'))).toEqual([
        'Recognised by',
        'Contains',
        'Overlaps',
      ]);
      expect(groups[0].get('.place-card-type').text()).toBe('UNESCO-MAB');
      expect(groups[1].get('.place-card-type').text()).toBe(
        'Conservation area'
      );
      expect(groups[2].get('.place-related-heading').text()).toBe(
        'Overlaps 23'
      );
      expect(groups[2].findAll('.place-result')).toHaveLength(20);
      await groups[2].get('.place-related-more').trigger('click');
      expect(groups[2].findAll('.place-result')).toHaveLength(23);
      expect(groups[2].find('.place-related-more').exists()).toBe(false);

      await groups[1].get('.place-result').trigger('click');
      expect(wrapper.emitted('open')).toEqual([[parkId]]);
      // The map draws the listed conservation areas only while the tab is open
      expect(wrapper.emitted('areas')?.at(-1)).toEqual([
        [...parks.map(park => park.otherId), parkId],
      ]);
      await openTab(wrapper, 'Overview');
      expect(wrapper.emitted('areas')?.at(-1)).toEqual([null]);
      wrapper.unmount();
    });

    it('shows no Links tab to a visitor or in view mode', async () => {
      const visitor = await mountProfile(kruger);
      expect(visitor.text()).not.toContain('Links');
      const auth = useAuthStore();
      auth.isAdmin = true;
      const viewing = await mountProfile(kruger);
      const tabs = viewing.findAll('[role="tab"]').map(tab => tab.text());
      expect(tabs).not.toContain('Links');
      expect(loadPlaceLinks).not.toHaveBeenCalled();
    });

    it('groups links by status with the actions each one offers', async () => {
      vi.mocked(loadPlaceLinks).mockResolvedValue({
        status: 'ok',
        links: [
          link({ id: 'p', status: 'proposed' }),
          link({
            id: 'c',
            status: 'confirmed',
            origin: 'manual',
            coverage: null,
          }),
          link({ id: 'r', status: 'rejected' }),
          link({ id: 't', status: 'retired' }),
        ],
      });
      const wrapper = await openLinks();
      expect(loadPlaceLinks).toHaveBeenCalledWith(placeId);
      const groups = wrapper.findAll('.links-group');
      expect(groups.map(group => group.attributes('data-status'))).toEqual([
        'proposed',
        'confirmed',
        'rejected',
        'retired',
      ]);
      const actions = (id: string) =>
        wrapper
          .get(`[data-link="${id}"]`)
          .findAll('button')
          .slice(1)
          .map(button => button.text());
      expect(actions('p')).toEqual(['Confirm', 'Reject']);
      expect(actions('c')).toEqual(['Reject', 'Retire']);
      expect(actions('r')).toEqual(['Confirm', 'Retire']);
      expect(actions('t')).toEqual([]);
      const proposed = wrapper.get('[data-link="p"]').text();
      expect(proposed).toContain('Recognised by');
      expect(proposed).toContain('62.0% of this place inside');
      expect(wrapper.get('[data-link="c"]').text()).toContain(
        'Added by an admin'
      );
    });

    it('confirms, rejects, and retires with the stored subject and object', async () => {
      vi.mocked(loadPlaceLinks).mockResolvedValue({
        status: 'ok',
        links: [
          link({ id: 'p', status: 'proposed' }),
          link({
            id: 'c',
            typeId: 'located_in',
            outward: true,
            otherId: parkId,
            status: 'confirmed',
          }),
        ],
      });
      const wrapper = await openLinks();
      const press = async (id: string, label: string) => {
        const button = wrapper
          .get(`[data-link="${id}"]`)
          .findAll('button')
          .find(item => item.text() === label);
        if (!button) throw new Error(`Missing ${label}`);
        await button.trigger('click');
        await flushPromises();
      };
      await press('p', 'Confirm');
      await press('p', 'Reject');
      await press('c', 'Retire');
      expect(vi.mocked(setPlaceRelationship).mock.calls).toEqual([
        [siteId, 'recognises', placeId, 'confirmed'],
        [siteId, 'recognises', placeId, 'rejected'],
        [placeId, 'located_in', parkId, 'retired'],
      ]);
      // Each change reads the links and the Related tab again
      expect(loadPlaceLinks).toHaveBeenCalledTimes(4);
      expect(loadRelatedPlaces).toHaveBeenCalledTimes(4);
    });

    it('shows the error on the link when a change fails', async () => {
      vi.mocked(loadPlaceLinks).mockResolvedValue({
        status: 'ok',
        links: [link({ id: 'p' })],
      });
      vi.mocked(setPlaceRelationship).mockResolvedValue({
        status: 'error',
        message: 'the reverse recognises link is already stored',
      });
      const wrapper = await openLinks();
      await wrapper
        .get('[data-link="p"] .links-actions button')
        .trigger('click');
      await flushPromises();
      expect(wrapper.get('[data-link="p"] [role="alert"]').text()).toBe(
        'the reverse recognises link is already stored'
      );
    });

    it.each([
      ['Recognised by', siteId, 'recognises', placeId],
      ['Contains', siteId, 'located_in', placeId],
      ['Part of', placeId, 'part_of', siteId],
      ['Overlaps', placeId, 'overlaps', siteId],
    ])(
      'adds a link labelled %s as confirmed',
      async (label, subject, type, object) => {
        vi.useFakeTimers();
        vi.mocked(loadPlaceLinks).mockResolvedValue({
          status: 'ok',
          links: [],
        });
        vi.mocked(searchPlaces).mockResolvedValue({
          status: 'ok',
          places: [
            {
              id: siteId,
              name: 'Kruger to Canyons',
              designation: null,
              iso3: 'ZAF',
              area_km2: 26000,
              cropland_percent: null,
              place_type_id: 'biosphere_reserve',
            },
          ],
        });
        const wrapper = await openLinks(true);
        expect(document.body.querySelector('#link-type')).toBeNull();
        await wrapper.get('.links-open').trigger('click');
        await flushPromises();
        // The popover renders outside the profile
        const body = new DOMWrapper(document.body);
        const select = body.get<HTMLSelectElement>('#link-type');
        const index = [...select.element.options].findIndex(
          option => option.text.trim() === label
        );
        await select.setValue(String(index));
        await body.get('#link-place').setValue('Canyons');
        await vi.advanceTimersByTimeAsync(300);
        await flushPromises();
        expect(searchPlaces).toHaveBeenCalledWith(
          'Canyons',
          expect.any(AbortSignal)
        );
        const item = document.body.querySelector<HTMLElement>('.suggest-item');
        if (!item) throw new Error('Missing search result');
        item.click();
        await flushPromises();
        await body.get('.links-add').trigger('submit');
        await flushPromises();
        vi.useRealTimers();
        expect(setPlaceRelationship).toHaveBeenCalledWith(
          subject,
          type,
          object,
          'confirmed'
        );
        // A saved link closes the popover
        expect(document.body.querySelector('.links-add')).toBeNull();
        wrapper.unmount();
      }
    );
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

  it('says when a place has no related places', async () => {
    const wrapper = await mountProfile({
      ...kruger,
      placeTypeId: 'ramsar_site',
    });
    await openTab(wrapper, 'Related');
    expect(wrapper.get('[role="tabpanel"]').text()).toBe(
      'No related places yet.'
    );
    expect(wrapper.emitted('areas')).toBeUndefined();
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
    expect(tabs).toEqual(['Overview', 'Related', 'Landscape', 'Species']);
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
