import { defineStore } from 'pinia';
import { ref } from 'vue';
import type MapLayer from '@/interfaces/MapLayerInterface';
import { buildMapLayers, catalog } from '@/catalog';

const useMapLayerStore = defineStore('mapLayer', () => {
  // State
  /** Layers come from src/catalog/layers.json */
  const MapLayers = ref<MapLayer[]>(buildMapLayers(catalog));

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
