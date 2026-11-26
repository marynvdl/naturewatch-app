<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue';
import type { Polygon } from 'geojson';
import EditDialog from '@/components/EditDialog.vue';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/ui/segmented-control';
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

/** The form for one drawn correction: layer, action, values, years, and a reason. */
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

/** The years in the range that are on, as the year chips show them. */
const keptYears = computed(() => years.value.map(String));

/**
 * Turn year chips on or off.
 * @param kept - The years whose chips are on.
 */
function setKeptYears(kept: unknown) {
  const on = new Set(Array.isArray(kept) ? kept.map(Number) : []);
  unchecked.value = new Set(shownYears.value.filter(year => !on.has(year)));
}

/**
 * Choose an action. Pressing the chosen one again keeps it.
 * @param next - The action pressed.
 */
function setAction(next: unknown) {
  if (typeof next === 'string' && next) {
    action.value = next as CatalogCorrectionAction;
  }
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
    description="Choose the layer that is wrong inside the polygon, what should be there instead, the years, and why."
    submit-label="Save"
    fixed-height
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

    <p v-if="!block" class="correction-help">
      Choose the layer that is wrong inside the area you drew.
    </p>

    <template v-else>
      <div class="correction-field">
        <span :id="`${uid}-action`" class="correction-label">Action</span>
        <SegmentedControl
          :model-value="action"
          type="single"
          variant="outline"
          size="sm"
          :aria-labelledby="`${uid}-action`"
          @update:model-value="setAction"
        >
          <SegmentedControlItem
            v-for="item in block.actions"
            :key="item"
            :value="item"
          >
            {{ ACTION_LABELS[item] }}
          </SegmentedControlItem>
        </SegmentedControl>
      </div>

      <div v-if="asksValues" class="correction-values">
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
            placeholder="0–100"
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
      </div>

      <div class="correction-field">
        <span class="correction-label">Years</span>
        <div class="correction-range">
          <label class="correction-range-end" :for="`${uid}-from`">
            <span class="correction-sublabel">From</span>
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
            <span class="correction-sublabel">To</span>
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
          <SegmentedControl
            :model-value="keptYears"
            type="multiple"
            variant="outline"
            size="sm"
            class="nw:flex-wrap"
            :spacing="1.5"
            aria-label="Years in the range"
            @update:model-value="setKeptYears"
          >
            <SegmentedControlItem
              v-for="year in shownYears"
              :key="year"
              :value="String(year)"
              :data-year="year"
            >
              {{ year }}
            </SegmentedControlItem>
          </SegmentedControl>
        </div>
        <p v-if="years.length === 0" class="correction-help" role="alert">
          Keep at least one year.
        </p>
      </div>

      <label class="correction-field" :for="`${uid}-note`">
        <span class="correction-label">Reason</span>
        <textarea
          :id="`${uid}-note`"
          v-model="note"
          class="correction-input correction-note"
          name="note"
          rows="3"
          placeholder="What is there instead, and how you know"
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
  gap: 8px;
  min-width: 0;
}

.correction-label {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--foreground);
}

.correction-sublabel,
.correction-help {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted-foreground);
}

.correction-input {
  width: 100%;
  min-height: 38px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
  color: var(--foreground);
  font: inherit;
  font-size: 14px;
}

.correction-note {
  padding: 10px 12px;
  resize: vertical;
}

.correction-input:focus-visible {
  outline: 2px solid var(--foreground, #24312c);
  outline-offset: 2px;
}

.correction-values {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}

.correction-range {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.correction-range-end {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.correction-years {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
</style>
