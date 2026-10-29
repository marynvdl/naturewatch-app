<script setup lang="ts">
import { computed, ref, watch } from 'vue';
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
  formatAreaTag,
  formatPercent,
  sizeAtStep,
  sizeFraction,
  type FigureRange,
  type PlaceFigures,
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

const sizeSteps = ref<number[]>([0, SIZE_STEPS]);
const croplandKept = ref<number[]>([...CROPLAND_FULL]);

watch(open, isOpen => {
  if (!isOpen) return;
  sizeSteps.value = [...placesStore.sizeSteps];
  croplandKept.value = [...placesStore.croplandKept];
});

const sizeKept = computed<FigureRange>(() => [
  sizeAtStep(sizeSteps.value[0], props.sizeFull),
  sizeAtStep(sizeSteps.value[1], props.sizeFull),
]);

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
    [sizeSteps.value[0] / SIZE_STEPS, sizeSteps.value[1] / SIZE_STEPS]
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
  sizeSteps.value = [0, SIZE_STEPS];
  croplandKept.value = [...CROPLAND_FULL];
}

/** Apply the draft to the list and the map, and close. */
function apply() {
  placesStore.applyFilter(
    [sizeSteps.value[0], sizeSteps.value[1]],
    [croplandKept.value[0], croplandKept.value[1]]
  );
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
              v-model="sizeSteps"
              class="filter-slider"
              :min="0"
              :max="SIZE_STEPS"
              :step="1"
              :min-steps-between-thumbs="1"
              aria-labelledby="filter-size-title"
            />
            <div class="filter-ends">
              <p class="filter-end">
                <span class="filter-end-label">Minimum</span>
                <span class="filter-end-value">
                  {{ formatAreaTag(sizeKept[0]) }} km²
                </span>
              </p>
              <p class="filter-end is-max">
                <span class="filter-end-label">Maximum</span>
                <span class="filter-end-value">
                  {{ formatAreaTag(sizeKept[1]) }} km²
                </span>
              </p>
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
              v-model="croplandKept"
              class="filter-slider"
              :min="CROPLAND_FULL[0]"
              :max="CROPLAND_FULL[1]"
              :step="1"
              :min-steps-between-thumbs="1"
              aria-labelledby="filter-cropland-title"
            />
            <div class="filter-ends">
              <p class="filter-end">
                <span class="filter-end-label">Minimum</span>
                <span class="filter-end-value">
                  {{ formatPercent(croplandKept[0]) }}%
                </span>
              </p>
              <p class="filter-end is-max">
                <span class="filter-end-label">Maximum</span>
                <span class="filter-end-value">
                  {{ formatPercent(croplandKept[1]) }}%
                </span>
              </p>
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
  min-width: 96px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  text-align: center;
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
