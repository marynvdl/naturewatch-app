import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DOMWrapper,
  flushPromises,
  mount,
  type VueWrapper,
} from '@vue/test-utils';
import type { Polygon } from 'geojson';
import CorrectionForm from '@/components/CorrectionForm.vue';
import { catalog } from '@/catalog';
import { correctableLayers, type CorrectableLayer } from '@/corrections/form';
import { submitCorrection } from '@/corrections/api';

vi.mock('@/corrections/api', () => ({ submitCorrection: vi.fn() }));

const polygon: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [31, -24],
      [31.1, -24],
      [31.1, -24.1],
      [31, -24.1],
      [31, -24],
    ],
  ],
};

/**
 * The correctable layers with these ids, as if they were on.
 * @param ids - Catalog layer ids.
 */
function on(...ids: string[]): CorrectableLayer[] {
  const titles = catalog.layers
    .filter(layer => ids.includes(layer.id))
    .map(layer => layer.title);
  return correctableLayers(catalog, titles);
}

/** The dialog is drawn in a portal on the page body. */
const body = () => new DOMWrapper(document.body);

let wrapper: VueWrapper | null = null;

/**
 * Mount the form, open.
 * @param layers - The layers on the map.
 * @param timelineYear - The timeline year.
 */
async function mountForm(layers: CorrectableLayer[], timelineYear = 2024) {
  wrapper = mount(CorrectionForm, {
    props: { open: true, polygon, layers, timelineYear },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

/** The Save button. */
const save = () =>
  body()
    .findAll('button')
    .find(button => button.text() === 'Save')!;

/**
 * Choose an option in a select.
 * @param name - The select's name.
 * @param value - The option value.
 */
async function choose(name: string, value: string | number) {
  await body().get(`select[name="${name}"]`).setValue(String(value));
  await flushPromises();
}

/**
 * Choose an action by its label.
 * @param label - The action's button text.
 */
async function act(label: string) {
  const item = body()
    .findAll('button')
    .find(button => button.text() === label)!;
  await item.trigger('click');
  await flushPromises();
}

/** The action buttons' text. */
const actionLabels = () =>
  body()
    .findAll('button')
    .map(button => button.text())
    .filter(text => /here|kind/.test(text));

describe('CorrectionForm', () => {
  beforeEach(() => {
    vi.mocked(submitCorrection).mockReset();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('chooses the only layer that is on, and asks for its share on add', async () => {
    await mountForm(on('cropland'));
    expect(
      (body().get('select[name="layer"]').element as HTMLSelectElement).value
    ).toBe('cropland');
    const labels = actionLabels();
    expect(labels).toContain('Remove here');
    expect(labels).toContain('Add here');
    expect(labels).not.toContain('Change kind');
    expect(body().find('input[name="value-share"]').exists()).toBe(false);
    await act('Add here');
    expect(body().find('input[name="value-share"]').exists()).toBe(true);
    await act('Add here');
    expect(body().find('input[name="value-share"]').exists()).toBe(true);
    expect(save().attributes('disabled')).toBeDefined();
  });

  it('waits for a layer when several are on', async () => {
    await mountForm(on('cropland', 'roads'));
    expect(
      (body().get('select[name="layer"]').element as HTMLSelectElement).value
    ).toBe('');
    expect(actionLabels()).toEqual([]);
    await choose('layer', 'roads');
    await act('Change kind');
    expect(body().find('select[name="value-level"]').exists()).toBe(true);
    expect(body().find('select[name="value-surface"]').exists()).toBe(true);
    await choose('value-level', 3);
    expect(save().attributes('disabled')).toBeDefined();
    await choose('value-surface', 1);
    expect(save().attributes('disabled')).toBeUndefined();
  });

  it('offers 2000 to the latest year and drops unchecked years', async () => {
    vi.mocked(submitCorrection).mockResolvedValue({ id: 'new-id' });
    const form = await mountForm(on('fire'), 2021);
    const years = body()
      .get('select[name="from-year"]')
      .findAll('option')
      .map(option => option.text());
    expect(years[0]).toBe('2000');
    expect(years.at(-1)).toBe('2025');
    await act('Remove here');
    await choose('from-year', 2019);
    expect(body().findAll('[data-year]')).toHaveLength(3);
    await body().get('[data-year="2020"]').trigger('click');
    await flushPromises();
    expect(body().get('[data-year="2020"]').attributes('data-state')).toBe(
      'off'
    );
    await body()
      .get('textarea[name="note"]')
      .setValue('  Burnt scar is a dam  ');
    await save().trigger('click');
    await flushPromises();
    expect(submitCorrection).toHaveBeenCalledWith({
      layerId: 'fire',
      layerVersion: null,
      polygon,
      years: [2019, 2021],
      action: 'remove',
      value: null,
      note: 'Burnt scar is a dam',
    });
    expect(form.emitted('saved')).toEqual([['new-id']]);
    expect(form.emitted('update:open')).toEqual([[false]]);
  });

  it('sends the share as a fraction with the layer version', async () => {
    vi.mocked(submitCorrection).mockResolvedValue({ id: 'new-id' });
    await mountForm(on('cropland'));
    await act('Add here');
    await body().get('input[name="value-share"]').setValue('40');
    await choose('from-year', 2003);
    await save().trigger('click');
    await flushPromises();
    const sent = vi.mocked(submitCorrection).mock.calls[0][0];
    expect(sent.value).toEqual({ share: 0.4 });
    expect(sent.layerVersion).toBe('v3');
    expect(sent.years).toHaveLength(22);
    expect(sent.years[0]).toBe(2003);
    expect(sent.note).toBeNull();
  });

  it('keeps the dialog open and shows the database error', async () => {
    vi.mocked(submitCorrection).mockResolvedValue({
      error: 'The shape is not valid: Self-intersection',
    });
    const form = await mountForm(on('dams'));
    await act('Add here');
    await save().trigger('click');
    await flushPromises();
    expect(body().get('[role="alert"]').text()).toContain('Self-intersection');
    expect(form.emitted('saved')).toBeUndefined();
  });
});
