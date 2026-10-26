<script setup lang="ts">
import { computed } from 'vue';
import { Search } from '@lucide/vue';
import usePlacesStore from '@/store/PlacesStore';

const placesStore = usePlacesStore();

const placesOn = computed(() => placesStore.visible);

/** Draw the protected areas, or remove them when they are already drawn. */
function toggleProtectedAreas() {
  placesStore.toggle();
}
</script>

<template>
  <div class="places-bar map-panel nw">
    <h2 class="places-title panel-heading">Places</h2>
    <div class="places-search">
      <Search class="places-search-icon" aria-hidden="true" />
      <input
        type="search"
        placeholder="Search protected areas, countries..."
        aria-label="Search places"
      />
      <kbd class="places-kbd" aria-hidden="true">/</kbd>
    </div>
    <div class="places-types">
      <button
        type="button"
        class="place-type map-control"
        :class="{ 'is-on': placesOn }"
        :aria-pressed="placesOn"
        @click="toggleProtectedAreas"
      >
        Protected areas
      </button>
      <button type="button" class="place-type map-control" disabled>
        Ecoregions
      </button>
      <button type="button" class="place-type map-control" disabled>
        Countries
      </button>
    </div>
    <p v-if="placesStore.status === 'loading'" class="places-status">
      Loading places.
    </p>
    <p v-else-if="placesStore.status === 'error'" class="places-status">
      The places could not be drawn.
    </p>
    <p v-else-if="placesStore.status === 'unconfigured'" class="places-status">
      The place store is not configured.
    </p>
  </div>
</template>

<style scoped>
.places-bar {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 12;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  width: max-content;
  max-width: calc(100vw - 24px);
}

.places-title,
.places-search {
  width: 0;
  min-width: 100%;
}

.places-search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  border: 1px solid #d5ddd6;
  border-radius: 12px;
  background: #f8f9f9;
  color: #3a3935;
}

.places-search-icon {
  width: 16px;
  height: 16px;
  flex: none;
  color: #5f7168;
}

.places-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
  font-size: 14px;
  color: inherit;
}

.places-search input::placeholder {
  color: #6f7d76;
}

.places-kbd {
  flex: none;
  font-family: inherit;
  font-size: 14px;
  color: #8a9690;
}

.places-types {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
}

.place-type:disabled {
  opacity: 1;
  cursor: default;
}

.places-status {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}
</style>
