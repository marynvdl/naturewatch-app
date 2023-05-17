import { ref, type Ref } from 'vue';
import { defineStore } from 'pinia';
import type Basemap from '@/interfaces/BasemapInterface';

/** Basemap Store */
const useBasemapStore = defineStore('basemap', () => {
  // State
  const title: Ref<string> = ref('Satellite');
  const url: Ref<string> = ref(
    'mapbox://styles/nature-watch/clhasye2x014301pg03i97sca'
  );

  // Getters
  /**
   *
   */
  function currentBasemap(): Basemap {
    return { title: title.value, url: url.value };
  }

  // Actions
  /**
   *
   */
  function toggleBasemap() {
    if (title.value === 'Satellite') {
      title.value = 'Streets';
      url.value = 'mapbox://styles/mapbox/streets-v12';
    } else {
      title.value = 'Satellite';
      url.value = 'mapbox://styles/nature-watch/clhasye2x014301pg03i97sca';
    }
  }
  return { title, url, currentBasemap, toggleBasemap };
});

export default useBasemapStore;
