<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import * as mapboxgl from 'mapbox-gl';
import BasemapButtonComponent from '@/components/BasemapButtonComponent.vue';
import MeasureComponent from './MeasureComponent.vue';
import TimelineComponent from '@/components/TimelineComponent.vue';
import { useConfig } from '@/store';
import useBasemapStore from '@/store/BasemapStore';
import useMapLayerStore from '@/store/MapLayerStore';
import useTimelineStore from '@/store/TimelineStore';
import useDrawerStore from '@/store/DrawerStore';
import type MapLayer from '@/interfaces/MapLayerInterface';

/** Using stores */
const configStore = useConfig();
const basemapStore = useBasemapStore();
const mapLayerStore = useMapLayerStore();
const timelineStore = useTimelineStore();
const drawerStore = useDrawerStore();

/** Props */
defineProps<{
  msg: string;
}>();

/** Data */
// Current basemap from store
const currentBasemap = computed(() => basemapStore.currentBasemap);
const visibleMapLayers = computed(() => mapLayerStore.getVisibleLayers());
const map = ref<mapboxgl.Map | null>(null);

// Determine layer color to use
const layerColorKey = computed(() => {
  return currentBasemap.value.title === 'Satellite'
    ? 'layer_color_satellite'
    : 'layer_color_streets';
});

// Timeline visibility from store
const timelineVisibility = computed(() => timelineStore.visible);
const activeYear = computed(() => timelineStore.activeYear);

// Drawer visibility and width
const drawerVisible = computed(() => drawerStore.visible);
const drawerWidth = computed(() => drawerStore.width);

// Label visibility
const areLabelsVisible = computed(() => basemapStore.labelsVisible);
const toggleLabelsTo = basemapStore.toggleLabelsTo;
const toggleSatelliteLayerVisibility = basemapStore.toggleSatelliteLayerVisibility;

const mapOptions: mapboxgl.MapboxOptions = {
  accessToken:
    'pk.eyJ1IjoibmF0dXJlLXdhdGNoIiwiYSI6ImNsZWU4MHN6MjBlZmwzcG12cTdnNGJwcGEifQ.gK_j2FlTCHa0bV0cUT_3IA',
  container: 'mapDiv',
  style: currentBasemap.value.url,
  center: [20.23928, 7.35074],
  zoom: 5,
  attributionControl: false,
  projection: 'mercator' as unknown as mapboxgl.Projection
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
        updateMapLayer(newLayer, map.value);

        // Update the previous state only when there's a change in the visible or id property
        prevMapLayers.value[index] = JSON.parse(JSON.stringify(newLayer));
      }
    });
  },
  { deep: true }
);

// Watch for changes in the activeYear from the timeline
watch(
  () => timelineStore.activeYear,
  (newActiveYear, oldActiveYear) => {
    prevMapLayers.value.forEach((layer, index) => {
      // Updating the map
      updateMapLayer(layer, map.value, oldActiveYear);
    });
  }
);

onMounted(() => {
  // Create the controls
  const nav = new mapboxgl.NavigationControl();

  // Initiate map
  map.value = new mapboxgl.Map(mapOptions);

  // Add the custom controls during map initialization
  map.value.addControl(nav, 'top-right');

  // Add event listener for style.load
  if (map.value) {
    map.value.on('style.load', () => {
      // Check if basemap has a Map Layer
      if (currentBasemap.value.layer){
        addSourceAndLayer(currentBasemap.value.layer, activeYear.value, map.value);
      }
      visibleMapLayers.value.forEach((layer, index) => {
        addSourceAndLayer(layer, activeYear.value, map.value);
      });
      setLabels(map.value);
    });
  }
});

/** Methods */
/** Handle labels change on basemap */
function handleLabelsChanged(map: mapboxgl.Map | null) {
  toggleLabelsTo(!areLabelsVisible.value);
  setLabels(map);
}

/** Toggle label visibility of basemap */
function setLabels(map: mapboxgl.Map | null) {
  if (map) {
    map.getStyle().layers.forEach(function (layer) {
      if (layer.type === 'symbol' || layer.type === 'line') {
        // Toggle visibility
        if (areLabelsVisible.value) {
          map.setLayoutProperty(layer.id, 'visibility', 'visible');
        } else {
          map.setLayoutProperty(layer.id, 'visibility', 'none');
        }
      }
    });
  }
}

/** Handle basemap change */
function handleBasemapChanged(newStyleUrl: string) {
  if (map.value) {
    map.value.setStyle(newStyleUrl);
    if (currentBasemap.value.layer){
      updateMapLayer(currentBasemap.value.layer, map.value);
      toggleSatelliteLayerVisibility()
    }
  }
}

/**
 * Updates the map layer's visibility and manages layer removal based on previous year.
 *
 * @param layer - The MapLayer to be updated.
 * @param map - The Mapbox map instance
 * @param previousYear - Optional. The previous year of the layer to be removed.
 */
function updateMapLayer(
  layer: MapLayer,
  map: mapboxgl.Map | null,
  previousYear?: number
) {
  if (map) {
    if (layer.visible) {
      addSourceAndLayer(layer, activeYear.value, map);
      if (previousYear) {
        map.removeLayer(layer.title + previousYear);
      }
    } else if (map.getSource(layer.title + activeYear.value)) {
      // Remove the layer from the map
      map.removeLayer(layer.title + activeYear.value);
    }
  }
}

/**
 * Builds the layer's url to be used in the tile request.
 *
 * @param layer - The MapLayer to be updated.
 * @param activeYear - The year selected on the timeline.
 */
function getLayerUrl(layer: MapLayer, activeYear: number) {
  let layerUrl: string;
  if (layer.query_string) {
    const queryString = layer.query_string.replace(
      /{year}/g,
      activeYear.toString()
    );
    layerUrl = layer.url + '?' + queryString;
  } else {
    layerUrl = layer.url;
  }
  return layerUrl;
}

/** Add layer source to the map */
function addSourceToMap(
  layer: MapLayer,
  layerUrl: string,
  map: mapboxgl.Map | null
) {
  if (map) {
    if (layer.type === 'raster') {
      if (!map?.getSource(layer.title + activeYear.value)) {
        map.addSource(layer.title + activeYear.value, {
          type: 'raster',
          tiles: [layerUrl],
          tileSize: 256,
        });
      }
    } else if (layer.type === 'circle' || layer.type === 'line') {
      if (!map?.getSource(layer.title + activeYear.value)) {
        map.addSource(layer.title + activeYear.value, {
          type: 'vector',
          url: layerUrl,
        });
      }
    }
  }
}

/** Add layer to the map */
function addLayerToMap(layer: MapLayer, map: mapboxgl.Map | null) {
  if (map) {
    // Add layer below labels and lines
    let firstLineId;
    let firstLabelId;

    for (const layer of map.getStyle().layers) {
      if (layer.type === 'symbol') {
        firstLabelId = layer.id;
      } else if (layer.type === 'line') {
        firstLineId = layer.id;
        break;
      }
    }

    if (layer.type === 'raster') {
      map.addLayer(
        {
          id: layer.title + activeYear.value,
          type: 'raster',
          source: layer.title + activeYear.value,
        },
        firstLineId
      );
    } else if (layer.type === 'circle') {
      map.addLayer(
        {
          id: layer.title + activeYear.value,
          type: layer.type,
          source: layer.title + activeYear.value,
          'source-layer': layer.sourceLayer,
          paint: {
            'circle-radius': layer.circle_radius,
            'circle-color': layer[layerColorKey.value],
          },
        },
        firstLabelId
      );
    } else if (layer.type === 'line') {
      map.addLayer(
        {
          id: layer.title + activeYear.value,
          type: layer.type,
          source: layer.title + activeYear.value,
          'source-layer': layer.sourceLayer,
        },
        firstLineId
      );
    }
  }
}

/** Get layer_url, add source and layer to map */
function addSourceAndLayer(
  layer: MapLayer,
  activeYear: number,
  map: mapboxgl.Map | null
) {
  if (map) {
    const layerUrl = getLayerUrl(layer, activeYear);
    addSourceToMap(layer, layerUrl, map);
    addLayerToMap(layer, map);
  }
}
</script>

<template>
  <v-container fluid class="map-parent">
    <v-responsive class="d-flex align-center text-center fill-height">
      <div class="map-container">
        <div id="mapDiv" />
        <!-- Toggle Dark mode -->
        <v-btn
          id="darkmodeButton"
          class="darkmode-button"
          icon="mdi-theme-light-dark"
          size="small"
          @click="configStore.toggleTheme"
        />
        <!-- Toggle basemap labels -->
        <div
          class="basemap-button"
          :style="
            drawerVisible
              ? `left: ${parseInt(drawerWidth) + 20}px`
              : 'left: 20px'
          "
        >
          <v-btn
            id="labelsButton"
            size="small"
            width="70"
            variant="tonal"
            :class="{ 'labels-visible': areLabelsVisible }"
            @click="handleLabelsChanged(map)"
          >
            Labels
          </v-btn>
          <!-- Toggle Basemap type -->
          <BasemapButtonComponent
            id="basmapButton"
            @basemap-changed="handleBasemapChanged"
          />
        </div>
      </div>
      <!-- Timeline Component -->
      <TimelineComponent
        v-show="timelineVisibility"
        class="timeline"
        :style="
          drawerVisible ? `left: ${parseInt(drawerWidth) + 40}px` : 'left: 95px'
        "
      />
      <!-- Measure Component -->
      <MeasureComponent v-if="map" :mapInstance="map" />
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
  bottom: 70px;
  left: 0px;
  z-index: 10;
  transition: left 0.2s ease-in-out;
}

.darkmode-button {
  position: absolute;
  top: 240px;
  right: 10px;
  z-index: 10;
}
.labels-visible {
  background-color: rgb(var(--v-theme-surface-variant));
  color: rgb(var(--v-theme-on-surface-variant));
}
.timeline {
  position: absolute;
  top: 50px;
  width: 260px;
  z-index: 10;
  transition: left 0.2s ease-in-out;
}
.map-parent {
  padding: 0;
}
</style>
