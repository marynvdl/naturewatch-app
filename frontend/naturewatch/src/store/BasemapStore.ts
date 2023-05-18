import { ref, type Ref } from 'vue';
import { defineStore } from 'pinia';
import type Basemap from '@/interfaces/BasemapInterface';

/** Basemap Store */
const useBasemapStore = defineStore('basemap', () => {
  // State
  const title: Ref<string> = ref('Satellite');
  const url: Ref<string> = ref(
    'mapbox://styles/nature-watch/clhasd44b012301pg7dilg74p'
  );
  const labelsVisible: Ref<boolean> = ref(true);

  // Getters
  /** Get current active basemap style */
  function currentBasemap(): Basemap {
    return { title: title.value, url: url.value };
  }

  // Actions
  /** Toggle basemap style between Satellite and Streets*/
  function toggleBasemap() {
    if (title.value === 'Satellite') {
      title.value = 'Streets';
      url.value = 'mapbox://styles/mapbox/streets-v12';
    } else {
      title.value = 'Satellite';
      url.value = 'mapbox://styles/nature-watch/clhasd44b012301pg7dilg74p';
    }
  }

  /** Toggle labels of basemap style */
  function toggleLabelsTo(visible: boolean) {
    labelsVisible.value = visible;
  }

  return {
    title,
    url,
    labelsVisible,
    currentBasemap,
    toggleBasemap,
    toggleLabelsTo,
  };
});

export default useBasemapStore;
