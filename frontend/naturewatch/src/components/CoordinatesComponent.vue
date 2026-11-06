<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch } from 'vue';
import { Copy } from '@lucide/vue';

const props = defineProps({
  lngLat: {
    type: Object,
    default: () => null,
  },
  positionX: {
    type: Number,
    default: 0,
  },
  positionY: {
    type: Number,
    default: 0,
  },
});

const show = ref(false);
const popup = ref<HTMLElement | null>(null);
const coordinates = computed(() => {
  if (props.lngLat) {
    const lat = props.lngLat.lat.toFixed(5);
    const lng = props.lngLat.lng.toFixed(5);
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    return `${Math.abs(lat)}° ${latDir}, ${Math.abs(lng)}° ${lngDir}`;
  }
  return '';
});
const x = computed(() => props.positionX || 0);
const y = computed(() => props.positionY || 0);

/**
 * Method to open the popup.
 */
function openPopup() {
  show.value = true;
}

/** Close the popup. */
function closePopup() {
  show.value = false;
}

/** Close when a press lands outside the popup. */
function onPressOutside(event: PointerEvent) {
  if (popup.value?.contains(event.target as Node)) return;
  closePopup();
}

/** Close on Escape. */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closePopup();
}

/** Listen for a dismissing press or key only while the popup is open. */
watch(show, open => {
  if (open) {
    document.addEventListener('pointerdown', onPressOutside, true);
    document.addEventListener('keydown', onKeydown);
  } else {
    document.removeEventListener('pointerdown', onPressOutside, true);
    document.removeEventListener('keydown', onKeydown);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPressOutside, true);
  document.removeEventListener('keydown', onKeydown);
});

/**
 * Copies coordinates to clipboard.
 */
function copyCoordinates() {
  navigator.clipboard.writeText(coordinates.value);
}

defineExpose({
  openPopup,
  closePopup,
});
</script>

<template>
  <div
    v-if="show && coordinates"
    ref="popup"
    class="coordinate-pop"
    :style="{ top: y + 'px', left: x + 'px' }"
  >
    <span class="coordinate-text">{{ coordinates }}</span>
    <button
      type="button"
      aria-label="Copy coordinates"
      @click="copyCoordinates"
    >
      <Copy :size="14" />
    </button>
  </div>
</template>

<style scoped>
.coordinate-pop {
  position: fixed;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 4px 4px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #f8f9f9;
  color: #3a3935;
}

.coordinate-text {
  font-size: 0.75rem;
}

.coordinate-pop button {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
</style>
