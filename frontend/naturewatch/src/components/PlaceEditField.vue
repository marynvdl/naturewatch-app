<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { Pencil } from '@lucide/vue';
import PlaceCountriesEditor from '@/components/PlaceCountriesEditor.vue';
import PlaceSuggestInput from '@/components/PlaceSuggestInput.vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** A value that can be curated: text, or a list of country codes. */
export type CuratedValue = string | string[] | null;

const props = withDefaults(
  defineProps<{
    /** In edit mode. Otherwise only the slot is shown. */
    editable: boolean;
    label: string;
    kind?: 'line' | 'text' | 'countries';
    /** The curated value, or null when the source value is shown. */
    curated: CuratedValue;
    /** The source value as text, or null when the source has none. */
    source: string | null;
    /** The value the editor starts from when nothing is curated. */
    start?: CuratedValue;
    maxLength?: number;
    /** Suggestions for a one-line field, read when it first opens. */
    suggest?: () => Promise<string[]>;
    /** Saves a value, or null to reset. Resolves to an error message, or null. */
    save: (value: CuratedValue) => Promise<string | null>;
  }>(),
  { kind: 'line', start: null, maxLength: undefined, suggest: undefined }
);

const editing = ref(false);
const saving = ref(false);
const error = ref('');
const draft = ref('');
const draftCodes = ref<string[]>([]);
const root = ref<HTMLElement | null>(null);
const options = ref<string[]>([]);

const isCurated = computed(() =>
  Array.isArray(props.curated) ? props.curated.length > 0 : !!props.curated
);
const tooLong = computed(
  () => props.maxLength !== undefined && draft.value.length > props.maxLength
);
const hasLineBreak = computed(
  () => props.kind === 'line' && /[\r\n]/.test(draft.value)
);

async function open() {
  const value = props.curated ?? props.start;
  if (props.kind === 'countries')
    draftCodes.value = Array.isArray(value) ? [...value] : [];
  else draft.value = typeof value === 'string' ? value : '';
  error.value = '';
  editing.value = true;
  if (props.suggest && !options.value.length)
    void props.suggest().then(list => (options.value = list));
  await nextTick();
  root.value?.querySelector<HTMLElement>('input, textarea')?.focus();
}

function cancel() {
  editing.value = false;
  error.value = '';
}

async function submit(value: CuratedValue) {
  saving.value = true;
  error.value = (await props.save(value)) ?? '';
  saving.value = false;
  if (!error.value) editing.value = false;
}

function onSave() {
  if (tooLong.value || hasLineBreak.value) return;
  void submit(props.kind === 'countries' ? draftCodes.value : draft.value);
}
</script>

<template>
  <div v-if="!editable" class="edit-field-plain"><slot /></div>
  <div
    v-else
    ref="root"
    class="edit-field"
    :class="{ 'is-editing': editing }"
    :data-field="label"
  >
    <template v-if="!editing">
      <div class="edit-field-shown">
        <slot />
      </div>
      <button
        type="button"
        class="edit-field-pencil"
        :aria-label="`Edit ${label.toLowerCase()}`"
        :title="`Edit ${label.toLowerCase()}`"
        @click="open"
      >
        <Pencil :size="14" :stroke-width="2" aria-hidden="true" />
      </button>
    </template>
    <form v-else class="edit-field-form" @submit.prevent="onSave">
      <label class="edit-field-label map-section" :for="`edit-${label}`">
        {{ label }}
      </label>
      <PlaceCountriesEditor v-if="kind === 'countries'" v-model="draftCodes" />
      <textarea
        v-else-if="kind === 'text'"
        :id="`edit-${label}`"
        v-model="draft"
        class="edit-field-textarea"
        rows="6"
        :aria-invalid="tooLong || undefined"
      />
      <PlaceSuggestInput
        v-else-if="suggest !== undefined"
        :id="`edit-${label}`"
        v-model="draft"
        :options="options"
        :invalid="hasLineBreak"
      />
      <Input
        v-else
        :id="`edit-${label}`"
        v-model="draft"
        :aria-invalid="tooLong || hasLineBreak || undefined"
      />
      <p
        v-if="maxLength !== undefined"
        class="edit-field-note"
        :class="{ 'is-error': tooLong }"
      >
        {{ draft.length.toLocaleString('en-GB') }} of
        {{ maxLength.toLocaleString('en-GB') }} characters
      </p>
      <p class="edit-field-note">Source: {{ source ?? 'none' }}</p>
      <p v-if="error" class="edit-field-note is-error" role="alert">
        {{ error }}
      </p>
      <div class="edit-field-actions">
        <Button
          type="submit"
          size="sm"
          :disabled="saving || tooLong || hasLineBreak"
        >
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          :disabled="saving"
          @click="cancel"
        >
          Cancel
        </Button>
        <Button
          v-if="isCurated"
          type="button"
          size="sm"
          variant="ghost"
          :disabled="saving"
          @click="submit(null)"
        >
          Reset to source
        </Button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.edit-field {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.edit-field.is-editing {
  display: block;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--background);
}

.edit-field-shown {
  flex: 1 1 auto;
  min-width: 0;
}

.edit-field-pencil {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--background);
  color: var(--muted-foreground);
  cursor: pointer;
}

.edit-field-pencil:hover {
  color: var(--foreground);
  background: var(--muted);
}

.edit-field-pencil:focus-visible,
.edit-field-textarea:focus-visible {
  outline: 2px solid var(--foreground, #24312c);
  outline-offset: 2px;
}

.edit-field-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.edit-field-label {
  margin: 0;
}

.edit-field-textarea {
  width: 100%;
  min-height: 120px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
  color: var(--foreground);
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
}

.edit-field-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted-foreground);
  overflow-wrap: anywhere;
}

.edit-field-note.is-error {
  color: var(--destructive, #b42318);
}

.edit-field-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
