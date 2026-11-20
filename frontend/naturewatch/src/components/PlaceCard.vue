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
  /** A tag after the area, such as how many photographs are suggested. */
  note?: string | null;
  /** Position in a numbered list, shown on the thumbnail's corner. */
  number?: number | null;
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
      <span v-if="number != null" class="place-thumb-number">
        {{ number.toLocaleString('en-GB') }}
      </span>
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
        <span v-if="country" class="place-card-country" :title="country">
          {{ country }}
        </span>
      </span>
      <span v-if="areaKm2 != null || note" class="place-card-tags">
        <span v-if="areaKm2 != null" class="place-card-area">
          {{ formatAreaTag(areaKm2) }} km²
        </span>
        <span v-if="note" class="place-card-area place-card-note">
          {{ note }}
        </span>
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
  position: relative;
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

.place-thumb-number {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 1px 5px;
  border-radius: 999px;
  background: rgb(255 255 255 / 88%);
  color: #24312c;
  font-size: 10px;
  font-weight: 500;
  line-height: 14px;
  font-variant-numeric: tabular-nums;
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
  max-width: 100%;
  align-items: center;
  gap: 2px 6px;
  font-size: 12px;
  color: var(--muted-foreground);
}

/* A transboundary place can list many countries. One line, cut with an ellipsis. */
.place-card-country {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.place-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: auto;
}

.place-card-area {
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--on);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
</style>
