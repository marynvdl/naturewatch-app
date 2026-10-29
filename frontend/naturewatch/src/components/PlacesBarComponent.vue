<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  ArrowDownUp,
  Check,
  Image,
  Scan,
  Search,
  SlidersHorizontal,
} from '@lucide/vue';
import PlacesFilterDialog from '@/components/PlacesFilterDialog.vue';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  loadPilotPlaceFilterStats,
  loadPilotPlaceKeptIds,
  loadPilotPlaceWindow,
  type PlaceSummary,
  type PlaceWindowQuery,
} from '@/places/api';
import {
  countryName,
  formatAreaTag,
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
const matchTotal = ref(0);
const storedCount = ref(0);
const statsReady = ref(false);
const sizeFull = ref<FigureRange>([1, 1]);
const sizeBins = ref<number[]>([]);
const croplandBins = ref<number[]>([]);
const query = ref('');
const listInView = ref(false);
const resultsList = ref<HTMLElement | null>(null);
let listRequest = 0;
let listWait: ReturnType<typeof setTimeout> | null = null;
const listWaitMs = import.meta.env.MODE === 'test' ? 0 : 200;

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
const sort = ref<PlaceSort>('size-desc');
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

/** Limit the list to the current map view, or show the worldwide window. */
function toggleListInView() {
  listInView.value = !listInView.value;
}

const shown = computed(() => places.value);
const emptyMessage = computed(() =>
  storedCount.value === 0 && !placesStore.filtering && !needle.value
    ? nothingStored
    : 'No places match.'
);
const showProtected = computed(() => placeType.value === 'protected_area');
const showTools = computed(
  () =>
    showProtected.value &&
    listStatus.value === 'ok' &&
    (storedCount.value > 0 || matchTotal.value > 0 || placesStore.filtering)
);
const countText = computed(() => {
  const total = matchTotal.value;
  const count = shown.value.length;
  const noun = total === 1 ? 'place' : 'places';
  return count === total ? `${total} ${noun}` : `${count} of ${total} ${noun}`;
});
const showNames = computed(() => showProtected.value || searchingAll.value);
const listExtent = computed(() =>
  listInView.value ? placesStore.viewBounds : null
);

/**
 * The list query for the current search, sort, filters, and extent.
 * @returns Arguments for the bounded place query.
 */
function listQuery(): PlaceWindowQuery {
  return {
    search: needle.value,
    searchPrefix: searchingAll.value,
    sort: sort.value,
    sizeMin: placesStore.sizeKept[0],
    sizeMax: placesStore.sizeKept[1],
    cropMin: placesStore.croplandKept[0],
    cropMax: placesStore.croplandKept[1],
    extent: listExtent.value,
  };
}

/** Draw the protected areas when they are hidden. */
function showBoundaries() {
  if (!placesStore.visible) placesStore.toggle();
}

/** Remove the protected areas when they are drawn. */
function hideBoundaries() {
  if (placesStore.visible) placesStore.toggle();
}

/** Load the stored size range and chart counts once. */
async function ensureStats() {
  if (statsReady.value) return;
  const result = await loadPilotPlaceFilterStats();
  if (result.status !== 'ok') return;
  statsReady.value = true;
  storedCount.value = result.stats.placeCount;
  sizeFull.value = result.stats.sizeFull;
  sizeBins.value = result.stats.sizeBins;
  croplandBins.value = result.stats.croplandBins;
}

/** Load the names that match the current list query. */
async function refreshList() {
  if (!showProtected.value && !searchingAll.value) return;
  const request = ++listRequest;
  const first = listStatus.value === 'idle';
  if (first) listStatus.value = 'loading';
  if (showProtected.value) await ensureStats();
  const result = await loadPilotPlaceWindow(listQuery());
  if (request !== listRequest) return;
  listStatus.value = result.status === 'ok' ? 'ok' : result.status;
  if (result.status === 'ok') {
    places.value = result.places;
    matchTotal.value = result.total;
  }
}

/** Wait for typing or a map move before querying again. */
function scheduleList() {
  if (listWaitMs === 0) {
    void refreshList();
    return;
  }
  if (listWait) clearTimeout(listWait);
  listWait = setTimeout(() => {
    listWait = null;
    void refreshList();
  }, listWaitMs);
}

watch(
  () =>
    [
      placeType.value,
      needle.value,
      searchingAll.value,
      sort.value,
      placesStore.sizeKept[0],
      placesStore.sizeKept[1],
      placesStore.croplandKept[0],
      placesStore.croplandKept[1],
      listInView.value,
      listExtent.value,
    ] as const,
  (next, previous) => {
    if (!showProtected.value && !searchingAll.value) return;
    const moved =
      previous != null && next[8] === previous[8] && next[9] !== previous[9];
    const typed =
      previous != null &&
      next[1] !== previous[1] &&
      next[0] === previous[0] &&
      next[3] === previous[3] &&
      next[8] === previous[8];
    if (moved || typed) scheduleList();
    else void refreshList();
  }
);

watch(
  () =>
    [
      placesStore.filtering,
      placesStore.sizeKept[0],
      placesStore.sizeKept[1],
      placesStore.croplandKept[0],
      placesStore.croplandKept[1],
    ] as const,
  async () => {
    if (!placesStore.filtering) {
      placesStore.keptIds = null;
      return;
    }
    const result = await loadPilotPlaceKeptIds(
      placesStore.sizeKept[0],
      placesStore.sizeKept[1],
      placesStore.croplandKept
    );
    if (result.status === 'ok') placesStore.keptIds = result.ids;
  }
);

/** Return to the panel with no list and no drawn boundaries. */
function clearPlaces() {
  placeType.value = null;
  listInView.value = false;
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
    return;
  }
  hideBoundaries();
}

/**
 * Scroll a place chosen on the map to the top of the list when it is in the
 * window. The profile opens either way.
 */
watch(
  () => [placesStore.selectedId, placesStore.selectedFrom] as const,
  async ([id, source]) => {
    if (!id || source !== 'map') return;
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
          <div class="places-tool-buttons">
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
            <button
              type="button"
              class="places-tool places-extent-toggle map-control"
              :class="{ 'is-on': listInView }"
              :aria-pressed="listInView"
              aria-label="Limit list to the map view"
              @click="toggleListInView"
            >
              <Scan :size="16" aria-hidden="true" />
              In view
            </button>
          </div>
          <p class="places-count">{{ countText }}</p>
          <PlacesFilterDialog
            v-model:open="filterOpen"
            :size-full="sizeFull"
            :size-bins="sizeBins"
            :cropland-bins="croplandBins"
            :search="needle"
            :search-prefix="searchingAll"
            :extent="listExtent"
            :matched-total="matchTotal"
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
              v-for="(place, index) in shown"
              :key="place.id"
              :data-place-id="place.id"
            >
              <span class="place-number" aria-hidden="true">
                {{ index + 1 }}
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
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.places-tool-buttons {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
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
