<script setup lang="ts">
import useBasemapStore from '@/store/BasemapStore';
import { computed } from 'vue';
import satelliteImg from '@/assets/satellite.png';
import streetsImg from '@/assets/streets.png';

// Using stores
const basemapStore = useBasemapStore();

// Accessing the currentBasemap and toggleBasemap from the store
const currentBasemap = computed(() => basemapStore.currentBasemap);
const toggleBasemap = basemapStore.toggleBasemap;

/** Emits */
const emit = defineEmits<(e: 'basemap-changed', value: string) => void>();

/** Methods */
function handleButtonClick() {
  toggleBasemap();
  emit('basemap-changed', currentBasemap.value.url);
}

/** Computed properties */
const buttonImageSrc = computed(() =>
  currentBasemap.value.title === 'Satellite' ? streetsImg : satelliteImg
);
</script>

<template>
  <v-btn
    class="basemap-thumb"
    variant="flat"
    aria-label="Change basemap"
    @click="handleButtonClick"
  >
    <v-img class="basemap-btn" cover :src="buttonImageSrc" alt="" />
  </v-btn>
</template>

<style scoped>
.basemap-thumb.v-btn {
  width: 56px !important;
  height: 56px !important;
  min-width: 56px !important;
  padding: 0 !important;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.basemap-btn {
  width: 56px;
  height: 56px;
  transition: transform 0.2s ease-in-out;
}

.basemap-btn:hover {
  transform: scale(1.13);
}
</style>
