<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Search } from '@lucide/vue';
import PlaceProfileComponent from '@/components/PlaceProfileComponent.vue';
import { loadPilotPlaces, type PlaceSummary } from '@/places/api';
import { placesMatching } from '@/places/display';
import usePlacesStore from '@/store/PlacesStore';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    zoomToPlace?: () => void;
  }>(),
  { open: true, zoomToPlace: () => undefined }
);

const placesStore = usePlacesStore();

type PlaceTypeId = 'protected_area' | 'ecoregion' | 'country';

const placeTypes: { id: PlaceTypeId; label: string }[] = [
  { id: 'protected_area', label: 'Protected areas' },
  { id: 'ecoregion', label: 'Ecoregions' },
  { id: 'country', label: 'Countries' },
];

const placeType = ref<PlaceTypeId | null>(null);
const listStatus = ref<'idle' | 'loading' | 'ok' | 'unconfigured' | 'error'>(
  'idle'
);
const nothingStored = 'Well, this is awkward. We have nothing to show.';
const places = ref<PlaceSummary[]>([]);
const query = ref('');
const resultsList = ref<HTMLElement | null>(null);

const shown = computed(() => placesMatching(places.value, query.value));
const emptyMessage = computed(() =>
  places.value.length === 0 ? nothingStored : 'No places match.'
);
const showProtected = computed(() => placeType.value === 'protected_area');
const selectedName = computed(() => {
  const id = placesStore.selectedId;
  if (!id) return '';
  return (
    places.value.find(place => place.id === id)?.name ??
    placesStore.features?.features.find(item => item.properties.id === id)
      ?.properties.name ??
    ''
  );
});

/** Draw the protected areas when they are hidden. */
function showBoundaries() {
  if (!placesStore.visible) placesStore.toggle();
}

/** Remove the protected areas when they are drawn. */
function hideBoundaries() {
  if (placesStore.visible) placesStore.toggle();
}

/** Load the stored names once. Later type clicks reuse them. */
async function ensureList() {
  if (listStatus.value !== 'idle') return;
  listStatus.value = 'loading';
  const result = await loadPilotPlaces();
  listStatus.value = result.status === 'ok' ? 'ok' : result.status;
  if (result.status === 'ok') places.value = result.places;
}

/** Return to the panel with no list and no drawn boundaries. */
function clearPlaces() {
  placeType.value = null;
  placesStore.clearSelection();
  hideBoundaries();
}

/**
 * Select a place type, or clear it when that type is already selected.
 * Protected areas draws the stored boundaries. The other types have none.
 */
function selectPlaceType(type: PlaceTypeId) {
  if (placeType.value === type) {
    clearPlaces();
    return;
  }
  placeType.value = type;
  placesStore.clearSelection();
  if (type === 'protected_area') {
    showBoundaries();
    void ensureList();
    return;
  }
  hideBoundaries();
}

/**
 * Put a place chosen on the map at the top of the visible list.
 * An active search is cleared so the name is in the list.
 */
watch(
  () => [placesStore.selectedId, placesStore.selectedFrom] as const,
  async ([id, source]) => {
    if (!id || source !== 'map') return;
    query.value = '';
    await nextTick();
    const list = resultsList.value;
    const row = list?.querySelector<HTMLElement>(
      `[data-place-id="${CSS.escape(id)}"]`
    );
    if (!list || !row) return;
    const listTop = list.getBoundingClientRect().top;
    const rowTop = row.getBoundingClientRect().top;
    list.scrollTop += rowTop - listTop;
  }
);
</script>

<template>
  <div class="places-frame" :class="{ 'has-detail': placesStore.selectedId }">
    <div
      class="places-bar places-results map-panel nw"
      :class="{ 'has-results': placeType }"
    >
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
      <template v-if="placeType">
        <p
          v-if="showProtected && listStatus === 'loading'"
          class="places-status"
        >
          Loading places.
        </p>
        <p
          v-if="showProtected && placesStore.status === 'error'"
          class="places-status"
        >
          The places could not be drawn.
        </p>
        <p
          v-if="
            showProtected &&
            (placesStore.status === 'unconfigured' ||
              listStatus === 'unconfigured')
          "
          class="places-status"
        >
          The place store is not configured.
        </p>
        <p v-if="showProtected && listStatus === 'error'" class="places-status">
          The places could not be loaded.
        </p>
        <div v-if="!showProtected" class="places-list">
          <p class="places-status">{{ nothingStored }}</p>
        </div>
        <div
          v-else-if="listStatus === 'ok'"
          ref="resultsList"
          class="places-list"
        >
          <p
            v-if="places.length === 0 || shown.length === 0"
            class="places-status"
          >
            {{ emptyMessage }}
          </p>
          <ul v-else aria-label="Place results">
            <li
              v-for="place in shown"
              :key="place.id"
              :data-place-id="place.id"
            >
              <button
                type="button"
                class="place-result"
                :aria-current="
                  placesStore.selectedId === place.id ? 'true' : undefined
                "
                @click="placesStore.selectPlace(place.id)"
              >
                {{ place.name }}
              </button>
            </li>
          </ul>
        </div>
      </template>
    </div>
    <PlaceProfileComponent
      v-if="open && placesStore.selectedId"
      class="places-detail map-panel nw"
      :name="selectedName"
      @close="placesStore.clearSelection()"
      @zoom="props.zoomToPlace()"
    />
  </div>
</template>

<style scoped>
.places-frame {
  display: flex;
  align-items: stretch;
  gap: 0;
  max-height: calc(100dvh - 24px);
}

.places-frame.has-detail .places-results {
  border-right-width: 0;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.places-results {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  width: max-content;
  max-width: calc(100vw - 24px);
}

.places-results.has-results {
  max-height: calc(100dvh - 24px);
  min-height: 0;
  overflow: hidden;
}

.places-title,
.places-search,
.places-types,
.places-status {
  flex: none;
}

.places-title,
.places-search,
.places-list,
.places-status {
  width: 0;
  min-width: 100%;
}

.places-search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  min-height: 40px;
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
  margin: 0;
  padding: 0;
}

.place-result {
  display: block;
  width: 100%;
  margin: 0;
  padding: 10px 2px;
  border: 0;
  border-bottom: 1px solid #eeeeea;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  line-height: 1.4;
  text-align: left;
  overflow-wrap: anywhere;
  cursor: pointer;
}

.place-result:hover,
.place-result[aria-current='true'] {
  background: #f4f4f5;
}

.places-detail {
  width: 240px;
  flex: none;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

@media (max-width: 720px) {
  .places-frame {
    flex-direction: column;
  }

  .places-frame.has-detail .places-results {
    border-right-width: 1px;
    border-bottom-width: 0;
    border-radius: var(--map-panel-radius) var(--map-panel-radius) 0 0;
  }

  .places-detail {
    width: 100%;
    min-height: 120px;
    border-top-width: 0;
    border-radius: 0 0 var(--map-panel-radius) var(--map-panel-radius);
  }
}
</style>
