<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  ArrowDownUp,
  Check,
  Scan,
  Search,
  SlidersHorizontal,
} from '@lucide/vue';
import PlaceCard from '@/components/PlaceCard.vue';
import PlacesFilterDialog from '@/components/PlacesFilterDialog.vue';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  loadPilotPlaceFilterStats,
  loadPilotPlaceRank,
  loadPilotPlaceWindow,
  type PlaceSummary,
  type PlaceWindowQuery,
  PLACE_LIST_LIMIT,
  PLACE_TYPE,
} from '@/places/api';
import {
  CROPLAND_FULL,
  RECOGNITION_BUTTONS,
  isRecognitionButtonType,
  type RecognitionButtonType,
  type FigureRange,
  type PlaceSort,
} from '@/places/display';
import usePlacesStore from '@/store/PlacesStore';

const placesStore = usePlacesStore();

type PlaceTypeId =
  | 'protected_area'
  | 'ecoregion'
  | 'country'
  | RecognitionButtonType;

const mainTypes: { id: PlaceTypeId; label: string }[] = [
  { id: 'protected_area', label: 'Protected areas' },
  { id: 'ecoregion', label: 'Ecoregions' },
  { id: 'country', label: 'Countries' },
];

/** Whether More… has added the recognition buttons. */
const showMore = ref(false);
const placeTypes = computed(() =>
  showMore.value ? [...mainTypes, ...RECOGNITION_BUTTONS] : mainTypes
);

const placeType = ref<PlaceTypeId | null>(null);
/** The stored place type listed and drawn, or null when none is. */
const listedType = computed<string | null>(() => {
  if (placeType.value === 'protected_area') return PLACE_TYPE;
  if (isRecognitionButtonType(placeType.value)) return placeType.value;
  return null;
});

watch(
  listedType,
  type => {
    placesStore.listType = type;
    if (!placesStore.listingRecognitions) return;
    // Only the size filter applies to recognitions. It stays; cropland is cleared.
    if (
      placesStore.croplandKept[0] !== CROPLAND_FULL[0] ||
      placesStore.croplandKept[1] !== CROPLAND_FULL[1]
    )
      placesStore.applyFilter(placesStore.sizeKept, CROPLAND_FULL);
    if (sort.value.startsWith('cropland')) sort.value = 'size-desc';
  },
  { flush: 'sync' }
);
const listStatus = ref<'idle' | 'loading' | 'ok' | 'unconfigured' | 'error'>(
  'idle'
);
const nothingStored = 'Well, this is awkward. We have nothing to show.';
const places = ref<PlaceSummary[]>([]);
/** Matching rows before the first loaded one. A place's number is this plus its index plus one. */
const windowStart = ref(0);
const matchTotal = ref(0);
const storedCount = ref(0);
/** The place type whose filter charts are loaded. */
const statsType = ref<string | null>(null);
const sizeFull = ref<FigureRange>([1, 1]);
const sizeBins = ref<number[]>([]);
const croplandBins = ref<number[]>([]);
const query = ref('');
const listInView = ref(false);
const resultsList = ref<HTMLElement | null>(null);
const moreSentinel = ref<HTMLElement | null>(null);
const earlierSentinel = ref<HTMLElement | null>(null);
const loadingEarlier = ref(false);
const loadingMore = ref(false);
const moreExhausted = ref(false);
let listRequest = 0;
/** Cancels the list requests in flight when a newer list query starts. */
let listAbort: AbortController | null = null;

/**
 * Cancel the list requests in flight and start a new set.
 * @returns The signal for the new requests.
 */
function newListSignal(): AbortSignal {
  listAbort?.abort();
  listAbort = new AbortController();
  return listAbort.signal;
}
let listWait: ReturnType<typeof setTimeout> | null = null;
let moreObserver: IntersectionObserver | null = null;
const WINDOW_AHEAD = PLACE_LIST_LIMIT / 2;
const listWaitMs = import.meta.env.MODE === 'test' ? 0 : 200;

const needle = computed(() => query.value.trim());
const searchingAll = computed(
  () => placeType.value === null && needle.value.length > 0
);
const allSortOptions: { id: PlaceSort; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'size-desc', label: 'Size, largest first' },
  { id: 'size-asc', label: 'Size, smallest first' },
  { id: 'cropland-desc', label: 'Cropland %, highest first' },
  { id: 'cropland-asc', label: 'Cropland %, lowest first' },
];
/** Recognition lists sort by name and size only. */
const sortOptions = computed(() =>
  placesStore.listingRecognitions
    ? allSortOptions.filter(option => !option.id.startsWith('cropland'))
    : allSortOptions
);
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
  () => sortOptions.value.find(option => option.id === sort.value)?.label ?? ''
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
/** Whether a place type with stored places is listed. */
const showProtected = computed(() => listedType.value !== null);
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
 * @param offset - Matching rows to skip when loading the next page.
 * @returns Arguments for the bounded place query.
 */
function listQuery(offset = 0): PlaceWindowQuery {
  return {
    search: needle.value,
    searchPrefix: searchingAll.value,
    sort: sort.value,
    sizeMin: placesStore.sizeKept[0],
    sizeMax: placesStore.sizeKept[1],
    cropMin: placesStore.listingRecognitions ? 0 : placesStore.croplandKept[0],
    cropMax: placesStore.listingRecognitions
      ? 100
      : placesStore.croplandKept[1],
    extent: listExtent.value,
    offset,
    placeType: listedType.value ?? PLACE_TYPE,
  };
}

/**
 * The element that actually scrolls the cards.
 * On a narrow screen that is the whole Places column, not the list.
 * @returns The scroller, or null before the list is drawn.
 */
function listScroller(): HTMLElement | null {
  const list = resultsList.value;
  if (!list) return null;
  return getComputedStyle(list).overflowY === 'visible'
    ? (list.closest<HTMLElement>('.places-results') ?? list)
    : list;
}

/** Draw the protected areas when they are hidden. */
function showBoundaries() {
  if (!placesStore.visible) placesStore.toggle();
}

/**
 * Choose a place from the list. The boundaries are drawn, and Protected
 * areas is switched on, so the place shows on the map even when the list came
 * from a search.
 * @param id - The stored place id.
 */
function chooseResult(id: string) {
  if (placesStore.selectedId !== id) {
    // The boundaries are protected areas, so that type shows as on too
    if (placeType.value === null) placeType.value = 'protected_area';
    showBoundaries();
  }
  placesStore.selectPlace(id);
}

/** Remove the protected areas when they are drawn. */
function hideBoundaries() {
  if (placesStore.visible) placesStore.toggle();
}

/** Load the stored size range and chart counts once per listed type. */
async function ensureStats() {
  const type = listedType.value;
  if (!type || statsType.value === type) return;
  const result = await loadPilotPlaceFilterStats(type);
  if (result.status !== 'ok' || listedType.value !== type) return;
  statsType.value = type;
  storedCount.value = result.stats.placeCount;
  sizeFull.value = result.stats.sizeFull;
  sizeBins.value = result.stats.sizeBins;
  croplandBins.value = result.stats.croplandBins;
}

/** Load the names that match the current list query. */
async function refreshList() {
  if (!showProtected.value && !searchingAll.value) return;
  const request = ++listRequest;
  const signal = newListSignal();
  loadingMore.value = false;
  loadingEarlier.value = false;
  moreExhausted.value = false;
  const first = listStatus.value === 'idle';
  if (first) listStatus.value = 'loading';
  if (showProtected.value) await ensureStats();
  const result = await loadPilotPlaceWindow(listQuery(0), signal);
  if (request !== listRequest) return;
  listStatus.value = result.status === 'ok' ? 'ok' : result.status;
  if (result.status === 'ok') {
    places.value = result.places;
    windowStart.value = 0;
    matchTotal.value = result.total;
    await nextTick();
    const scroller = listScroller();
    if (scroller) scroller.scrollTop = 0;
  }
}

/** Load the next 50 when the end of the list is in view. */
async function loadMore() {
  if (loadingMore.value) return;
  if (listStatus.value !== 'ok') return;
  if (windowStart.value + places.value.length >= matchTotal.value) return;
  const request = listRequest;
  const offset = windowStart.value + places.value.length;
  loadingMore.value = true;
  const result = await loadPilotPlaceWindow(
    listQuery(offset),
    listAbort?.signal
  );
  if (request !== listRequest) return;
  loadingMore.value = false;
  if (result.status !== 'ok') return;
  matchTotal.value = result.total;
  const have = new Set(places.value.map(place => place.id));
  const extra = result.places.filter(place => !have.has(place.id));
  if (extra.length === 0) {
    moreExhausted.value = true;
    return;
  }
  places.value = [...places.value, ...extra];
}

/** Load the 50 rows before the first loaded one, keeping the view where it is. */
async function loadEarlier() {
  if (loadingEarlier.value || windowStart.value === 0) return;
  if (listStatus.value !== 'ok') return;
  const request = listRequest;
  const offset = Math.max(0, windowStart.value - PLACE_LIST_LIMIT);
  loadingEarlier.value = true;
  const result = await loadPilotPlaceWindow(
    listQuery(offset),
    listAbort?.signal
  );
  if (request !== listRequest) return;
  loadingEarlier.value = false;
  if (result.status !== 'ok') return;
  const have = new Set(places.value.map(place => place.id));
  const fresh = result.places.filter(place => !have.has(place.id));
  const scroller = listScroller();
  const before = scroller?.scrollHeight ?? 0;
  places.value = [...fresh, ...places.value];
  windowStart.value = offset;
  await nextTick();
  if (scroller) scroller.scrollTop += scroller.scrollHeight - before;
}

/**
 * Replace the list with the rows around a place, so the place keeps its
 * ranked position and the places before and after it are loaded.
 * @param id - The place to centre on.
 * @returns Whether the place is now in the list.
 */
async function loadAround(id: string): Promise<boolean> {
  const request = ++listRequest;
  const signal = newListSignal();
  const ranked = await loadPilotPlaceRank(listQuery(), id, signal);
  if (request !== listRequest) return false;
  if (ranked.status !== 'ok' || ranked.rank === null) return false;
  const offset = Math.max(0, ranked.rank - WINDOW_AHEAD);
  const result = await loadPilotPlaceWindow(listQuery(offset), signal);
  if (request !== listRequest || result.status !== 'ok') return false;
  loadingMore.value = false;
  loadingEarlier.value = false;
  moreExhausted.value = false;
  places.value = result.places;
  windowStart.value = offset;
  matchTotal.value = result.total;
  await nextTick();
  return result.places.some(place => place.id === id);
}

/** Watch the ends of the list so scrolling loads the rows beyond them. */
function watchMore() {
  moreObserver?.disconnect();
  moreObserver = null;
  const root = listScroller();
  if (typeof IntersectionObserver === 'undefined' || !root) return;
  const later = moreSentinel.value;
  const earlier = earlierSentinel.value;
  const hasLater =
    later &&
    !moreExhausted.value &&
    windowStart.value + places.value.length < matchTotal.value;
  const hasEarlier = earlier && windowStart.value > 0;
  if (!hasLater && !hasEarlier) return;
  moreObserver = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        if (entry.target === earlier) void loadEarlier();
        else void loadMore();
      });
    },
    { root, rootMargin: '80px' }
  );
  if (hasLater) moreObserver.observe(later);
  if (hasEarlier) moreObserver.observe(earlier);
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
      listedType.value,
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

/** Return to the panel with no list and no drawn boundaries. */
function clearPlaces() {
  placeType.value = null;
  listInView.value = false;
  placesStore.clearSelection();
  hideBoundaries();
}

/**
 * Select a place type, or clear it when that type is already selected.
 * Protected areas draws the stored boundaries, and a recognition type its
 * outlines. The other types have none.
 */
function selectPlaceType(type: PlaceTypeId) {
  if (placeType.value === type) {
    clearPlaces();
    return;
  }
  placeType.value = type;
  placesStore.clearSelection();
  if (type === 'protected_area' || isRecognitionButtonType(type)) {
    showBoundaries();
    return;
  }
  hideBoundaries();
}

/** Show or hide the recognition buttons. Less clears a selected one. */
function toggleMore() {
  showMore.value = !showMore.value;
  if (!showMore.value && isRecognitionButtonType(placeType.value))
    clearPlaces();
}

watch(
  () =>
    [
      places.value.length,
      windowStart.value,
      matchTotal.value,
      listStatus.value,
    ] as const,
  () => {
    void nextTick(watchMore);
  }
);

onBeforeUnmount(() => {
  listAbort?.abort();
  moreObserver?.disconnect();
  moreObserver = null;
});

/**
 * Scroll a place chosen on the map to the top of the list. When the place is
 * not loaded, load the rows around its ranked position first. The profile
 * opens either way.
 */
watch(
  () => [placesStore.selectedId, placesStore.selectedFrom] as const,
  async ([id, source]) => {
    if (!id || source !== 'map') return;
    if (!showProtected.value && !searchingAll.value) return;
    await nextTick();
    const find = () =>
      resultsList.value?.querySelector<HTMLElement>(
        `[data-place-id="${CSS.escape(id)}"]`
      );
    if (!find() && !(await loadAround(id))) return;
    if (placesStore.selectedId !== id) return;
    const list = resultsList.value;
    const row = find();
    if (!list || !row) return;
    const scroller = listScroller() ?? list;
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
          class="place-type map-control map-pill"
          :class="{ 'is-on': placeType === type.id }"
          :aria-pressed="placeType === type.id"
          @click="selectPlaceType(type.id)"
        >
          {{ type.label }}
        </button>
        <button
          type="button"
          class="place-type-more"
          :aria-expanded="showMore"
          @click="toggleMore"
        >
          {{ showMore ? 'Less' : 'More…' }}
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
                  class="places-tool map-control map-pill"
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
              class="places-tool places-filter-toggle map-control map-pill"
              :class="{ 'is-on': placesStore.filtering }"
              aria-haspopup="dialog"
              @click="filterOpen = true"
            >
              <SlidersHorizontal :size="16" aria-hidden="true" />
              Filter
            </button>
            <button
              type="button"
              class="places-tool places-extent-toggle map-control map-pill"
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
            :place-type="listedType ?? PLACE_TYPE"
            :size-only="placesStore.listingRecognitions"
          />
        </div>
        <div v-if="placeType && !showProtected" class="places-list">
          <p class="places-status">{{ nothingStored }}</p>
        </div>
        <div
          v-else-if="showNames && listStatus === 'ok'"
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
              v-if="windowStart > 0"
              ref="earlierSentinel"
              class="places-more"
              aria-hidden="true"
            />
            <li
              v-for="(place, index) in shown"
              :key="place.id"
              :data-place-id="place.id"
            >
              <span class="place-number" aria-hidden="true">
                {{ windowStart + index + 1 }}
              </span>
              <PlaceCard
                :name="place.name"
                :iso3="place.iso3"
                :area-km2="place.area_km2"
                :current="placesStore.selectedId === place.id"
                @click="chooseResult(place.id)"
              />
            </li>
          </ul>
          <div
            v-if="shown.length > 0 && windowStart + shown.length < matchTotal"
            ref="moreSentinel"
            class="places-more"
            aria-hidden="true"
          />
          <p v-if="loadingMore" class="places-status">Loading more places.</p>
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
  overscroll-behavior: contain;
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

/* A text link, so it does not read as another place type. */
.place-type-more {
  height: 32px;
  margin: 0;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--muted-foreground);
  font: inherit;
  font-size: 13px;
  text-decoration: underline;
  text-decoration-color: var(--border);
  text-underline-offset: 3px;
  cursor: pointer;
}

.place-type-more:hover {
  color: var(--foreground);
  text-decoration-color: currentColor;
}

.place-type-more:focus-visible {
  outline: 2px solid var(--foreground);
  outline-offset: 2px;
  border-radius: 4px;
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
  overscroll-behavior: contain;
}

/* The half-height column is too short to keep the header and a scrolling list. */
@media (max-width: 720px) {
  .places-results {
    overflow-y: auto;
    overscroll-behavior: contain;
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

.places-more {
  height: 1px;
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
</style>
