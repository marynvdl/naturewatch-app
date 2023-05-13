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
      type: 'raster',
      visible: false,
      image_visible: allVisibleImg,
      image_notvisible: allNotVisibleImg,
      button_color: 'brown-lighten-1',
      active: true,
    },
    {
      title: 'Built',
      button_type: 'small',
      url: 'https://stamen-tiles.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg',
      type: 'raster',
      visible: false,
      icon: 'mdi-office-building',
      button_color: 'amber-lighten-4',
      active: true,
    },
    {
      title: 'Treeloss',
      button_type: 'small',
      url: 'https://tiles.globalforestwatch.org/umd_tree_cover_loss/v1.9/tcd_30/{z}/{x}/{y}.png',
      type: 'raster',
      visible: false,
      icon: 'mdi-tree',
      button_color: 'red-lighten-3',
      active: true,
      query_string: `start_year={year}&end_year={year}`,
    },
    {
      title: 'Fire',
      button_type: 'small',
      url: 'https://stamen-tiles.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg',
      type: 'raster',
      visible: false,
      icon: 'mdi-fire',
      button_color: 'amber-lighten-4',
      active: true,
    },
    {
      title: 'Bare',
      button_type: 'small',
      url: 'https://tiles.globalforestwatch.org/umd_tree_cover_loss/v1.9/tcd_30/{z}/{x}/{y}.png',
      type: 'raster',
      visible: false,
      icon: 'mdi-square-rounded',
      button_color: 'red-lighten-3',
      active: false,
    },
    {
      title: 'Mines',
      button_type: 'small',
      url: 'https://stamen-tiles.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg',
      type: 'raster',
      visible: false,
      icon: 'mdi-shovel',
      button_color: 'amber-lighten-4',
      active: false,
    },
    {
      title: 'Crops',
      button_type: 'small',
      url: 'https://tiles.globalforestwatch.org/umd_tree_cover_loss/v1.9/tcd_30/{z}/{x}/{y}.png',
      type: 'raster',
      visible: false,
      icon: 'mdi-barley',
      button_color: 'red-lighten-3',
      active: false,
    },
    {
      title: 'Rivers',
      button_type: 'big',
      url: 'https://stamen-tiles.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg',
      type: 'raster',
      visible: false,
      image_visible: riversVisibleImg,
      image_notvisible: riversNotVisibleImg,
      button_color: 'brown-lighten-1',
      active: true,
    },
  ]);

  // Getters
  /** Get layers */
  function getVisibleLayers(): MapLayer[] {
    return MapLayers.value.filter(layer => layer.visible);
  }

  // Actions
  /** Toggle layer visibility*/
  function toggleLayerVisibility(title: string): void {
    const layerToUpdate = MapLayers.value.find(layer => layer.title === title);
    if (layerToUpdate) {
      layerToUpdate.visible = !layerToUpdate.visible;
    }
  }

  return { MapLayers, getVisibleLayers, toggleLayerVisibility };
});

export default useMapLayerStore;
