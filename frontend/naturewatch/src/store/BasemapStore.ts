import { ref } from 'vue';
import { defineStore } from 'pinia';
import type Basemap from '@/interfaces/BasemapInterface';
import type MapLayer from '@/interfaces/MapLayerInterface';

const SatelliteLayer: MapLayer = {
  title: 'All',
  button_type: 'big',
  url: 'https://mt.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}',
  type: 'raster',
  visible: true,
};

const SatelliteBasemap: Basemap = {
  title: 'Satellite',
  url: 'mapbox://styles/nature-watch/clhasd44b012301pg7dilg74p',
  layer: SatelliteLayer
};

const StreetsBasemap: Basemap = {
  title: 'Streets',
  url: 'mapbox://styles/mapbox/streets-v12',
  layer: undefined
};


/** Basemap Store */
const useBasemapStore = defineStore('basemap', () => {
  // State
  const currentBasemap = ref(StreetsBasemap);
  const labelsVisible = ref(true);

  // Actions
  /** Toggle basemap style between Satellite and Streets*/
  function toggleBasemap() {
    currentBasemap.value = currentBasemap.value.title === 'Satellite' ? StreetsBasemap : SatelliteBasemap;
  }

  /** Toggle layer visibility*/
  function toggleSatelliteLayerVisibility(): void {
    const layer = currentBasemap.value.layer;
    if (layer){
      layer.visible = !layer.visible;
    }
  }

  /** Toggle labels of basemap style */
  function toggleLabelsTo(visible: boolean) {
    labelsVisible.value = visible;
  }

  return {
    currentBasemap,
    labelsVisible,
    toggleBasemap,
    toggleLabelsTo,
    toggleSatelliteLayerVisibility
  };
});

export default useBasemapStore;
