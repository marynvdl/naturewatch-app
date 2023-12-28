<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import * as mapboxgl from 'mapbox-gl';
import BasemapButtonComponent from '@/components/BasemapButtonComponent.vue';
import MeasureComponent from './MeasureComponent.vue';
import TimelineComponent from '@/components/TimelineComponent.vue';
import useBasemapStore from '@/store/BasemapStore';
import useMapLayerStore from '@/store/MapLayerStore';
import useTimelineStore from '@/store/TimelineStore';
import useDrawerStore from '@/store/DrawerStore';
import type MapLayer from '@/interfaces/MapLayerInterface';
import SideButtonsComponent from '@/components/SideButtonsComponent.vue';
import CoordinatesComponent from '@/components/CoordinatesComponent.vue';

/** Using stores */
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
const toggleSatelliteLayerVisibility =
  basemapStore.toggleSatelliteLayerVisibility;

// Add state for CoordinatesComponent
const clickedLngLat = ref({ lng: 0, lat: 0 });
const clickedPositionX = ref(0);
const clickedPositionY = ref(0);
const coordinatesComponentRef = ref();

const mapOptions: mapboxgl.MapboxOptions = {
  accessToken:
    'pk.eyJ1IjoibmF0dXJlLXdhdGNoIiwiYSI6ImNsZWU4MHN6MjBlZmwzcG12cTdnNGJwcGEifQ.gK_j2FlTCHa0bV0cUT_3IA',
  container: 'mapDiv',
  style: currentBasemap.value.url,
  center: [20.23928, 7.35074],
  zoom: 5,
  attributionControl: false,
  projection: 'mercator' as unknown as mapboxgl.Projection,
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
        // Fetch the latest opacity value
        const currentOpacity = mapLayerStore.getLayerOpacity(newLayer.title);
        // Updating the map
        updateMapLayer(newLayer, map.value);
        // Update opacity
        updateLayerOpacityOnMap(newLayer.title, currentOpacity, map.value);

        // Update the previous state only when there's a change in the visible property
        prevMapLayers.value[index] = { ...newLayer, opacity: currentOpacity };
      }
    });
  },
  { deep: true }
);

// Watch for changes in the activeYear from the timeline
watch(
  () => timelineStore.activeYear,
  (newActiveYear, oldActiveYear) => {
    mapLayerStore.MapLayers.forEach(layer => {
      // Fetch the latest opacity value
      const currentOpacity = mapLayerStore.getLayerOpacity(layer.title);
      // Updating the map
      updateMapLayer(layer, map.value, oldActiveYear);
      // Update opacity
      updateLayerOpacityOnMap(layer.title, currentOpacity, map.value);
    });
  }
);
const mapLayersForWatching = computed(() => {
  return mapLayerStore.MapLayers.map(layer => {
    return { title: layer.title, opacity: layer.opacity };
  });
});

watch(
  mapLayersForWatching,
  (newLayers, oldLayers) => {
    newLayers.forEach((layer, index) => {
      const oldLayer = oldLayers[index];
      if (layer.opacity !== oldLayer.opacity) {
        updateLayerOpacityOnMap(layer.title, layer.opacity, map.value);
      }
    });
  },
  { deep: true }
);

/**
 * Updates the opacity of a Mapbox layer.
 * @param {string} layerTitle - The title of the layer to update.
 * @param {number} opacity - The new opacity value.
 * @param {mapboxgl.Map | null} map - The Mapbox map instance.
 */
function updateLayerOpacityOnMap(
  layerTitle: string,
  opacity: number,
  map: mapboxgl.Map | null
) {
  const fullLayerId = layerTitle + activeYear.value; // Construct the full layer ID
  if (map && map.getLayer(fullLayerId)) {
    const opacityValue = opacity / 100;

    // Determine the correct opacity property based on layer type
    const layerType = map.getLayer(fullLayerId).type;
    let opacityProperty = '';
    if (layerType === 'raster') {
      opacityProperty = 'raster-opacity';
    } else if (layerType === 'circle') {
      opacityProperty = 'circle-opacity';
    }
    // Add more conditions for other layer types if needed

    if (opacityProperty) {
      map.setPaintProperty(fullLayerId, opacityProperty, opacityValue);
    }
  }
}

onMounted(() => {
  // Create the controls
  const nav = new mapboxgl.NavigationControl();

  // Initiate map
  map.value = new mapboxgl.Map(mapOptions);

  // Add the custom controls during map initialization
  map.value.addControl(nav, 'top-right');

  map.value.addControl(
    new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      // When active the map will receive updates to the device's location as it changes.
      trackUserLocation: true,
      // Draw an arrow next to the location dot to indicate which direction the device is heading.
      showUserHeading: true,
    })
  );

  // Add event listener for style.load
  if (map.value) {
    map.value.on('style.load', () => {
      // Check if basemap has a Map Layer
      if (currentBasemap.value.layer) {
        addSourceAndLayer(
          currentBasemap.value.layer,
          activeYear.value,
          map.value
        );
      }
      visibleMapLayers.value.forEach((layer, index) => {
        addSourceAndLayer(layer, activeYear.value, map.value);
      });
      setLabels(map.value);
    });
  }

  // Add right-click event listener
  map.value.on('contextmenu', e => {
    displayCoordinates(e.lngLat, e.originalEvent);
  });
});

/** Methods */
/**
 * Display the coordinates where the user right-clicked.
 * @param {mapboxgl.LngLat} lngLat - The longitude and latitude of the clicked location.
 */
function displayCoordinates(lngLat: mapboxgl.LngLat, event: MouseEvent) {
  clickedLngLat.value = lngLat;
  clickedPositionX.value = event.clientX;
  clickedPositionY.value = event.clientY;

  coordinatesComponentRef.value?.openPopup();
}

/** Handle labels change on basemap */
function handleLabelsChanged(map: mapboxgl.Map | null) {
  toggleLabelsTo(!areLabelsVisible.value);
  setLabels(map);
}

/** Toggle label visibility of basemap */
function setLabels(map: mapboxgl.Map | null) {
  if (map) {
    map.getStyle().layers.forEach(function (layer) {
      if (
        (layer.type === 'symbol' || layer.type === 'line') &&
        // Keep labels added with the MeasureComponent
        !layer.id.includes('measure-label') &&
        // Keep lines and polygons added with the MeasureComponent
        !layer.id.includes('gl-draw')
      ) {
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
    if (currentBasemap.value.layer) {
      updateMapLayer(currentBasemap.value.layer, map.value);
      toggleSatelliteLayerVisibility();
    }
  }
}

/**
 * Updates the map layer's visibility and manages layer removal based on previous year.
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
      if (previousYear && map.getLayer(layer.title + previousYear)) {
        map.removeLayer(layer.title + previousYear);
      }
    } else if (map.getSource(layer.title + activeYear.value)) {
      map.removeLayer(layer.title + activeYear.value);
    }
  }
}

/**
 * Builds the layer's url to be used in the tile request.
 * @param layer - The MapLayer to be updated.
 * @param activeYear - The year selected on the timeline.
 */
function getLayerUrl(layer: MapLayer, activeYear: number): string {
  // Check if years_available is defined and not empty
  if (layer.years_available && layer.years_available.length > 0) {
    // Check if activeYear is not in years_available
    if (!layer.years_available.includes(activeYear)) {
      // Find the maximum year in years_available that is less than activeYear
      const maxAvailableYear = Math.max(
        ...layer.years_available.filter(year => year < activeYear)
      );
      // If maxAvailableYear is a number (not NaN), assign it to activeYear
      if (!isNaN(maxAvailableYear)) {
        activeYear = maxAvailableYear;
      }
      if (maxAvailableYear === -Infinity) {
        activeYear = NaN;
      }
    }
  }

  let layerUrl: string;
  if (Number.isNaN(activeYear)) {
    layerUrl = 'None';
  } else if (layer.query_string) {
    const queryString = layer.query_string.replace(
      /{year}/g,
      activeYear.toString()
    );
    layerUrl = layer.url + queryString;
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
    // Fetch the current opacity value
    const currentOpacity = mapLayerStore.getLayerOpacity(layer.title) / 100;

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

    const layerId = layer.title + activeYear.value;
    if (layer.type === 'raster') {
      map.addLayer(
        {
          id: layerId,
          type: 'raster',
          source: layerId,
          paint: {
            'raster-opacity': currentOpacity, // Set the opacity here
          },
        },
        firstLineId
      );
    } else if (layer.type === 'circle') {
      map.addLayer(
        {
          id: layerId,
          type: layer.type,
          source: layerId,
          'source-layer': layer.sourceLayer,
          paint: {
            'circle-radius': layer.circle_radius,
            'circle-color': layer[layerColorKey.value],
            'circle-opacity': currentOpacity, // Set the opacity here
          },
        },
        firstLabelId
      );
    } else if (layer.type === 'line') {
      // If there are additional paint properties for lines, include them here
      map.addLayer(
        {
          id: layerId,
          type: layer.type,
          source: layerId,
          'source-layer': layer.sourceLayer,
          paint: {
            // 'line-opacity': currentOpacity, // Uncomment and set if line opacity is used
          },
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
    if (layerUrl != 'None') {
      addSourceToMap(layer, layerUrl, map);
      addLayerToMap(layer, map);
    }
  }
}
</script>

<template>
  <v-container fluid class="map-parent">
    <v-responsive class="d-flex align-center text-center fill-height">
      <div class="map-container">
        <div id="mapDiv" />
        <SideButtonsComponent />
        <!-- Toggle basemap labels -->
        <div
          class="basemap-button"
          :style="
            drawerVisible
              ? `left: ${parseInt(drawerWidth) + 10}px`
              : 'left: 10px'
          "
        >
          <v-btn
            id="labelsButton"
            size="x-small"
            width="50"
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
      <MeasureComponent v-if="map" :map-instance="map" />
    </v-responsive>
  </v-container>
  <!-- Coordinates Component -->
  <CoordinatesComponent
    ref="coordinatesComponentRef"
    :lng-lat="clickedLngLat"
    :position-x="clickedPositionX"
    :position-y="clickedPositionY"
  />
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
  bottom: 50px;
  left: 0px;
  z-index: 10;
  transition: left 0.15s ease-in-out;
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

@media (max-width: 600px) {
  .basemap-button {
    bottom: 100px;
  }
}
</style>
