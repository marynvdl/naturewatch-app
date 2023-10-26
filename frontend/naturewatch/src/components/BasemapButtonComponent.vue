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
const emit = defineEmits<{
  (e: 'basemap-changed', value: string): void;
}>();

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
  <div>
    <v-btn style="width: 0; height: 0" @click="handleButtonClick">
      <v-img
        class="basemap-btn"
        aspect-ratio="16/9"
        cover
        :src="buttonImageSrc"
      />
    </v-btn>
  </div>
</template>

<style scoped>
.basemap-btn {
  width: 50px;
  transition: transform 0.2s ease-in-out;
}

.basemap-btn:hover {
  transform: scale(1.13);
}
</style>
