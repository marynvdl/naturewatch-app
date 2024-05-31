import { defineStore } from 'pinia';
import { ref } from 'vue';
import type MapLayer from '@/interfaces/MapLayerInterface';
import allVisibleImg from '@/assets/all_visible.png';
import allNotVisibleImg from '@/assets/all_notvisible.png';
import riversVisibleImg from '@/assets/rivers_visible.png';
import riversNotVisibleImg from '@/assets/rivers_notvisible.png';

const useMapLayerStore = defineStore('mapLayer', () => {
  // State
  const MapLayers = ref<MapLayer[]>([
    {
      title: 'All',
      button_type: 'big',
      url: 'https://stamen-tiles.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg',
      years_available: [2016, 2017, 2018, 2019, 2020, 2021, 2022],
      type: 'raster',
      visible: false,
      opacity: 100,
      icon: 'mdi-home-city',
      image_visible: allVisibleImg,
      image_notvisible: allNotVisibleImg,
      button_color: 'brown-lighten-1',
      active: false,
    },
    {
      title: 'Built',
      button_type: 'small',
      url: 'https://storage.googleapis.com/nature-watch-tiles/built/2023/{z}/{x}/{y}.png',
      years_available: [2022],
      type: 'raster',
      visible: false,
      opacity: 100,
      icon: 'mdi-office-building',
      button_color: '#767676',
      active: true,
    },
    {
      title: 'Treeloss',
      button_type: 'small',
      url: 'https://tiles.globalforestwatch.org/umd_tree_cover_loss/latest/dynamic/{z}/{x}/{y}.png',
      years_available: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023],
      type: 'raster',
      visible: false,
      opacity: 100,
      icon: 'mdi-tree',
      button_color: '#D487A4',
      active: true,
      query_string: `?start_year=2000&end_year={year}`,
    },
    {
      title: 'Fire',
      button_type: 'small',
      url: 'https://storage.googleapis.com/nature-watch-tiles/fire/',
      years_available: [2016, 2017, 2018, 2019, 2020, 2021, 2022],
      type: 'raster',
      visible: false,
      opacity: 100,
      icon: 'mdi-fire',
      button_color: '#f8674a',
      active: true,
      query_string: `{year}/{z}/{x}/{y}.png`,
    },
    {
      title: 'Bare',
      button_type: 'small',
      url: 'https://storage.googleapis.com/nature-watch-tiles/built/2022/{z}/{x}/{y}.png',
      years_available: [2016, 2017, 2018, 2019, 2020, 2021, 2022],
      type: 'raster',
      visible: false,
      opacity: 100,
      icon: 'mdi-square-rounded',
      button_color: 'red-lighten-3',
      active: false,
    },
    {
      title: 'Mines',
      button_type: 'small',
      url: 'https://stamen-tiles.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg',
      years_available: [2016, 2017, 2018, 2019, 2020, 2021, 2022],
      type: 'raster',
      visible: false,
      opacity: 100,
      icon: 'mdi-shovel',
      button_color: 'amber-lighten-4',
      active: false,
    },
    {
      title: 'Crops',
      button_type: 'small',
      url: 'https://storage.googleapis.com/nature-watch-tiles/crop/',
      years_available: [2015, 2019],
      type: 'raster',
      visible: false,
      opacity: 100,
      icon: 'mdi-barley',
      button_color: '#e59139',
      active: true,
      query_string: `{year}/{z}/{x}/{y}.png`,
    },
    {
      title: 'Rivers',
      button_type: 'big',
      url: 'https://stamen-tiles.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg',
      years_available: [2016, 2017, 2018, 2019, 2020, 2021, 2022],
      type: 'raster',
      visible: false,
      opacity: 100,
      icon: 'mdi-water',
      image_visible: riversVisibleImg,
      image_notvisible: riversNotVisibleImg,
      button_color: 'brown-lighten-1',
      active: false,
    },
    {
      title: 'Dams',
      button_type: 'small',
      url: 'mapbox://nature-watch.dam-test-tiles',
      years_available: [2016, 2017, 2018, 2019, 2020, 2021, 2022],
      type: 'circle',
      sourceLayer: 'dams',
      layer_color_satellite: '#b7e6f1',
      layer_color_streets: '#5b7378',
      circle_radius: 4,
      visible: false,
      opacity: 100,
      icon: 'mdi-bridge',
      button_color: '#80a1a8',
      active: true,
    },
  ]);

  // Getters
  /** Get layers */
  function getVisibleLayers(): MapLayer[] {
    return MapLayers.value.filter(layer => layer.visible);
  }

  /**
   * Get layer opacity
   * @param title - The title of the layer
   * @returns The opacity value of the layer
   */
  function getLayerOpacity(title: string): number {
    const layer = MapLayers.value.find(layer => layer.title === title);
    return layer ? layer.opacity : 100; // Default to 100 if layer is not found
  }

  // Actions
  /**
   * Toggle layer visibility
   * @param title
   */
  function toggleLayerVisibility(title: string): void {
    const layerToUpdate = MapLayers.value.find(layer => layer.title === title);
    if (layerToUpdate) {
      layerToUpdate.visible = !layerToUpdate.visible;
    }
  }

  /**
   * Update layer opacity
   * @param title - The title of the layer
   * @param opacity - The new opacity value
   */
  function updateLayerOpacity(title: string, opacity: number): void {
    const layerToUpdate = MapLayers.value.find(layer => layer.title === title);
    if (layerToUpdate) {
      layerToUpdate.opacity = opacity;
    }
  }

  return {
    MapLayers,
    getVisibleLayers,
    getLayerOpacity,
    toggleLayerVisibility,
    updateLayerOpacity,
  };
});

export default useMapLayerStore;
