<script lang="ts">
import { loadEcoregionNames, type EcoregionName } from '@/places/api';

/** The ecoregion names, read once per page load and shared by every field. */
let namesRead: Promise<EcoregionName[]> | null = null;
</script>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { X } from '@lucide/vue';
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxRoot,
  ComboboxViewport,
} from 'reka-ui';

/** Chosen ecoregions, in the order chosen. */
const chosen = defineModel<EcoregionName[]>({ required: true });

const props = defineProps<{
  /** Id of the element that names the field. */
  labelledby: string;
}>();

/** Most suggestions listed. The list scrolls. */
const SUGGESTION_LIMIT = 50;

const names = ref<EcoregionName[]>([]);
const field = ref<HTMLElement | null>(null);
const search = ref('');

onMounted(async () => {
  namesRead ??= loadEcoregionNames().then(result =>
    result.status === 'ok' ? result.ecoregions : []
  );
  const read = await namesRead;
  // Read again next time when it failed.
  if (!read.length) namesRead = null;
  names.value = read;
});

const suggestions = computed(() => {
  const needle = search.value.trim().toLowerCase();
  if (!needle) return [];
  const taken = new Set(chosen.value.map(ecoregion => ecoregion.id));
  return names.value
    .filter(
      ecoregion =>
        !taken.has(ecoregion.id) &&
        ecoregion.name.toLowerCase().includes(needle)
    )
    .sort(
      (a, b) =>
        Number(!a.name.toLowerCase().startsWith(needle)) -
          Number(!b.name.toLowerCase().startsWith(needle)) ||
        a.name.localeCompare(b.name)
    )
    .slice(0, SUGGESTION_LIMIT);
});

/** Whether the suggestions show, under the field. */
const listOpen = computed(
  () => suggestions.value.length > 0 || search.value.trim() !== ''
);

/** Keep the field and what is under it in view. */
function revealField() {
  void nextTick(() => field.value?.scrollIntoView?.({ block: 'nearest' }));
}

// The suggestions push the dialog's content down. Scroll so they show.
watch(listOpen, open => {
  if (open) revealField();
});

/**
 * Add a suggested ecoregion, clear the typing, and keep the new tag in view.
 * @param id - The chosen suggestion's `places.id`.
 */
function add(id: unknown) {
  const ecoregion = names.value.find(item => item.id === id);
  if (!ecoregion || chosen.value.some(item => item.id === id)) return;
  chosen.value = [...chosen.value, ecoregion];
  search.value = '';
  revealField();
}

/**
 * Remove a chosen ecoregion.
 * @param id - Its `places.id`.
 */
function remove(id: string) {
  chosen.value = chosen.value.filter(item => item.id !== id);
}
</script>

<template>
  <div ref="field" class="ecoregions-field">
    <ComboboxRoot
      :model-value="null"
      ignore-filter
      :open="listOpen"
      @update:model-value="add"
    >
      <ComboboxAnchor class="ecoregions-anchor">
        <ComboboxInput
          v-model="search"
          :aria-labelledby="props.labelledby"
          class="ecoregions-input"
          placeholder="Type an ecoregion's name"
        />
      </ComboboxAnchor>
      <ComboboxContent class="ecoregions-list" position="inline">
        <ComboboxViewport>
          <ComboboxEmpty class="ecoregions-empty">
            No ecoregion matches.
          </ComboboxEmpty>
          <ComboboxItem
            v-for="ecoregion in suggestions"
            :key="ecoregion.id"
            :value="ecoregion.id"
            class="ecoregions-item"
          >
            {{ ecoregion.name }}
          </ComboboxItem>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxRoot>
    <ul v-if="chosen.length" class="ecoregions-chips" aria-label="Ecoregions">
      <li
        v-for="ecoregion in chosen"
        :key="ecoregion.id"
        class="ecoregions-chip"
      >
        {{ ecoregion.name }}
        <button
          type="button"
          class="ecoregions-remove"
          :aria-label="`Remove ${ecoregion.name}`"
          @click="remove(ecoregion.id)"
        >
          <X :size="12" :stroke-width="2.25" aria-hidden="true" />
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ecoregions-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ecoregions-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ecoregions-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 8px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--foreground);
  font-size: 12px;
  line-height: 1.4;
}

.ecoregions-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
}

.ecoregions-remove:hover {
  background: var(--muted);
  color: var(--foreground);
}

.ecoregions-remove:focus-visible,
.ecoregions-input:focus-visible {
  outline: 2px solid var(--foreground, #24312c);
  outline-offset: 2px;
}

.ecoregions-input {
  width: 100%;
  height: 36px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
  color: var(--foreground);
  font: inherit;
  font-size: 14px;
}

/* In the page flow under the input, so the dialog grows and scrolls with it. */
.ecoregions-list {
  max-height: 280px;
  margin-top: 4px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--background);
}

.ecoregions-item,
.ecoregions-empty {
  padding: 6px 10px;
  border-radius: 8px;
  color: var(--foreground);
  font-size: 13px;
}

.ecoregions-empty {
  color: var(--muted-foreground);
}

.ecoregions-item {
  cursor: pointer;
}

.ecoregions-item[data-highlighted] {
  background: var(--muted);
}
</style>
