import { ref, type Ref } from 'vue';
import { defineStore } from 'pinia';
import type Basemap from '@/interfaces/BasemapInterface';
import type {
  BasemapSourceType,
  BasemapCustomType,
} from '../types/BasemapTypes';

/** Basemap Store */
const useBasemapStore = defineStore('basemap', () => {
  // State

  /** Initial state */
  const title: Ref<string> = ref('Streets');
  const source: Ref<BasemapSourceType> = ref('mapbox');
  const url: Ref<string> = ref('mapbox://styles/mapbox/streets-v12');
  const customType: Ref<BasemapCustomType> = ref('raster');

  // Getters

  /** Return current basemap */
  function currentBasemap(): Basemap {
    return {
      title: title.value,
      source: source.value,
      url: url.value,
      ...(customType.value ? { customType: customType.value } : {}),
    };
  }

  // Actions

  /** Toggle basemap between satellite and streets */
  function toggleBasemap() {
    if (title.value === 'Satellite') {
      title.value = 'Streets';
      source.value = 'mapbox';
      url.value = 'mapbox://styles/mapbox/streets-v12';
    } else {
      title.value = 'Satellite';
      source.value = 'custom';
      // url.value =
      //   'http://www.google.cn/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}';
      url.value =
        'https://stamen-tiles.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg';
      customType.value = 'raster';
    }
  }

  return { title, url, currentBasemap, toggleBasemap };
});

export default useBasemapStore;
