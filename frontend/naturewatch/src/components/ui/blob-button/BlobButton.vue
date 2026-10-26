<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import { nubShift, type BlobEdge } from './blobPath';

/**
 * Round open and close control.
 * Size, colour, hover, breathing, and duration come from visual.css:
 * --blob-size, --blob-color, --blob-hover, --blob-breathe, --blob-duration.
 */
const props = defineProps<{
  label: string;
  edge: BlobEdge;
  expanded: boolean;
  panelId: string;
  image: string;
}>();

const emit = defineEmits<{
  toggle: [];
}>();

const anchor = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const showPanel = ref(false);
const hovering = ref(false);
const animating = ref(false);
const reduced = ref(false);
const awake = ref(true);
const blobSize = ref(112);
const shiftX = ref(0);
const shiftY = ref(0);
const panelTop = ref('auto');
const panelRight = ref('auto');
const panelBottom = ref('auto');
const panelLeft = ref('auto');

let revealTimer = 0;
let reduceQuery: MediaQueryList | null = null;
let targetX = 0;
let targetY = 0;

const idle = computed(
  () =>
    awake.value &&
    !reduced.value &&
    !props.expanded &&
    !hovering.value &&
    !animating.value
);

const visualStyle = computed(() => ({
  transform: `translate3d(${shiftX.value}px, ${shiftY.value}px, 0)`,
}));

const panelStyle = computed(() => ({
  top: panelTop.value,
  right: panelRight.value,
  bottom: panelBottom.value,
  left: panelLeft.value,
}));

/** Read the tuning parameters from visual.css. */
function readTokens() {
  const node = anchor.value;
  if (!node) return;
  const style = getComputedStyle(node);
  blobSize.value = cssNumber(style.getPropertyValue('--blob-size'), 112);
}

/** Parse a px or ms custom property. */
function cssNumber(value: string, fallback: number): number {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Map-relative inset written on the anchor in MapComponent. */
function inset(name: string, fallback: number): number {
  const node = anchor.value;
  if (!node) return fallback;
  const raw = getComputedStyle(node).getPropertyValue(name);
  if (!raw.trim()) return fallback;
  return cssNumber(raw, fallback);
}

/** Transition length in milliseconds. */
function duration(): number {
  const node = anchor.value;
  if (!node) return 560;
  return cssNumber(
    getComputedStyle(node).getPropertyValue('--blob-duration'),
    560
  );
}

/** Prefer the live media query. The change event can lag. */
function motionReduced(): boolean {
  return (
    reduced.value ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Clear a pending settle. */
function clearReveal() {
  if (revealTimer) clearTimeout(revealTimer);
  revealTimer = 0;
}

/** Put the open panel back on its original map position. */
function placePanel() {
  const node = anchor.value;
  const map = node?.closest('.map-container')?.getBoundingClientRect();
  if (!node || !map) return;
  const origin = node.getBoundingClientRect();
  if (props.edge === 'bottom') {
    const controls = document
      .querySelector('.mapboxgl-ctrl-bottom-right')
      ?.getBoundingClientRect();
    const rightEdge = controls ? controls.left - 8 : map.right - 86;
    // The open circle stays on the closed circle, so the panel does not lift it.
    const tuck = origin.height / 2 - 10;
    panelTop.value = `${tuck}px`;
    panelLeft.value = 'auto';
    panelRight.value = `${origin.right - rightEdge}px`;
    panelBottom.value = 'auto';
    return;
  }
  if (props.edge === 'right') {
    const top = map.top + inset('--panel-inset-top', 116);
    const right = map.right - inset('--panel-inset-right', 12);
    panelTop.value = `${top - origin.top}px`;
    panelRight.value = `${origin.right - right}px`;
    panelBottom.value = 'auto';
    panelLeft.value = 'auto';
    return;
  }
  const top = map.top + inset('--panel-inset-top', 12);
  const left = map.left + inset('--panel-inset-left', 12);
  panelTop.value = `${top - origin.top}px`;
  panelLeft.value = `${left - origin.left}px`;
  panelRight.value = 'auto';
  panelBottom.value = 'auto';
}

/** Move the circle onto the panel edge and remember that spot. */
function measureNub() {
  const node = anchor.value;
  const card = panel.value;
  if (!node || !card) return;
  const origin = node.getBoundingClientRect();
  const cardBox = card.getBoundingClientRect();
  const shift = nubShift(
    props.edge,
    {
      left: origin.left,
      top: origin.top,
      width: origin.width,
      height: origin.height,
    },
    {
      left: cardBox.left,
      top: cardBox.top,
      width: cardBox.width,
      height: cardBox.height,
    },
    blobSize.value
  );
  targetX = shift.x;
  targetY = shift.y;
}

/** Show the panel first, so the circle slides underneath it. */
async function beginOpen() {
  clearReveal();
  hovering.value = false;
  animating.value = true;
  readTokens();
  placePanel();
  await nextTick();
  if (!props.expanded) return;
  measureNub();
  showPanel.value = true;
  shiftX.value = targetX;
  shiftY.value = targetY;
  revealTimer = window.setTimeout(() => {
    animating.value = false;
  }, duration());
}

/** Hide the panel, then return the circle to its corner. */
function beginClose() {
  clearReveal();
  showPanel.value = false;
  hovering.value = false;
  animating.value = true;
  shiftX.value = 0;
  shiftY.value = 0;
  targetX = 0;
  targetY = 0;
  revealTimer = window.setTimeout(() => {
    animating.value = false;
  }, duration());
}

/** Ask the parent to flip the open state. */
function onToggle() {
  emit('toggle');
}

/** Mark the circle as hovered. The open half only scales. */
function onEnter() {
  if (motionReduced()) return;
  hovering.value = true;
}

/** Release the hover. */
function onLeave() {
  hovering.value = false;
}

/** Keep reduced motion in step with the system setting. */
function onReduceChange(event: MediaQueryListEvent) {
  reduced.value = event.matches;
}

/** Pause the idle breath while the tab is hidden. */
function onVisibility() {
  awake.value = !document.hidden;
}

/** Keep an open panel on its original spot when the window changes. */
function onResize() {
  if (!props.expanded) return;
  placePanel();
  nextTick(() => {
    measureNub();
    shiftX.value = targetX;
    shiftY.value = targetY;
  });
}

watch(
  () => props.expanded,
  (open, previous) => {
    if (previous === undefined) return;
    if (open) void beginOpen();
    else beginClose();
  }
);

onMounted(() => {
  reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  reduced.value = reduceQuery.matches;
  reduceQuery.addEventListener('change', onReduceChange);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onResize);
  readTokens();
  placePanel();
  if (props.expanded) void beginOpen();
  else {
    shiftX.value = 0;
    shiftY.value = 0;
  }
});

onBeforeUnmount(() => {
  clearReveal();
  reduceQuery?.removeEventListener('change', onReduceChange);
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('resize', onResize);
});
</script>

<template>
  <div
    ref="anchor"
    class="blob-anchor"
    :class="[
      `is-${edge}`,
      {
        'is-idle': idle,
        'is-hover': hovering,
        'is-expanded': expanded,
        'is-spread': showPanel,
      },
    ]"
  >
    <div class="blob-visual" :style="visualStyle">
      <div class="blob-face">
        <img :src="image" alt="" />
      </div>
      <button
        type="button"
        class="blob-hit"
        :aria-expanded="expanded"
        :aria-controls="panelId"
        :aria-label="expanded ? `Close ${label}` : `Open ${label}`"
        @click="onToggle"
        @pointerenter="onEnter"
        @pointerleave="onLeave"
      >
        <span class="blob-label">{{ label }}</span>
      </button>
    </div>
    <div
      :id="panelId"
      ref="panel"
      class="blob-panel"
      :class="{ 'is-shown': showPanel }"
      :style="panelStyle"
      :inert="showPanel ? undefined : true"
      :aria-hidden="showPanel ? undefined : true"
    >
      <div class="blob-panel-fade">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.blob-anchor {
  position: absolute;
  width: var(--blob-size);
  height: var(--blob-size);
  overflow: visible;
  pointer-events: none;
  isolation: isolate;
  color: var(--map-control-text, #24312c);
}

.blob-visual {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  transform-origin: center;
  transition: transform 720ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.blob-face {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 50%;
  pointer-events: none;
  transform-origin: center;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.7);
  transition: transform 640ms ease;
}

.blob-face img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.is-spread .blob-face {
  box-shadow: none;
}

.is-spread.is-right .blob-face {
  width: 50%;
  border-radius: 999px 0 0 999px;
  transform-origin: right center;
}

.is-spread.is-right .blob-face img {
  width: 200%;
  max-width: none;
}

.is-spread.is-left .blob-face {
  right: 0;
  left: auto;
  width: 50%;
  border-radius: 0 999px 999px 0;
  transform-origin: left center;
}

.is-spread.is-left .blob-face img {
  width: 200%;
  max-width: none;
  margin-left: -100%;
}

.is-spread.is-bottom .blob-face {
  height: 50%;
  border-radius: 999px 999px 0 0;
  transform-origin: center bottom;
}

.is-spread.is-bottom .blob-face img {
  width: 100%;
  height: 200%;
}

.is-idle .blob-face {
  animation: blob-breathe 8s ease-in-out infinite;
}

.is-hover:not(.is-spread) .blob-face {
  transform: scale(1.008);
}

.is-spread.is-hover .blob-face {
  transform: scale(1.015);
}

.blob-hit {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  pointer-events: auto;
  touch-action: manipulation;
}

.is-spread.is-right .blob-hit {
  right: auto;
  width: calc(var(--blob-size) / 2 + 4px);
}

.is-spread.is-left .blob-hit {
  left: auto;
  width: calc(var(--blob-size) / 2 + 4px);
}

.is-spread.is-bottom .blob-hit {
  bottom: auto;
  height: calc(var(--blob-size) / 2 + 4px);
}

.blob-hit:focus-visible {
  outline: 2px solid var(--foreground);
  outline-offset: 3px;
}

.blob-label {
  font-family: var(--nw-font-serif), Baskerville, serif;
  font-size: 20px;
  font-weight: 400;
  line-height: 1;
  text-align: center;
  color: #f8f9f9;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
}

.is-spread .blob-label {
  display: none;
}

.blob-panel {
  position: absolute;
  z-index: 4;
  transform: translate3d(0, 0, 0);
  pointer-events: none;
}

.blob-panel-fade {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity 720ms cubic-bezier(0.22, 0.61, 0.36, 1),
    visibility 0s linear 720ms;
}

.blob-panel.is-shown {
  pointer-events: auto;
}

.blob-panel.is-shown .blob-panel-fade {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transition:
    opacity 720ms cubic-bezier(0.22, 0.61, 0.36, 1),
    visibility 0s linear 0s;
}

.is-right :deep(.layer-panel) {
  max-height: calc(100dvh - 150px);
  overflow: auto;
}

@keyframes blob-breathe {
  0%,
  100% {
    transform: scale(1);
  }

  50% {
    transform: scale(calc(1 + var(--blob-breathe)));
  }
}

@media (max-width: 720px) {
  .is-left :deep(.places-bar) {
    max-width: calc(100vw - var(--blob-size) - 120px);
  }

  .is-left :deep(.places-types) {
    flex-wrap: wrap;
  }

  .is-right :deep(.layer-panel) {
    max-width: calc(100vw - var(--blob-size) - 36px);
    max-height: calc(100dvh - 210px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .blob-face {
    animation: none;
    transition: none;
  }
}
</style>
