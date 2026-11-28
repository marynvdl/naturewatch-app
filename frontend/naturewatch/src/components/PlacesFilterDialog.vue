<script setup lang="ts">
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/ui/segmented-control';
import { REVIEW_VIEWS, type BoundaryReviewView } from '@/places/boundaryReview';
import { OVERLAP_VIEWS, type OverlapReviewView } from '@/places/overlapReview';
import { computed, nextTick, ref, watch } from 'vue';
import { Info, X } from '@lucide/vue';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import PlaceEcoregionsField from '@/components/PlaceEcoregionsField.vue';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { loadPilotPlaceWindowCount, type EcoregionName } from '@/places/api';
import {
  ECOREGION_TYPE,
  SIZE_STEPS,
  formatSizeInput,
  parseFigure,
  roundSize,
  sizeAtStep,
  sizeFraction,
  sizeStep,
  type FigureRange,
  type LngLatBounds,
  type SizeBounds,
} from '@/places/display';
import usePlacesStore from '@/store/PlacesStore';
import useAuthStore from '@/store/AuthStore';

const props = withDefaults(
  defineProps<{
    /** Smallest and largest stored size. */
    sizeFull: FigureRange;
    /** Stored size histogram, 40 bins on a log scale. */
    sizeBins: number[];
    /** Text typed in the list. */
    search: string;
    /** True when the list matches a name prefix. */
    searchPrefix: boolean;
    /** Map view while In view is on. */
    extent: LngLatBounds | null;
    /** Matching places for the applied filter. */
    matchedTotal: number;
    /** Stored place types the list shows. */
    placeTypes?: string[];
    /**
     * Stored place types the count covers: the listed ones, or every type
     * with a button while none is on.
     */
    countTypes?: string[];
  }>(),
  { placeTypes: undefined, countTypes: undefined }
);

const open = defineModel<boolean>('open', { required: true });

const placesStore = usePlacesStore();
const auth = useAuthStore();
const BINS = 40;

const sizeBounds = ref<SizeBounds>([null, null]);
const ecoregionsKept = ref<EcoregionName[]>([]);
/** The draft photo filter. */
const photosKept = ref(false);
/** The draft boundary review view, or `all` for none. */
const reviewKept = ref<BoundaryReviewView | 'all'>('all');
/** The draft link review view, or `all` for none. */
const linksKept = ref<OverlapReviewView | 'all'>('all');
/** The photo and boundary review filters, for admins in Edit mode. */
const showPhotos = computed(() => auth.isAdmin && auth.editMode);
const keptCount = ref(props.matchedTotal);
let countRequest = 0;

/** The draft review view for the list reads, or null. Admins in Edit mode only. */
const draftReview = computed<BoundaryReviewView | null>(() =>
  showPhotos.value && reviewKept.value !== 'all' ? reviewKept.value : null
);

/** The draft link review view for the list reads, or null. Admins in Edit mode only. */
const draftLinks = computed<OverlapReviewView | null>(() =>
  showPhotos.value && linksKept.value !== 'all' ? linksKept.value : null
);

/**
 * Choose a review view. Choosing the chosen one again keeps it. A view turns
 * the link review off, so one review filter is on at a time.
 * @param next - The view, or `all`.
 */
function setReview(next: unknown) {
  if (next === 'all' || REVIEW_VIEWS.some(view => view.id === next)) {
    reviewKept.value = next as BoundaryReviewView | 'all';
    if (next !== 'all') linksKept.value = 'all';
  }
}

/**
 * Choose a link review view. Choosing the chosen one again keeps it. A view
 * turns the boundary review off.
 * @param next - The view, or `all`.
 */
function setLinks(next: unknown) {
  if (next === 'all' || OVERLAP_VIEWS.some(view => view.id === next)) {
    linksKept.value = next as OverlapReviewView | 'all';
    if (next !== 'all') reviewKept.value = 'all';
  }
}

/** The Ecoregion field, for every listed type but Ecoregions. */
const showEcoregions = computed(
  () => !(props.placeTypes ?? []).includes(ECOREGION_TYPE)
);

watch(open, isOpen => {
  if (!isOpen) return;
  sizeBounds.value = [...placesStore.sizeKept];
  ecoregionsKept.value = [...placesStore.ecoregionsKept];
  photosKept.value = placesStore.photoSuggestions;
  reviewKept.value = placesStore.boundaryReview ?? 'all';
  linksKept.value = placesStore.overlapReview ?? 'all';
  keptCount.value = props.matchedTotal;
});

const description = computed(
  () =>
    `Keep the places within a size range${
      showEcoregions.value ? ', and in the chosen ecoregions' : ''
    }. The list and the map follow.`
);

/** The draft's ecoregions while the field shows. */
const draftEcoregionIds = computed(() =>
  showEcoregions.value ? ecoregionsKept.value.map(item => item.id) : []
);

const sizeKept = computed<FigureRange>(() => [
  sizeBounds.value[0] ?? props.sizeFull[0],
  sizeBounds.value[1] ?? props.sizeFull[1],
]);

const sizeSteps = computed(() => [
  sizeBounds.value[0] === null
    ? 0
    : sizeStep(sizeKept.value[0], props.sizeFull),
  sizeBounds.value[1] === null
    ? SIZE_STEPS
    : sizeStep(sizeKept.value[1], props.sizeFull),
]);

/**
 * Follow the size slider. A thumb that did not move keeps its typed size.
 * @param steps - Both thumbs, 0 to SIZE_STEPS.
 */
function slideSize(steps: number[] | undefined) {
  if (!steps) return;
  sizeBounds.value = [0, 1].map(end => {
    if (steps[end] === sizeSteps.value[end]) return sizeBounds.value[end];
    if (steps[end] === (end ? SIZE_STEPS : 0)) return null;
    return roundSize(sizeAtStep(steps[end], props.sizeFull));
  }) as SizeBounds;
}

/**
 * Take a typed size. Text that is not a number puts the last size back.
 * A size at or past the stored end leaves that end open.
 * @param end - 0 for the minimum, 1 for the maximum.
 * @param event - The change or Enter on the box.
 */
async function typeSize(end: 0 | 1, event: Event) {
  const input = event.target as HTMLInputElement;
  const typed = parseFigure(input.value);
  if (typed !== null) {
    const value = Math.round(typed * 100) / 100;
    const bounds: SizeBounds = [...sizeBounds.value];
    if (end === 0) {
      bounds[0] =
        value <= props.sizeFull[0] ? null : Math.min(value, sizeKept.value[1]);
    } else {
      bounds[1] =
        value >= props.sizeFull[1] ? null : Math.max(value, sizeKept.value[0]);
    }
    sizeBounds.value = bounds;
  }
  await nextTick();
  input.value = formatSizeInput(sizeKept.value[end]);
}

const showText = computed(
  () => `Show ${keptCount.value} ${keptCount.value === 1 ? 'place' : 'places'}`
);

/**
 * Bars for the size chart, each marked when it sits inside the kept range.
 * Heights follow the square root of the count, so a small group still shows.
 * @param counts - Stored counts, one per bin.
 * @param kept - The kept range, 0 to 1.
 * @returns Height in percent of the tallest bar, and whether it is kept.
 */
function bars(counts: number[], kept: FigureRange) {
  const tallest = Math.sqrt(Math.max(1, ...counts));
  return counts.map((count, index) => {
    const bins = Math.max(BINS, counts.length);
    const middle = (index + 0.5) / bins;
    return {
      height: count ? Math.max(10, (Math.sqrt(count) / tallest) * 100) : 0,
      kept: middle >= kept[0] && middle <= kept[1],
    };
  });
}

const sizeBars = computed(() =>
  bars(props.sizeBins, [
    sizeFraction(sizeKept.value[0], props.sizeFull),
    sizeFraction(sizeKept.value[1], props.sizeFull),
  ])
);

watch(
  () =>
    [
      open.value,
      sizeKept.value[0],
      sizeKept.value[1],
      props.search,
      props.searchPrefix,
      props.extent,
      draftEcoregionIds.value.join(','),
      (props.countTypes ?? props.placeTypes ?? []).join(','),
      photosKept.value,
      reviewKept.value,
      linksKept.value,
    ] as const,
  async ([isOpen]) => {
    if (!isOpen) return;
    const request = ++countRequest;
    const result = await loadPilotPlaceWindowCount({
      search: props.search,
      searchPrefix: props.searchPrefix,
      sizeMin: sizeBounds.value[0],
      sizeMax: sizeBounds.value[1],
      cropMin: 0,
      cropMax: 100,
      extent: props.extent,
      placeTypes: props.countTypes ?? props.placeTypes,
      ecoregionIds: draftEcoregionIds.value,
      photoSuggestions: showPhotos.value && photosKept.value,
      boundaryReview: draftReview.value,
      overlapReview: draftLinks.value,
    });
    if (request !== countRequest) return;
    if (result.status === 'ok') keptCount.value = result.total;
  }
);

/** Return the draft to every place. The panel stays open. */
function clearAll() {
  sizeBounds.value = [null, null];
  ecoregionsKept.value = [];
  photosKept.value = false;
  reviewKept.value = 'all';
  linksKept.value = 'all';
}

/**
 * Apply the draft to the list and the map, and close. With a type on, the map
 * then flies to the places the filter keeps.
 */
function apply() {
  placesStore.applyFilter(
    sizeBounds.value,
    showEcoregions.value ? ecoregionsKept.value : placesStore.ecoregionsKept,
    showPhotos.value && photosKept.value,
    draftReview.value,
    draftLinks.value
  );
  placesStore.fitToKept();
  open.value = false;
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="filter-overlay" />
      <DialogContent class="filter-dialog nw">
        <header class="filter-head">
          <DialogTitle class="filter-title">Filters</DialogTitle>
          <DialogClose
            class="filter-close map-control map-icon"
            aria-label="Close filters"
          >
            <X aria-hidden="true" />
          </DialogClose>
        </header>
        <DialogDescription class="filter-sr">
          {{ description }}
        </DialogDescription>
        <div class="filter-body">
          <section class="filter-section" aria-labelledby="filter-types-title">
            <h3 id="filter-types-title" class="filter-name filter-name-spaced">
              Place types
            </h3>
            <slot name="types" />
          </section>
          <section class="filter-section" aria-labelledby="filter-size-title">
            <h3 id="filter-size-title" class="filter-name">Size</h3>
            <p class="filter-hint">Area of the place, in km².</p>
            <div class="filter-chart" aria-hidden="true">
              <span
                v-for="(bar, index) in sizeBars"
                :key="index"
                class="filter-bar"
                :class="{ 'is-kept': bar.kept }"
                :style="{ height: `${bar.height}%` }"
              />
            </div>
            <Slider
              :model-value="sizeSteps"
              class="filter-slider"
              :min="0"
              :max="SIZE_STEPS"
              :step="1"
              :min-steps-between-thumbs="1"
              aria-labelledby="filter-size-title"
              @update:model-value="slideSize"
            />
            <div class="filter-ends">
              <div
                v-for="end in [0, 1] as const"
                :key="end"
                class="filter-end"
                :class="{ 'is-max': end === 1 }"
              >
                <span class="filter-end-label">
                  {{ end ? 'Maximum' : 'Minimum' }}
                </span>
                <label class="filter-end-value" :for="`filter-size-${end}`">
                  <input
                    :id="`filter-size-${end}`"
                    class="filter-end-input"
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    :aria-label="`${end ? 'Maximum' : 'Minimum'} size, km²`"
                    :value="formatSizeInput(sizeKept[end])"
                    @change="typeSize(end, $event)"
                    @keydown.enter.prevent="typeSize(end, $event)"
                  />
                  <span class="filter-end-unit">km²</span>
                </label>
              </div>
            </div>
          </section>
          <section
            v-if="showEcoregions"
            class="filter-section"
            aria-labelledby="filter-ecoregion-title"
          >
            <div class="filter-name-row">
              <h3 id="filter-ecoregion-title" class="filter-name">Ecoregion</h3>
              <button
                type="button"
                class="filter-info"
                aria-label="About the Ecoregion filter"
                aria-describedby="filter-ecoregion-info"
              >
                <Info :size="16" aria-hidden="true" />
                <span
                  id="filter-ecoregion-info"
                  role="tooltip"
                  class="filter-info-text"
                >
                  Places with at least 10% of their area inside one of them.
                </span>
              </button>
            </div>
            <PlaceEcoregionsField
              v-model="ecoregionsKept"
              labelledby="filter-ecoregion-title"
            />
          </section>
          <section
            v-if="showPhotos"
            class="filter-section"
            aria-labelledby="filter-photos-title"
          >
            <h3 id="filter-photos-title" class="filter-name filter-name-spaced">
              Photos
            </h3>
            <div class="filter-switch">
              <label for="filter-photos">Has photo suggestions</label>
              <Switch
                id="filter-photos"
                v-model="photosKept"
                class="nw:data-[state=checked]:bg-foreground"
              />
            </div>
          </section>
          <section
            v-if="showPhotos"
            class="filter-section"
            aria-labelledby="filter-review-title"
          >
            <h3 id="filter-review-title" class="filter-name filter-name-spaced">
              Boundary review
            </h3>
            <SegmentedControl
              :model-value="reviewKept"
              type="single"
              variant="outline"
              size="sm"
              aria-labelledby="filter-review-title"
              @update:model-value="setReview"
            >
              <SegmentedControlItem value="all">All</SegmentedControlItem>
              <SegmentedControlItem
                v-for="view in REVIEW_VIEWS"
                :key="view.id"
                :value="view.id"
              >
                {{ view.label }}
              </SegmentedControlItem>
            </SegmentedControl>
          </section>
          <section
            v-if="showPhotos"
            class="filter-section"
            aria-labelledby="filter-links-title"
          >
            <h3 id="filter-links-title" class="filter-name filter-name-spaced">
              Link review
            </h3>
            <SegmentedControl
              :model-value="linksKept"
              type="single"
              variant="outline"
              size="sm"
              aria-labelledby="filter-links-title"
              @update:model-value="setLinks"
            >
              <SegmentedControlItem value="all">All</SegmentedControlItem>
              <SegmentedControlItem
                v-for="view in OVERLAP_VIEWS"
                :key="view.id"
                :value="view.id"
              >
                {{ view.label }}
              </SegmentedControlItem>
            </SegmentedControl>
          </section>
        </div>
        <footer class="filter-foot">
          <button type="button" class="filter-clear" @click="clearAll">
            Clear all
          </button>
          <button
            type="button"
            class="filter-show map-control is-on"
            @click="apply"
          >
            {{ showText }}
          </button>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.filter-overlay {
  position: fixed;
  inset: 0;
  z-index: 1300;
  background: rgba(36, 49, 44, 0.35);
}

.filter-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 1301;
  display: flex;
  flex-direction: column;
  width: min(560px, calc(100vw - 32px));
  max-height: min(720px, calc(100dvh - 32px));
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--background);
  transform: translate(-50%, -50%);
}

.filter-dialog:focus-visible {
  outline: none;
}

.filter-head {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  height: 60px;
  padding: 0 60px;
  border-bottom: 1px solid var(--border);
}

.filter-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.filter-close {
  position: absolute;
  top: 12px;
  right: 12px;
  cursor: pointer;
}

.filter-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.filter-body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 24px;
  overflow-y: auto;
}

.filter-section {
  padding: 24px 0;
}

.filter-section + .filter-section {
  border-top: 1px solid var(--border);
}

.filter-name {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
}

.filter-hint {
  margin: 4px 0 16px;
  font-size: 13px;
  color: var(--muted-foreground);
}

.filter-name-spaced {
  margin-bottom: 16px;
}

.filter-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  font-size: 14px;
}

.filter-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

/* The hint shows beside the icon on hover or keyboard focus. */
.filter-info {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted-foreground);
  cursor: help;
}

.filter-info:hover,
.filter-info:focus-visible {
  background: var(--muted);
  color: var(--foreground);
}

.filter-info:focus-visible {
  outline: 2px solid var(--foreground, #24312c);
  outline-offset: 2px;
}

.filter-info-text {
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  z-index: 1;
  width: max-content;
  max-width: 240px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--foreground, #24312c);
  color: var(--background, #fff);
  font-size: 12px;
  line-height: 1.4;
  text-align: left;
  pointer-events: none;
  opacity: 0;
  transition: opacity 120ms;
}

.filter-info:hover .filter-info-text,
.filter-info:focus-visible .filter-info-text {
  opacity: 1;
}

/* Inset by half a thumb so the bars line up with the slider values. */
.filter-chart {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 64px;
  padding: 0 8px;
}

.filter-bar {
  flex: 1 1 0;
  min-width: 0;
  border-radius: 2px 2px 0 0;
  background: var(--border);
}

.filter-bar.is-kept {
  background: var(--foreground);
}

.filter-slider {
  margin-top: 6px;
}

.filter-ends {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-top: 16px;
}

.filter-end {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}

.filter-end.is-max {
  align-items: flex-end;
}

.filter-end-label {
  font-size: 12px;
  color: var(--muted-foreground);
}

.filter-end-value {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 14px;
  cursor: text;
}

.filter-end-value:focus-within {
  outline: 2px solid var(--foreground);
  outline-offset: 2px;
}

.filter-end-input {
  width: 9ch;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--foreground);
  font: inherit;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.filter-end-input:focus {
  outline: none;
}

.filter-end-unit {
  color: var(--muted-foreground);
}

.filter-foot {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}

.filter-clear {
  padding: 8px 0;
  border: 0;
  background: transparent;
  color: var(--foreground);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.filter-show {
  height: 44px;
  padding: 0 20px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
}
</style>
