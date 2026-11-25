<script setup lang="ts">
import { Link, Pin, PinOff, X } from '@lucide/vue';
import { initials } from '@/places/display';
import usePlacesStore from '@/store/PlacesStore';

/** The sets of places drawn on the map, one chip each, under Landscape. */
const placesStore = usePlacesStore();
</script>

<template>
  <ul
    v-if="placesStore.mapSets.length"
    class="map-set-chips"
    aria-label="Drawn on the map"
  >
    <li
      v-for="set in placesStore.mapSets"
      :key="set.id"
      class="map-set-chip map-control"
      :class="{ 'is-on': set.pinned }"
    >
      <button
        type="button"
        class="map-set-label"
        :title="set.label"
        :aria-label="set.label"
        @click="placesStore.openSetOwner(set.id)"
      >
        <Link :size="14" :stroke-width="2.25" aria-hidden="true" />
        <span class="map-set-initials">{{ initials(set.ownerName) }}</span>
      </button>
      <button
        type="button"
        class="map-set-icon"
        :aria-label="set.pinned ? `Unpin ${set.label}` : `Pin ${set.label}`"
        :title="set.pinned ? 'Unpin' : 'Pin to the map'"
        @click="
          set.pinned ? placesStore.unpinSet(set.id) : placesStore.pinSet(set.id)
        "
      >
        <PinOff
          v-if="set.pinned"
          :size="14"
          :stroke-width="2.25"
          aria-hidden="true"
        />
        <Pin v-else :size="14" :stroke-width="2.25" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="map-set-icon"
        :aria-label="`Remove ${set.label}`"
        title="Remove from the map"
        @click="placesStore.removeSet(set.id)"
      >
        <X :size="14" :stroke-width="2.25" aria-hidden="true" />
      </button>
    </li>
  </ul>
</template>

<style scoped>
.map-set-chips {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.map-set-chip {
  gap: 2px;
  padding: 0 4px 0 12px;
}

.map-set-label {
  display: inline-flex;
  flex: 0 1 auto;
  align-items: center;
  gap: 5px;
  min-width: 0;
  margin: 0 4px 0 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.map-set-initials {
  font-weight: 500;
  letter-spacing: 0.04em;
}

.map-set-icon {
  display: grid;
  flex: none;
  width: 24px;
  height: 24px;
  margin: 0;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: none;
  color: inherit;
  cursor: pointer;
}

.map-set-icon:hover {
  background: var(--accent);
  color: var(--map-control-text);
}

.map-set-label:focus-visible,
.map-set-icon:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
</style>
