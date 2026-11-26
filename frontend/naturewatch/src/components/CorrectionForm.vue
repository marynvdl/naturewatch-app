<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue';
import type { Polygon } from 'geojson';
import EditDialog from '@/components/EditDialog.vue';
import type { CatalogCorrectionAction } from '@/catalog/types';
import {
  ACTION_LABELS,
  CORRECTION_NOTE_MAX,
  buildValue,
  defaultYear,
  yearRange,
  yearsBetween,
  type CorrectableLayer,
  type ValueInputs,
} from '@/corrections/form';
import { submitCorrection } from '@/corrections/api';

/** The form for one drawn correction: layer, action, values, years, and a note. */
const props = defineProps<{
  /** The drawn polygon. */
  polygon: Polygon | null;
  /** The layers on the map that accept corrections. */
  layers: CorrectableLayer[];
  /** The year on the timeline. */
  timelineYear: number;
}>();

const open = defineModel<boolean>('open', { required: true });

const emit = defineEmits<{ saved: [id: string] }>();

const uid = useId();
const layerId = ref<string>('');
const action = ref<CatalogCorrectionAction | ''>('');
const inputs = reactive<ValueInputs>({});
const fromYear = ref(0);
const toYear = ref(0);
const unchecked = ref<Set<number>>(new Set());
const note = ref('');
const busy = ref(false);
const error = ref('');

const layer = computed(
  () => props.layers.find(item => item.id === layerId.value) ?? null
);
const block = computed(() => layer.value?.corrections ?? null);
const allYears = computed(() => (layer.value ? yearRange(layer.value) : []));
const shownYears = computed(() => yearsBetween(fromYear.value, toYear.value));
const years = computed(() =>
  yearsBetween(fromYear.value, toYear.value, unchecked.value)
);
const asksValues = computed(
  () =>
    action.value !== '' && action.value !== 'remove' && !!block.value?.values
);
const value = computed(() =>
  block.value && action.value
    ? buildValue(block.value, action.value, inputs)
    : undefined
);
const complete = computed(
  () =>
    !!props.polygon &&
    !!layer.value &&
    action.value !== '' &&
    value.value !== undefined &&
    years.value.length > 0
);

/** Start the action, values, and years again for the chosen layer. */
function resetForLayer() {
  const actions = block.value?.actions ?? [];
  action.value = actions.length === 1 ? actions[0] : '';
  Object.keys(inputs).forEach(key => delete inputs[key]);
  unchecked.value = new Set();
  const start = layer.value ? defaultYear(layer.value, props.timelineYear) : 0;
  fromYear.value = start;
  toYear.value = start;
}

watch(layerId, resetForLayer);

watch(
  open,
  isOpen => {
    if (!isOpen) return;
    error.value = '';
    note.value = '';
    const only = props.layers.length === 1 ? props.layers[0].id : '';
    if (layerId.value === only) resetForLayer();
    else layerId.value = only;
  },
  { immediate: true }
);

/** Keep To from being before From, and the other way round. */
watch(fromYear, from => {
  if (toYear.value < from) toYear.value = from;
});
watch(toYear, to => {
  if (fromYear.value > to) fromYear.value = to;
});

/**
 * Check or uncheck one year in the range.
 * @param year - The year.
 * @param checked - Whether it is kept.
 */
function setYear(year: number, checked: boolean) {
  const next = new Set(unchecked.value);
  if (checked) next.delete(year);
  else next.add(year);
  unchecked.value = next;
}

/**
 * Read a number from a field, or null when it is empty.
 * @param raw - The field's value.
 */
function toNumber(raw: string): number | null {
  return raw === '' ? null : Number(raw);
}

/** Save the correction as submitted. */
async function save() {
  if (!complete.value || !layer.value || !props.polygon || !action.value) {
    return;
  }
  busy.value = true;
  error.value = '';
  const result = await submitCorrection({
    layerId: layer.value.id,
    layerVersion: layer.value.source?.version ?? null,
    polygon: props.polygon,
    years: years.value,
    action: action.value,
    value: value.value ?? null,
    note: note.value.trim() || null,
  });
  busy.value = false;
  if ('error' in result) {
    error.value = result.error;
    return;
  }
  emit('saved', result.id);
  open.value = false;
}
</script>

<template>
  <EditDialog
    v-model:open="open"
    title="Flag a correction"
    description="Choose the layer that is wrong inside the polygon, what should be there instead, and the years."
    submit-label="Save"
    :submit-disabled="!complete"
    :busy="busy"
    :error="error"
    @submit="save"
  >
    <label class="correction-field" :for="`${uid}-layer`">
      <span class="correction-label">Layer</span>
      <select
        :id="`${uid}-layer`"
        v-model="layerId"
        class="correction-input"
        name="layer"
      >
        <option value="" disabled>Choose a layer</option>
        <option v-for="item in layers" :key="item.id" :value="item.id">
          {{ item.title }}
        </option>
      </select>
    </label>

    <template v-if="block">
      <fieldset class="correction-field">
        <legend class="correction-label">Action</legend>
        <div class="correction-choices">
          <label
            v-for="item in block.actions"
            :key="item"
            class="correction-choice"
          >
            <input v-model="action" type="radio" name="action" :value="item" />
            {{ ACTION_LABELS[item] }}
          </label>
        </div>
      </fieldset>

      <template v-if="asksValues">
        <label
          v-for="field in block.values"
          :key="field.id"
          class="correction-field"
          :for="`${uid}-value-${field.id}`"
        >
          <span class="correction-label">
            {{ field.label }}{{ field.kind === 'share' ? ' (%)' : '' }}
          </span>
          <input
            v-if="field.kind === 'share'"
            :id="`${uid}-value-${field.id}`"
            class="correction-input"
            type="number"
            :name="`value-${field.id}`"
            min="0"
            max="100"
            step="1"
            :value="inputs[field.id] ?? ''"
            @input="
              inputs[field.id] = toNumber(
                ($event.target as HTMLInputElement).value
              )
            "
          />
          <select
            v-else
            :id="`${uid}-value-${field.id}`"
            class="correction-input"
            :name="`value-${field.id}`"
            :value="inputs[field.id] ?? ''"
            @change="
              inputs[field.id] = toNumber(
                ($event.target as HTMLSelectElement).value
              )
            "
          >
            <option value="" disabled>Choose</option>
            <option
              v-for="option in field.options"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
      </template>

      <fieldset class="correction-field">
        <legend class="correction-label">Years</legend>
        <div class="correction-range">
          <label class="correction-range-end" :for="`${uid}-from`">
            <span class="correction-label">From</span>
            <select
              :id="`${uid}-from`"
              v-model.number="fromYear"
              class="correction-input"
              name="from-year"
            >
              <option v-for="year in allYears" :key="year" :value="year">
                {{ year }}
              </option>
            </select>
          </label>
          <label class="correction-range-end" :for="`${uid}-to`">
            <span class="correction-label">To</span>
            <select
              :id="`${uid}-to`"
              v-model.number="toYear"
              class="correction-input"
              name="to-year"
            >
              <option v-for="year in allYears" :key="year" :value="year">
                {{ year }}
              </option>
            </select>
          </label>
        </div>
        <div v-if="shownYears.length > 1" class="correction-years">
          <label
            v-for="year in shownYears"
            :key="year"
            class="correction-choice"
          >
            <input
              type="checkbox"
              :name="`year-${year}`"
              :checked="!unchecked.has(year)"
              @change="
                setYear(year, ($event.target as HTMLInputElement).checked)
              "
            />
            {{ year }}
          </label>
        </div>
        <p v-if="years.length === 0" class="correction-help">
          Keep at least one year.
        </p>
      </fieldset>

      <label class="correction-field" :for="`${uid}-note`">
        <span class="correction-label">Note (optional)</span>
        <textarea
          :id="`${uid}-note`"
          v-model="note"
          class="correction-input correction-note"
          name="note"
          rows="2"
          :maxlength="CORRECTION_NOTE_MAX"
        />
      </label>
    </template>
  </EditDialog>
</template>

<style scoped>
.correction-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}

.correction-label,
.correction-help {
  margin: 0;
  padding: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted-foreground);
}

.correction-input {
  width: 100%;
  min-height: 36px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
  color: var(--foreground);
  font: inherit;
  font-size: 14px;
}

.correction-note {
  padding: 8px 10px;
  resize: vertical;
}

.correction-input:focus-visible {
  outline: 2px solid var(--foreground, #24312c);
  outline-offset: 2px;
}

.correction-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
}

.correction-choice {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}

.correction-range {
  display: flex;
  gap: 12px;
}

.correction-range-end {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.correction-years {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 4px 8px;
  margin-top: 4px;
}
</style>
