import { defineStore } from 'pinia';
import { ref } from 'vue';
import type MapLayer from '@/interfaces/MapLayerInterface';

const useMapLayerStore = defineStore('mapLayer', () => {
  // State
  const MapLayers = ref<MapLayer[]>([
    {
      title: 'All',
      button_type: 'big',
      url: 'https://stamen-tiles.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg',
      type: 'raster',
      visible: false,
      icon: 'mdi-map-legend',
      active: true,
    },
    {
      title: 'Fire',
      button_type: 'small',
      url: 'https://stamen-tiles.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg',
      type: 'raster',
      visible: false,
      icon: 'mdi-fire',
      active: true,
    },
    {
      title: 'Treeloss',
      button_type: 'small',
      url: 'https://tiles.globalforestwatch.org/umd_tree_cover_loss/v1.9/tcd_30/{z}/{x}/{y}.png',
      type: 'raster',
      visible: false,
      icon: 'mdi-tree',
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
      console.log(
        '#MapLayerStore updated visible to: ' + layerToUpdate.visible
      );
    }
  }

  return { MapLayers, getVisibleLayers, toggleLayerVisibility };
});

export default useMapLayerStore;
