<script setup lang="ts">
import { computed, ref } from 'vue';
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
import { COUNTRY_NAMES } from '@/places/countryNames';
import { countryName } from '@/places/display';

/** Country codes, in the order shown. */
const codes = defineModel<string[]>({ required: true });

/** Suggestions shown at once. */
const SUGGESTION_LIMIT = 8;

const search = ref('');
const suggestions = computed(() => {
  const needle = search.value.trim().toLowerCase();
  if (!needle) return [];
  return Object.entries(COUNTRY_NAMES)
    .filter(
      ([code, name]) =>
        !codes.value.includes(code) &&
        (name.toLowerCase().includes(needle) || code.toLowerCase() === needle)
    )
    .sort(
      ([, a], [, b]) =>
        Number(!a.toLowerCase().startsWith(needle)) -
          Number(!b.toLowerCase().startsWith(needle)) || a.localeCompare(b)
    )
    .slice(0, SUGGESTION_LIMIT);
});

function add(code: unknown) {
  if (typeof code !== 'string' || codes.value.includes(code)) return;
  codes.value = [...codes.value, code];
  search.value = '';
}

function remove(code: string) {
  codes.value = codes.value.filter(item => item !== code);
}
</script>

<template>
  <div class="countries-editor">
    <ul v-if="codes.length" class="countries-chips" aria-label="Countries">
      <li v-for="code in codes" :key="code" class="countries-chip">
        {{ countryName(code) }}
        <button
          type="button"
          class="countries-remove"
          :aria-label="`Remove ${countryName(code)}`"
          @click="remove(code)"
        >
          <X :size="12" :stroke-width="2.25" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <ComboboxRoot
      :model-value="null"
      ignore-filter
      :open="suggestions.length > 0 || search.trim() !== ''"
      @update:model-value="add"
    >
      <ComboboxAnchor class="countries-anchor">
        <ComboboxInput
          v-model="search"
          class="countries-input"
          placeholder="Add a country"
          aria-label="Add a country"
        />
      </ComboboxAnchor>
      <ComboboxContent
        class="countries-list nw"
        position="popper"
        :side-offset="4"
      >
        <ComboboxViewport>
          <ComboboxEmpty class="countries-empty">
            No country matches.
          </ComboboxEmpty>
          <ComboboxItem
            v-for="[code, name] in suggestions"
            :key="code"
            :value="code"
            class="countries-item"
          >
            {{ name }}
          </ComboboxItem>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxRoot>
  </div>
</template>

<style scoped>
.countries-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.countries-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.countries-chip {
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

.countries-remove {
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

.countries-remove:hover {
  background: var(--muted);
  color: var(--foreground);
}

.countries-remove:focus-visible,
.countries-input:focus-visible {
  outline: 2px solid var(--foreground, #24312c);
  outline-offset: 2px;
}

.countries-input {
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
</style>

<style>
/* Rendered outside the component, so not scoped. */
.countries-list {
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

.countries-item,
.countries-empty {
  padding: 6px 10px;
  border-radius: 8px;
  color: var(--foreground);
  font-size: 13px;
}

.countries-empty {
  color: var(--muted-foreground);
}

.countries-item {
  cursor: pointer;
}

.countries-item[data-highlighted] {
  background: var(--muted);
}
</style>
