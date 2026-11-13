<script setup lang="ts">
import { Image } from '@lucide/vue';
import { countryName, formatAreaTag } from '@/places/display';

defineProps<{
  name: string;
  iso3: string | null;
  areaKm2: number | null;
  /** Marks the card as the open place. */
  current?: boolean;
}>();

defineEmits<{ click: [] }>();
</script>

<template>
  <button
    type="button"
    class="place-result"
    :aria-current="current ? 'true' : undefined"
    @click="$emit('click')"
  >
    <span class="place-thumb" aria-hidden="true">
      <Image :size="20" :stroke-width="1.25" />
    </span>
    <span class="place-card-text">
      <span class="place-card-name" :title="name">
        {{ name }}
      </span>
      <span v-if="iso3" class="place-card-meta">
        {{ countryName(iso3) }}
      </span>
      <span v-if="areaKm2 != null" class="place-card-area">
        {{ formatAreaTag(areaKm2) }} km²
      </span>
    </span>
  </button>
</template>

<style scoped>
/* One height for every card. It fits a name over three lines. */
.place-result {
  display: flex;
  align-items: stretch;
  gap: 12px;
  width: 100%;
  height: 112px;
  margin: 0;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--map-control-radius);
  background: var(--background);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.place-result:hover {
  background: var(--accent);
}

.place-result[aria-current='true'] {
  border-color: var(--foreground);
  background: var(--accent);
}

.place-result:focus-visible {
  outline: 2px solid var(--foreground);
  outline-offset: 2px;
}

.place-thumb {
  display: grid;
  flex: none;
  align-self: center;
  width: 76px;
  height: 76px;
  place-items: center;
  border-radius: 6px;
  background: linear-gradient(150deg, #eef0ee, #dfe3df);
  color: #a3aba6;
}

.place-card-text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}

.place-card-name {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.place-card-meta {
  font-size: 12px;
  color: var(--muted-foreground);
}

.place-card-area {
  margin-top: auto;
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--on);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
</style>
