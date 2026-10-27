import { ref } from 'vue';
import { defineStore } from 'pinia';
import type Basemap from '@/interfaces/BasemapInterface';
import type MapLayer from '@/interfaces/MapLayerInterface';
import { useConfig } from '@/store';

const SatelliteLayer: MapLayer = {
  title: 'Satellite',
  button_type: 'big',
  url: 'https://mt.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}',
  years_available: [2022],
  type: 'raster',
  visible: true,
  opacity: 100,
};

const SatelliteBasemap: Basemap = {
  title: 'Satellite',
  url: 'mapbox://styles/nature-watch/clhasd44b012301pg7dilg74p',
  layer: SatelliteLayer,
};

const MonochromeBasemap: Basemap = {
  title: 'Monochrome',
  url: 'mapbox://styles/mapbox/standard',
  layer: undefined,
};

/** Basemap Store */
const useBasemapStore = defineStore('basemap', () => {
  // Access Config Store
  const configStore = useConfig();

  // State
  const currentBasemap = ref(MonochromeBasemap);
  const labelsVisible = ref(true);

  // Actions
  /** Toggle basemap style between Satellite and Standard monochrome. */
  function toggleBasemap() {
    configStore.toggleSatelliteTheme();
    currentBasemap.value =
      currentBasemap.value.title === 'Satellite'
        ? MonochromeBasemap
        : SatelliteBasemap;
  }

  /** Toggle layer visibility*/
  function toggleSatelliteLayerVisibility(): void {
    const layer = currentBasemap.value.layer;
    if (layer) {
      layer.visible = !layer.visible;
    }
  }

  /**
   * Toggle labels of basemap style
   * @param {boolean} visible - A parameter specifying if labels are visble or not
   */
  function toggleLabelsTo(visible: boolean) {
    labelsVisible.value = visible;
  }

  return {
    currentBasemap,
    labelsVisible,
    toggleBasemap,
    toggleLabelsTo,
    toggleSatelliteLayerVisibility,
  };
});

export default useBasemapStore;
