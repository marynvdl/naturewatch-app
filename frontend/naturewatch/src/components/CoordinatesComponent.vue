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
  x.value = props.positionX || 0;
  y.value = props.positionY || 0;
  show.value = true;
}

function copyCoordinates() {
  navigator.clipboard.writeText(coordinates.value).then(() => {
    console.log('Coordinates copied to clipboard!');
  });
}

// Expose methods
defineExpose({
  openPopup,
});
</script>

<template>
  <v-menu v-model="show" absolute :style="{ top: y + 'px', left: x + 'px' }">
    <v-card>
      <v-card-title> {{  }}</v-card-title>
      <v-card-text>{{ coordinates }}</v-card-text>
      <v-card-actions>
        <v-btn
          density="compact"
          icon="mdi-content-copy"
          @click="copyCoordinates"
        />
      </v-card-actions>
    </v-card>
  </v-menu>
</template>

<style scoped></style>
