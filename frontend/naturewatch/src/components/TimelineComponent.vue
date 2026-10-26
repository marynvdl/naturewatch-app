<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import useTimelineStore from '@/store/TimelineStore';
import { timelineRange } from '@/catalog';

const timelineStore = useTimelineStore();
const row = ref<HTMLElement | null>(null);

const selectedYear = ref(timelineStore.activeYear);
const jumpYearIcon = ref('mdi-timer-sand-complete');

const yearKeys = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/**
 * Year selected when the current change started.
 * The slider reports every tick, so this is kept until the change settles.
 */
let pendingPrevious: number | null = null;

/** Keep the year from before a slider drag or click. Capture runs first. */
function beginGesture(event: PointerEvent) {
  const target = event.target;
  if (!(target instanceof Element) || !target.closest('.v-slider')) return;
  if (pendingPrevious === null) pendingPrevious = selectedYear.value;
}

/** Keep the year from before a keyboard step. Capture runs before the thumb moves. */
function beginKey(event: KeyboardEvent) {
  if (!yearKeys.has(event.key)) return;
  if (pendingPrevious === null) pendingPrevious = selectedYear.value;
}

/** Commit a keyboard step once the thumb has moved. */
function endKey(event: KeyboardEvent) {
  if (!yearKeys.has(event.key)) return;
  endGesture();
}

/**
 * Store the year from before this change, after the slider has settled.
 * The year watcher is deferred, so the read waits for that flush.
 */
function endGesture() {
  const origin = pendingPrevious;
  void nextTick(() => {
    if (pendingPrevious !== origin) return;
    pendingPrevious = null;
    const year = selectedYear.value;
    timelineStore.previewActiveYear(year);
    if (origin !== null && origin !== year) {
      timelineStore.setPreviousYear(origin);
    }
  });
}

/** Swap the selected year with the year that was selected before it. */
function jumpToPreviousYear() {
  const previous = timelineStore.lastActiveYear;
  const current = selectedYear.value;
  if (previous === current) return;
  pendingPrevious = null;
  timelineStore.setPreviousYear(current);
  timelineStore.previewActiveYear(previous);
  selectedYear.value = previous;
  jumpYearIcon.value =
    jumpYearIcon.value === 'mdi-timer-sand-complete'
      ? 'mdi-timer-sand'
      : 'mdi-timer-sand-complete';
}

watch(selectedYear, year => {
  timelineStore.previewActiveYear(year);
});

/** Note the year before a pointer drag. */
function onPointerDown(event: Event) {
  beginGesture(event as PointerEvent);
}

/** Note the year before a keyboard step. */
function onKeyDown(event: Event) {
  beginKey(event as KeyboardEvent);
}

/** Commit a keyboard step. */
function onKeyUp(event: Event) {
  endKey(event as KeyboardEvent);
}

onMounted(() => {
  const el = row.value;
  if (!el) return;
  el.addEventListener('pointerdown', onPointerDown, true);
  el.addEventListener('keydown', onKeyDown, true);
  el.addEventListener('keyup', onKeyUp);
});

onBeforeUnmount(() => {
  const el = row.value;
  if (!el) return;
  el.removeEventListener('pointerdown', onPointerDown, true);
  el.removeEventListener('keydown', onKeyDown, true);
  el.removeEventListener('keyup', onKeyUp);
});
</script>

<template>
  <div ref="row" class="timelineRow">
    <span class="year-readout">{{ selectedYear }}</span>
    <div class="timeline-container">
      <v-slider
        v-model="selectedYear"
        class="timeline"
        density="compact"
        hide-details
        :min="timelineRange.min"
        :max="timelineRange.max"
        :step="1"
        @end="endGesture"
      />
    </div>
    <v-btn
      size="x-small"
      variant="text"
      :icon="jumpYearIcon"
      aria-label="Jump between this year and the previous year"
      @click="jumpToPreviousYear"
    />
  </div>
</template>

<style scoped>
.timelineRow {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 8px 0 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #f8f9f9;
  flex-wrap: nowrap;
}

.year-readout {
  min-width: 2.6rem;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  color: #3a3935;
}

.timeline-container {
  width: 200px;
}
</style>
