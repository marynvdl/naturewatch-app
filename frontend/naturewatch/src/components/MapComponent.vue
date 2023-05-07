<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import * as mapboxgl from 'mapbox-gl';
import BasemapButtonComponent from '@/components/BasemapButtonComponent.vue';
import { useConfig } from '@/store';
import useBasemapStore from '@/store/BasemapStore';
import useMapLayerStore from '@/store/MapLayerStore';
import type MapLayer from '@/interfaces/MapLayerInterface';

/** Using stores */
const configStore = useConfig();
const basemapStore = useBasemapStore();
const mapLayerStore = useMapLayerStore();

/** Interfaces */
interface MapboxMap {
  accessToken: string;
  container: string;
  style: string;
  center: [number, number];
  zoom: number;
}

/** Props */
defineProps<{
  msg: string;
}>();

/** Data */
// Current basemap from store
const currentBasemap = computed(() => basemapStore.currentBasemap());
const visibleMapLayers = computed(() => mapLayerStore.getVisibleLayers());
const map = ref<mapboxgl.Map | null>(null);

const mapOptions: MapboxMap = {
  accessToken:
    'pk.eyJ1IjoibmF0dXJlLXdhdGNoIiwiYSI6ImNsZWU4MHN6MjBlZmwzcG12cTdnNGJwcGEifQ.gK_j2FlTCHa0bV0cUT_3IA',
  container: 'mapDiv',
  style: currentBasemap.value.url,
  center: [20.23928, 7.35074],
  zoom: 5,
};

// Watch for changes in the visible property of map layers

const prevMapLayers = ref<MapLayer[]>(
  JSON.parse(JSON.stringify(mapLayerStore.MapLayers))
);

watch(
  () => mapLayerStore.MapLayers,
  newMapLayers => {
    newMapLayers.forEach((newLayer, index) => {
      const oldLayer = prevMapLayers.value[index];

      if (newLayer.visible !== oldLayer.visible) {
        // Updating the map
        if (map.value) {
          if (newLayer.visible) {
            addMapLayer(newLayer);
          } else {
            // Remove the layer from the map
            map.value.removeLayer(newLayer.title);
          }
        }
        // Update the previous state only when there's a change in the visible property
        prevMapLayers.value[index] = JSON.parse(JSON.stringify(newLayer));
      }
    });
  },
  { deep: true }
);

onMounted(() => {
  map.value = new mapboxgl.Map(mapOptions);

  // Add event listener for style.load
  if (map.value) {
    map.value.on('style.load', () => {
      visibleMapLayers.value.forEach((layer, index) => {
        addMapLayer(layer);
      });
    });
  }
});

/** Methods */
function handleBasemapChanged(newStyleUrl: string) {
  if (map.value) {
    map.value.setStyle(newStyleUrl);
  }
}

/** Add Map Layer */
function addMapLayer(layer: MapLayer) {
  if (map.value) {
    // Add the source if it does not yet exist
    if (!map.value.getSource(layer.title)) {
      map.value.addSource(layer.title, {
        type: 'raster',
        tiles: [layer.url],
        tileSize: 256,
      });
    }

    // Add the layer
    map.value.addLayer({
      id: layer.title,
      type: 'raster',
      source: layer.title, // Use the source ID (newLayer.title) here
    });
  }
}
</script>

<template>
  <v-container fluid class="map-parent">
    <v-responsive class="d-flex align-center text-center fill-height">
      <!-- Logo -->
      <!-- <v-img
        src="@/assets/logo.svg"
        alt="vuetify"
        :width="256"
        class="logo mx-auto"
      /> -->
      <!-- <p>{{ msg }}</p> -->
      <div class="map-container">
        <div id="mapDiv" />
        <!-- Toggle Dark mode -->
        <v-btn id="darkmodeButton" class="darkmode-button" icon="mdi-theme-light-dark" @click="configStore.toggleTheme" />
        <!-- Toggle Basemap type -->
        <BasemapButtonComponent id="basmapButton" class="basemap-button" @basemap-changed="handleBasemapChanged" />
      </div>
    </v-responsive>
  </v-container>
</template>

<style scoped>
.logo:hover {
  will-change: filter;
  filter: drop-shadow(0 0 1em #2196f3aa);
}

.map-container {
  position: relative;
  height: 100vh;
}

#mapDiv {
  height: 100vh;
}

.basemap-button {
  position: absolute;
  bottom: 90px;
  right: 45px;
  z-index: 10;
}

.darkmode-button {
  position: absolute;
  top: 30px;
  right: 40px;
  z-index: 10;
}

.map-parent {
  padding: 0;
}
</style>
