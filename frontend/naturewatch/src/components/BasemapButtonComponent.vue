<script setup lang="ts">
import useBasemapStore from '@/store/BasemapStore';
import { computed } from 'vue';

// Using the basemap store
const basemapStore = useBasemapStore();
console.log(basemapStore);

// Accessing the currentBasemap and toggleBasemap from the store
const currentBasemap = computed(() => basemapStore.currentBasemap());
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
</script>

<template>
  <div>
    <v-btn variant="tonal" @click="handleButtonClick">
      {{ currentBasemap.title }}
    </v-btn>
  </div>
</template>

<style scoped></style>
