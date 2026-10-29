<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  ArrowDownUp,
  Check,
  Image,
  Search,
  SlidersHorizontal,
} from '@lucide/vue';
import PlacesFilterDialog from '@/components/PlacesFilterDialog.vue';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { loadPilotPlaces, type PlaceSummary } from '@/places/api';
import {
  CROPLAND_FULL,
  countryName,
  filterPlaces,
  formatAreaTag,
  placesMatching,
  sortPlaces,
  type FigureRange,
  type PlaceSort,
} from '@/places/display';
import usePlacesStore from '@/store/PlacesStore';

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

const needle = computed(() => query.value.trim());
const searchingAll = computed(
  () => placeType.value === null && needle.value.length > 0
);
const sortOptions: { id: PlaceSort; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'size-desc', label: 'Size, largest first' },
  { id: 'size-asc', label: 'Size, smallest first' },
  { id: 'cropland-desc', label: 'Cropland %, highest first' },
  { id: 'cropland-asc', label: 'Cropland %, lowest first' },
];
const sort = ref<PlaceSort>('name');
const sortOpen = ref(false);
const filterOpen = ref(false);
const filterButton = ref<HTMLButtonElement | null>(null);

watch(filterOpen, async open => {
  if (open) return;
  await nextTick();
  filterButton.value?.focus();
});
const sortLabel = computed(
  () => sortOptions.find(option => option.id === sort.value)?.label ?? ''
);

/**
 * Choose an order and close the menu.
 * @param id - The order.
 */
function chooseSort(id: PlaceSort) {
  sort.value = id;
  sortOpen.value = false;
}

const sizeFull = computed<FigureRange>(() => {
  const areas = places.value.flatMap(place =>
    place.area_km2 != null ? [place.area_km2] : []
  );
  if (areas.length === 0) return [1, 1];
  return [Math.min(...areas), Math.max(...areas)];
});

/**
 * Places the applied filter keeps.
 * @param pool - Places to filter.
 * @returns The places kept, in the same order.
 */
function keptBy<T extends PlaceSummary>(pool: T[]): T[] {
  const [low, high] = placesStore.sizeKept;
  return filterPlaces(
    pool,
    {
      kept: [low ?? sizeFull.value[0], high ?? sizeFull.value[1]],
      full: sizeFull.value,
    },
    { kept: placesStore.croplandKept, full: CROPLAND_FULL }
  );
}

watch(
  () => [places.value, placesStore.sizeKept, placesStore.croplandKept],
  () => {
    if (places.value.length === 0) return;
    placesStore.keptIds = placesStore.filtering
      ? keptBy(places.value).map(place => place.id)
      : null;
  },
  { immediate: true }
);

const searched = computed(() => placesMatching(places.value, query.value));

/** Each place's number in the filtered and sorted list, before any search. */
const ranks = computed(
  () =>
    new Map(
      sortPlaces(keptBy(places.value), sort.value).map((place, index) => [
        place.id,
        index + 1,
      ])
    )
);

const shown = computed(() => {
  if (searchingAll.value) {
    const prefix = needle.value.toLocaleLowerCase();
    return places.value.filter(place =>
      place.name.toLocaleLowerCase().startsWith(prefix)
    );
  }
  return sortPlaces(keptBy(searched.value), sort.value);
});
const emptyMessage = computed(() =>
  places.value.length === 0 ? nothingStored : 'No places match.'
);
const showProtected = computed(() => placeType.value === 'protected_area');
const showTools = computed(
  () =>
    showProtected.value && listStatus.value === 'ok' && places.value.length > 0
);
const countText = computed(() => {
  const total = places.value.length;
  const count = shown.value.length;
  const noun = total === 1 ? 'place' : 'places';
  return count === total ? `${total} ${noun}` : `${count} of ${total} ${noun}`;
});
const showNames = computed(() => showProtected.value || searchingAll.value);

/** Draw the protected areas when they are hidden. */
function showBoundaries() {
  if (!placesStore.visible) placesStore.toggle();
}

/** Remove the protected areas when they are drawn. */
function hideBoundaries() {
  if (placesStore.visible) placesStore.toggle();
}

watch(needle, value => {
  if (placeType.value || !value) return;
  void ensureList();
});

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
 * An active search or filter is cleared so the name is in the list.
 */
watch(
  () => [placesStore.selectedId, placesStore.selectedFrom] as const,
  async ([id, source]) => {
    if (!id || source !== 'map') return;
    query.value = '';
    if (!shown.value.some(place => place.id === id)) placesStore.clearFilter();
    await nextTick();
    const list = resultsList.value;
    const row = list?.querySelector<HTMLElement>(
      `[data-place-id="${CSS.escape(id)}"]`
    );
    if (!list || !row) return;
    const scroller =
      getComputedStyle(list).overflowY === 'visible'
        ? (list.closest<HTMLElement>('.places-results') ?? list)
        : list;
    const top = Math.max(
      scroller.getBoundingClientRect().top,
      list.getBoundingClientRect().top
    );
    scroller.scrollTop += row.getBoundingClientRect().top - top;
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
          placeholder="Search places"
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
      <template v-if="placeType || searchingAll">
        <p v-if="showNames && listStatus === 'loading'" class="places-status">
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
            showNames &&
            (placesStore.status === 'unconfigured' ||
              listStatus === 'unconfigured')
          "
          class="places-status"
        >
          The place store is not configured.
        </p>
        <p v-if="showNames && listStatus === 'error'" class="places-status">
          The places could not be loaded.
        </p>
        <div v-if="showTools" class="places-tools">
          <Popover v-model:open="sortOpen">
            <PopoverTrigger as-child>
              <button
                type="button"
                class="places-tool map-control"
                :aria-label="`Sort places, ${sortLabel}`"
              >
                <ArrowDownUp :size="16" aria-hidden="true" />
                Sort
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              class="places-sort-menu nw:z-[1200] nw:w-60 nw:gap-0 nw:p-1 nw:shadow-none"
            >
              <div role="radiogroup" aria-label="Sort places">
                <button
                  v-for="option in sortOptions"
                  :key="option.id"
                  type="button"
                  role="radio"
                  class="places-sort-option"
                  :aria-checked="sort === option.id"
                  @click="chooseSort(option.id)"
                >
                  {{ option.label }}
                  <Check
                    v-if="sort === option.id"
                    :size="16"
                    aria-hidden="true"
                  />
                </button>
              </div>
            </PopoverContent>
          </Popover>
          <button
            ref="filterButton"
            type="button"
            class="places-tool places-filter-toggle map-control"
            :class="{ 'is-on': placesStore.filtering }"
            aria-haspopup="dialog"
            @click="filterOpen = true"
          >
            <SlidersHorizontal :size="16" aria-hidden="true" />
            Filter
          </button>
          <p class="places-count">{{ countText }}</p>
          <PlacesFilterDialog
            v-model:open="filterOpen"
            :places="searched"
            :size-full="sizeFull"
          />
        </div>
        <div v-if="placeType && !showProtected" class="places-list">
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
              <span class="place-number" aria-hidden="true">
                {{ ranks.get(place.id) }}
              </span>
              <button
                type="button"
                class="place-result"
                :aria-current="
                  placesStore.selectedId === place.id ? 'true' : undefined
                "
                @click="placesStore.selectPlace(place.id)"
              >
                <span class="place-thumb" aria-hidden="true">
                  <Image :size="20" :stroke-width="1.25" />
                </span>
                <span class="place-card-text">
                  <span class="place-card-name" :title="place.name">
                    {{ place.name }}
                  </span>
                  <span v-if="place.iso3" class="place-card-meta">
                    {{ countryName(place.iso3) }}
                  </span>
                  <span v-if="place.area_km2 != null" class="place-card-area">
                    {{ formatAreaTag(place.area_km2) }} km²
                  </span>
                </span>
              </button>
            </li>
          </ul>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.places-frame {
  display: flex;
  align-items: stretch;
  gap: 0;
  height: var(--places-list-height, 100dvh);
  max-height: 100dvh;
}

@media (min-width: 721px) {
  .places-frame.has-detail .places-results {
    border-right-width: 0;
  }
}

.places-results {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  width: var(--place-column, 360px);
  height: 100%;
  max-width: 100vw;
  min-height: 0;
  overflow: hidden;
  border-radius: 0;
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

.places-title {
  padding-right: 40px;
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
  flex-wrap: wrap;
  gap: 8px;
}

.place-type {
  white-space: nowrap;
}

.places-status {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

/* Reaches into the left padding, which a scrolling box would otherwise clip. */
.places-list {
  flex: 1 1 auto;
  min-width: calc(100% + var(--map-panel-padding));
  min-height: 0;
  margin-left: calc(-1 * var(--map-panel-padding));
  padding-left: var(--map-panel-padding);
  overflow-y: auto;
}

/* The half-height column is too short to keep the header and a scrolling list. */
@media (max-width: 720px) {
  .places-results {
    overflow-y: auto;
  }

  /* The close circle sits on the heading, so the heading stays put. */
  .places-title {
    position: sticky;
    top: calc(-1 * var(--map-panel-padding));
    z-index: 1;
    margin: calc(-1 * var(--map-panel-padding)) 0 0;
    padding-top: var(--map-panel-padding);
    padding-bottom: 8px;
    background: var(--background);
  }

  .places-list {
    flex: none;
    overflow: visible;
  }
}

.places-tools {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.places-tool {
  flex: none;
  font-family: inherit;
  cursor: pointer;
}

.places-sort-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--foreground);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.places-sort-option:hover,
.places-sort-option:focus-visible {
  background: var(--accent);
  outline: none;
}

.places-sort-option[aria-checked='true'] {
  font-weight: 500;
}

.places-count {
  margin: 0 0 0 auto;
  font-size: 12px;
  color: var(--muted-foreground);
  white-space: nowrap;
}

.places-list ul {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 2px 0 8px;
  list-style: none;
}

.places-list li {
  position: relative;
  margin: 0;
  padding: 0;
}

/* The number sits in the panel padding, so the cards line up with the buttons. */
.place-number {
  position: absolute;
  top: 12px;
  right: 100%;
  width: var(--map-panel-padding);
  padding-right: 5px;
  font-size: 11px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--muted-foreground);
}

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
