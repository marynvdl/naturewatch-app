<script setup lang="ts">
import useBasemapStore from '@/store/BasemapStore';
import { computed } from 'vue';

// Using the basemap store
const basemapStore = useBasemapStore();
console.log(basemapStore);

// Accessing the currentBasemap and toggleBasemap from the store
const currentBasemap = computed(() => basemapStore.currentBasemap());
const toggleBasemap = basemapStore.toggleBasemap;
</script>

<template>
  <div>
    <v-btn variant="tonal" @click="toggleBasemap">
      {{ currentBasemap.title }}
    </v-btn>
  </div>
</template>

<style scoped></style>
