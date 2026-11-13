<script setup lang="ts">
import { computed } from 'vue';
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxRoot,
  ComboboxViewport,
} from 'reka-ui';

const props = defineProps<{
  /** Suggestions, most used first. */
  options: string[];
  id?: string;
  invalid?: boolean;
}>();

/** The typed text. Any text is allowed, not only a suggestion. */
const text = defineModel<string>({ required: true });

/** Suggestions shown at once. */
const SUGGESTION_LIMIT = 8;

const suggestions = computed(() => {
  const needle = text.value.trim().toLowerCase();
  if (!needle) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const option of props.options) {
    const lower = option.toLowerCase();
    if (lower === needle) continue;
    if (lower.startsWith(needle)) starts.push(option);
    else if (lower.includes(needle)) contains.push(option);
    if (starts.length >= SUGGESTION_LIMIT) break;
  }
  return [...starts, ...contains].slice(0, SUGGESTION_LIMIT);
});

function choose(value: unknown) {
  if (typeof value === 'string') text.value = value;
}
</script>

<template>
  <ComboboxRoot
    :model-value="null"
    ignore-filter
    :open="suggestions.length > 0"
    @update:model-value="choose"
  >
    <ComboboxAnchor>
      <ComboboxInput
        :id="id"
        v-model="text"
        class="suggest-input"
        :aria-invalid="invalid || undefined"
      />
    </ComboboxAnchor>
    <ComboboxContent class="suggest-list nw" position="popper" :side-offset="4">
      <ComboboxViewport>
        <ComboboxItem
          v-for="option in suggestions"
          :key="option"
          :value="option"
          class="suggest-item"
        >
          {{ option }}
        </ComboboxItem>
      </ComboboxViewport>
    </ComboboxContent>
  </ComboboxRoot>
</template>

<style scoped>
.suggest-input {
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

.suggest-input:focus-visible {
  outline: 2px solid var(--foreground, #24312c);
  outline-offset: 2px;
}
</style>

<style>
/* Rendered outside the component, so not scoped. */
.suggest-list {
  z-index: 50;
  width: var(--reka-combobox-trigger-width);
  max-height: 240px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--background);
  box-shadow: 0 8px 24px rgb(0 0 0 / 12%);
}

.suggest-item {
  padding: 6px 10px;
  border-radius: 8px;
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
}

.suggest-item[data-highlighted] {
  background: var(--muted);
}
</style>
