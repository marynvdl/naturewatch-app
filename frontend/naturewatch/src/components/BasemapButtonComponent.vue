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
  <button
    type="button"
    class="basemap-thumb"
    aria-label="Change basemap"
    @click="handleButtonClick"
  >
    <img class="basemap-btn" :src="buttonImageSrc" alt="" />
  </button>
</template>

<style scoped>
.basemap-thumb {
  width: 56px;
  height: 56px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: #f8f9f9;
  cursor: pointer;
}

.basemap-btn {
  display: block;
  width: 56px;
  height: 56px;
  object-fit: cover;
  transition: transform 0.2s ease-in-out;
}

.basemap-btn:hover {
  transform: scale(1.13);
}
</style>
