import { ref, type Ref } from 'vue';
import { defineStore } from 'pinia';
import type Basemap from '@/interfaces/BasemapInterface';

/** Basemap Store */
const useBasemapStore = defineStore('basemap', () => {
  // State
  const title: Ref<string> = ref('Satellite');
  const url: Ref<string> = ref(
<<<<<<< HEAD
    'mapbox://styles/nature-watch/clhasye2x014301pg03i97sca'
=======
    'mapbox://styles/mapbox/satellite-streets-v12?optimize=true'
>>>>>>> 6265fdbdee720c14f5f65f5eae6725aec08f26ae
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
<<<<<<< HEAD
      url.value = 'mapbox://styles/nature-watch/clhasye2x014301pg03i97sca';
=======
      url.value = 'mapbox://styles/mapbox/satellite-streets-v12?optimize=true';
>>>>>>> 6265fdbdee720c14f5f65f5eae6725aec08f26ae
    }
  }

  return { title, url, currentBasemap, toggleBasemap };
});

export default useBasemapStore;
