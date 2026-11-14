<script setup lang="ts">
import { Image } from '@lucide/vue';
import { computed } from 'vue';
import {
  countryName,
  formatAreaTag,
  placeTypeColour,
  placeTypeLabel,
} from '@/places/display';

const props = defineProps<{
  name: string;
  iso3: string | null;
  areaKm2: number | null;
  /** Marks the card as the open place. */
  current?: boolean;
  /** `place_types.id`, shown as a coloured label. */
  placeTypeId?: string | null;
  /** Address of the place's main photograph. A placeholder shows without it. */
  photo?: string | null;
}>();

defineEmits<{
  click: [];
  /** The pointer or focus entered (true) or left (false) the card. */
  highlight: [on: boolean];
}>();

const country = computed(() => countryName(props.iso3));
</script>

<template>
  <button
    type="button"
    class="place-result"
    :aria-current="current ? 'true' : undefined"
    @click="$emit('click')"
    @mouseenter="$emit('highlight', true)"
    @mouseleave="$emit('highlight', false)"
    @focus="$emit('highlight', true)"
    @blur="$emit('highlight', false)"
  >
    <span class="place-thumb" aria-hidden="true">
      <img
        v-if="photo"
        class="place-thumb-image"
        :src="photo"
        alt=""
        loading="lazy"
      />
      <Image v-else :size="20" :stroke-width="1.25" />
    </span>
    <span class="place-card-text">
      <span class="place-card-name" :title="name">
        {{ name }}
      </span>
      <span class="place-card-meta">
        <span
          v-if="placeTypeId !== undefined"
          class="place-card-type"
          :style="{ '--type-colour': placeTypeColour(placeTypeId) }"
        >
          <span class="place-card-type-dot" aria-hidden="true" />
          {{ placeTypeLabel(placeTypeId) }}
        </span>
        <span v-if="country" class="place-card-country">{{ country }}</span>
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
  overflow: hidden;
  background: linear-gradient(150deg, #eef0ee, #dfe3df);
  color: #a3aba6;
}

.place-thumb-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
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
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 6px;
  font-size: 12px;
  color: var(--muted-foreground);
}

.place-card-type {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  border: 1px solid color-mix(in srgb, var(--type-colour) 45%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--type-colour) 10%, transparent);
  color: var(--foreground);
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
}

.place-card-type-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--type-colour);
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
