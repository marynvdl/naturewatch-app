<script setup lang="ts">
import { ref, watch, computed } from 'vue';

const props = defineProps({
  lngLat: Object,
  open: Boolean,
  positionX: {
    type: Number,
    default: 0
  },
  positionY: {
    type: Number,
    default: 0
  },
});

const show = ref(props.open);
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
const x = ref(props.positionX || 0);
const y = ref(props.positionY || 0);

watch(
  () => props.open,
  newVal => {
    show.value = newVal;
    if (newVal) {
      x.value = props.positionX || 0;
      y.value = props.positionY || 0;
    }
  }
);

function copyCoordinates() {
  navigator.clipboard.writeText(coordinates.value).then(() => {
    console.log('Coordinates copied to clipboard!');
  });
}
</script>

<template>
  <v-menu v-model="show" absolute>
    <v-card>
      <v-card-title>Coordinates</v-card-title>
      <v-card-text>{{ coordinates }}</v-card-text>
      <v-card-actions>
        <v-btn density="compact" icon="mdi-content-copy" @click="copyCoordinates" />
      </v-card-actions>
    </v-card>
  </v-menu>
</template>

<style scoped></style>
