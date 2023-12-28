<script setup lang="ts">
import { ref, computed, defineExpose } from 'vue';

const props = defineProps({
  lngLat: Object,
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

// Method to open the popup
function openPopup() {
  show.value = true;
}

function copyCoordinates() {
  navigator.clipboard.writeText(coordinates.value);
}

// Expose methods
defineExpose({
  openPopup,
});
</script>

<template>
  <v-menu
    v-model="show"
    absolute
    class="pa-0"
    :style="{ top: y + 'px', left: x + 'px' }"
  >
    <v-card>
      <v-card-text class="px-2 py-1 coordinate-text">
        {{ coordinates }}
        <v-btn
          class="px-2"
          variant="plain"
          size="x-small"
          density="compact"
          icon="mdi-content-copy"
          @click="copyCoordinates"
        />
      </v-card-text>
    </v-card>
  </v-menu>
</template>

<style scoped>
.coordinate-text {
  font-size: 0.75rem;
}
</style>
