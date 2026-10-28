<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Search } from '@lucide/vue';
import { loadPilotPlaces, type PlaceSummary } from '@/places/api';
import { placesMatching } from '@/places/display';
import usePlacesStore from '@/store/PlacesStore';

const placesStore = usePlacesStore();

type PlaceTypeId = 'protected_area' | 'ecoregion' | 'country';

const placeTypes: { id: PlaceTypeId; label: string }[] = [
  { id: 'protected_area', label: 'Protected areas' },
  { id: 'ecoregion', label: 'Ecoregions' },
  { id: 'country', label: 'Countries' },
];

const placeType = ref<PlaceTypeId>('protected_area');
const listStatus = ref<'loading' | 'ok' | 'unconfigured' | 'error'>('loading');
const places = ref<PlaceSummary[]>([]);
const query = ref('');

const shown = computed(() => placesMatching(places.value, query.value));

const listLoading = computed(
  () => listStatus.value === 'loading' || placesStore.status === 'loading'
);

/**
 * Choose the list type.
 * Clicking Protected areas when it is already selected draws or hides the
 * boundaries. Search and the other types do not load them.
 */
function selectPlaceType(type: PlaceTypeId) {
  if (type === 'protected_area' && placeType.value === 'protected_area') {
    placesStore.toggle();
    return;
  }
  placeType.value = type;
}

onMounted(async () => {
  const result = await loadPilotPlaces();
  listStatus.value = result.status === 'ok' ? 'ok' : result.status;
  if (result.status === 'ok') places.value = result.places;
});
</script>

<template>
  <div class="places-frame">
    <div class="places-bar places-results map-panel nw">
      <h2 class="places-title panel-heading">Places</h2>
      <div class="places-search">
        <Search class="places-search-icon" aria-hidden="true" />
        <input
          v-model="query"
          type="search"
          placeholder="Search protected areas, countries..."
          aria-label="Search places"
        />
        <kbd class="places-kbd" aria-hidden="true">/</kbd>
      </div>
      <div class="places-types" role="group" aria-label="Place types">
        <button
          v-for="type in placeTypes"
          :key="type.id"
          type="button"
          class="place-type map-control"
          :class="{ 'is-on': placeType === type.id }"
          :aria-pressed="placeType === type.id"
          @click="selectPlaceType(type.id)"
        >
          {{ type.label }}
        </button>
      </div>
      <p v-if="listLoading" class="places-status">Loading places.</p>
      <p v-if="placesStore.status === 'error'" class="places-status">
        The places could not be drawn.
      </p>
      <p
        v-if="
          placesStore.status === 'unconfigured' || listStatus === 'unconfigured'
        "
        class="places-status"
      >
        The place store is not configured.
      </p>
      <p v-if="listStatus === 'error'" class="places-status">
        The places could not be loaded.
      </p>
      <div v-if="listStatus === 'ok'" class="places-list">
        <p
          v-if="placeType !== 'protected_area' || places.length === 0"
          class="places-status"
        >
          None are stored.
        </p>
        <p v-else-if="shown.length === 0" class="places-status">
          No places match.
        </p>
        <ul v-else aria-label="Place results">
          <li v-for="place in shown" :key="place.id">{{ place.name }}</li>
        </ul>
      </div>
    </div>
    <div class="places-detail map-panel nw" aria-hidden="true" />
  </div>
</template>

<style scoped>
.places-frame {
  display: flex;
  align-items: stretch;
  gap: 8px;
  max-height: calc(100dvh - 24px);
}

.places-results {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  width: 360px;
  max-width: calc(100vw - 24px);
  max-height: calc(100dvh - 24px);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
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

.places-status {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.places-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.places-list ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.places-list li {
  padding: 10px 2px;
  border-bottom: 1px solid #eeeeea;
  font-size: 14px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.places-detail {
  width: 240px;
  flex: none;
}

@media (max-width: 720px) {
  .places-detail {
    display: none;
  }
}
</style>
