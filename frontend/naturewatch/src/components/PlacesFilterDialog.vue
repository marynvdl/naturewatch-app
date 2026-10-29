<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { X } from '@lucide/vue';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { Slider } from '@/components/ui/slider';
import {
  CROPLAND_FULL,
  SIZE_STEPS,
  binCounts,
  filterPlaces,
  formatPercent,
  formatSizeInput,
  parseFigure,
  roundSize,
  sizeAtStep,
  sizeFraction,
  sizeStep,
  type FigureRange,
  type PlaceFigures,
  type SizeBounds,
} from '@/places/display';
import usePlacesStore from '@/store/PlacesStore';

const props = defineProps<{
  /** Places the filter counts, after any search. */
  places: PlaceFigures[];
  /** Smallest and largest stored size. */
  sizeFull: FigureRange;
}>();

const open = defineModel<boolean>('open', { required: true });

const placesStore = usePlacesStore();
const BINS = 40;

const sizeBounds = ref<SizeBounds>([null, null]);
const croplandKept = ref<FigureRange>([...CROPLAND_FULL]);

watch(open, isOpen => {
  if (!isOpen) return;
  sizeBounds.value = [...placesStore.sizeKept];
  croplandKept.value = [...placesStore.croplandKept];
});

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

const croplandSteps = computed(() => croplandKept.value.map(Math.round));

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
 * Follow the cropland slider. A thumb that did not move keeps its typed percent.
 * @param steps - Both thumbs, in whole percent.
 */
function slideCropland(steps: number[] | undefined) {
  if (!steps) return;
  croplandKept.value = [0, 1].map(end =>
    steps[end] === croplandSteps.value[end]
      ? croplandKept.value[end]
      : steps[end]
  ) as FigureRange;
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

/**
 * Take a typed cropland percent, kept between 0 and 100.
 * @param end - 0 for the minimum, 1 for the maximum.
 * @param event - The change or Enter on the box.
 */
async function typeCropland(end: 0 | 1, event: Event) {
  const input = event.target as HTMLInputElement;
  const typed = parseFigure(input.value);
  if (typed !== null) {
    const value = Math.min(CROPLAND_FULL[1], Math.round(typed * 10) / 10);
    const kept: FigureRange = [...croplandKept.value];
    kept[end] = end === 0 ? Math.min(value, kept[1]) : Math.max(value, kept[0]);
    croplandKept.value = kept;
  }
  await nextTick();
  input.value = formatPercent(croplandKept.value[end]);
}

const keptCount = computed(
  () =>
    filterPlaces(
      props.places,
      { kept: sizeKept.value, full: props.sizeFull },
      {
        kept: [croplandKept.value[0], croplandKept.value[1]],
        full: CROPLAND_FULL,
      }
    ).length
);

const showText = computed(
  () => `Show ${keptCount.value} ${keptCount.value === 1 ? 'place' : 'places'}`
);

/**
 * Bars for one chart, each marked when it sits inside the kept range.
 * Heights follow the square root of the count. Most places have almost no
 * cropland, and a linear scale would leave one bar and a row of slivers.
 * @param fractions - Each place's position along the slider, 0 to 1.
 * @param kept - The kept range, 0 to 1.
 * @returns Height in percent of the tallest bar, and whether it is kept.
 */
function bars(fractions: number[], kept: FigureRange) {
  const counts = binCounts(fractions, BINS);
  const tallest = Math.sqrt(Math.max(1, ...counts));
  return counts.map((count, index) => {
    const middle = (index + 0.5) / BINS;
    return {
      height: count ? Math.max(10, (Math.sqrt(count) / tallest) * 100) : 0,
      kept: middle >= kept[0] && middle <= kept[1],
    };
  });
}

const sizeBars = computed(() =>
  bars(
    props.places.flatMap(place =>
      place.area_km2 != null
        ? [sizeFraction(place.area_km2, props.sizeFull)]
        : []
    ),
    [
      sizeFraction(sizeKept.value[0], props.sizeFull),
      sizeFraction(sizeKept.value[1], props.sizeFull),
    ]
  )
);

const croplandBars = computed(() =>
  bars(
    props.places.flatMap(place =>
      place.cropland_percent != null ? [place.cropland_percent / 100] : []
    ),
    [croplandKept.value[0] / 100, croplandKept.value[1] / 100]
  )
);

/** Return the draft to every place. The panel stays open. */
function clearAll() {
  sizeBounds.value = [null, null];
  croplandKept.value = [...CROPLAND_FULL];
}

/** Apply the draft to the list and the map, and close. */
function apply() {
  placesStore.applyFilter(sizeBounds.value, croplandKept.value);
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
          Keep the protected areas within a size and cropland range. The list
          and the map follow.
        </DialogDescription>
        <div class="filter-body">
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
            class="filter-section"
            aria-labelledby="filter-cropland-title"
          >
            <h3 id="filter-cropland-title" class="filter-name">Cropland</h3>
            <p class="filter-hint">Share of the place under cropland, 2024.</p>
            <div class="filter-chart" aria-hidden="true">
              <span
                v-for="(bar, index) in croplandBars"
                :key="index"
                class="filter-bar"
                :class="{ 'is-kept': bar.kept }"
                :style="{ height: `${bar.height}%` }"
              />
            </div>
            <Slider
              :model-value="croplandSteps"
              class="filter-slider"
              :min="CROPLAND_FULL[0]"
              :max="CROPLAND_FULL[1]"
              :step="1"
              :min-steps-between-thumbs="1"
              aria-labelledby="filter-cropland-title"
              @update:model-value="slideCropland"
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
                <label class="filter-end-value" :for="`filter-cropland-${end}`">
                  <input
                    :id="`filter-cropland-${end}`"
                    class="filter-end-input"
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    :aria-label="`${end ? 'Maximum' : 'Minimum'} cropland, percent`"
                    :value="formatPercent(croplandKept[end])"
                    @change="typeCropland(end, $event)"
                    @keydown.enter.prevent="typeCropland(end, $event)"
                  />
                  <span class="filter-end-unit">%</span>
                </label>
              </div>
            </div>
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
