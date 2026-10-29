<script setup lang="ts">
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  computed,
  watch,
} from 'vue';
import * as mapboxgl from 'mapbox-gl';
import BasemapButtonComponent from '@/components/BasemapButtonComponent.vue';
import DrawerComponent from '@/components/DrawerComponent.vue';
import MeasureComponent from './MeasureComponent.vue';
import PlaceProfileComponent from '@/components/PlaceProfileComponent.vue';
import PlacesBarComponent from '@/components/PlacesBarComponent.vue';
import BlobButton from '@/components/ui/blob-button/BlobButton.vue';
import TimelineComponent from '@/components/TimelineComponent.vue';
import mark from '@/assets/logo_nw.png';
import blobPlaces from '@/assets/blob-places.png';
import blobLayers from '@/assets/blob-layers.png';
import blobMeasure from '@/assets/blob-measure.png';
import useBasemapStore from '@/store/BasemapStore';
import useMapLayerStore from '@/store/MapLayerStore';
import useTimelineStore from '@/store/TimelineStore';
import type MapLayer from '@/interfaces/MapLayerInterface';
import { resolveLayerYear } from '@/catalog';
import { classRasterPaint } from '@/catalog/rasterColor';
import usePlacesStore from '@/store/PlacesStore';
import { usePlaceBoundaries } from '@/places/usePlaceBoundaries';
import useDrawerStore from '@/store/DrawerStore';
import SideButtonsComponent from '@/components/SideButtonsComponent.vue';
import CoordinatesComponent from '@/components/CoordinatesComponent.vue';

/** Using stores */
const basemapStore = useBasemapStore();
const mapLayerStore = useMapLayerStore();
const timelineStore = useTimelineStore();
const placesStore = usePlacesStore();
const drawerStore = useDrawerStore();
const drawerVisible = computed(() => drawerStore.visible);
const toggleDrawerVisibility = drawerStore.toggleDrawerVisibility;
const placesOpen = ref(false);
const measureOpen = ref(false);
const NARROW = '(max-width: 720px)';

/** On a narrow screen, one open panel would cover the other blob buttons. */
function closeOthers(current: 'places' | 'layers' | 'measure') {
  if (!window.matchMedia(NARROW).matches) return;
  if (current !== 'places') placesOpen.value = false;
  if (current !== 'layers' && drawerVisible.value) toggleDrawerVisibility();
  if (current !== 'measure') measureOpen.value = false;
}

/** Open or close Places. An open profile stays where it is. */
function togglePlaces() {
  placesOpen.value = !placesOpen.value;
  if (placesOpen.value) closeOthers('places');
}

/** Open or close Layers, and on a narrow screen close the other panels. */
function toggleLayers() {
  toggleDrawerVisibility();
  if (drawerVisible.value) closeOthers('layers');
}

/** Open or close Measure, and on a narrow screen close the other panels. */
function toggleMeasure() {
  measureOpen.value = !measureOpen.value;
  if (measureOpen.value) closeOthers('measure');
}

/** Props */
defineProps<{
  msg: string;
}>();

/** Data */
// Current basemap from store
const currentBasemap = computed(() => basemapStore.currentBasemap);
const visibleMapLayers = computed(() => mapLayerStore.getVisibleLayers());
const map = ref<mapboxgl.Map | null>(null);
const { zoomToSelectedPlace } = usePlaceBoundaries(() => map.value);
const selectedName = computed(() => {
  const id = placesStore.selectedId;
  if (!id) return '';
  return (
    placesStore.features?.features.find(item => item.properties.id === id)
      ?.properties.name ?? ''
  );
});

/** Rendered profile width. The closed Places circle parks beside it. */
const profileWidth = ref(0);
let profileObserver: ResizeObserver | null = null;

/** Measure the profile column, which follows `--place-column`. */
function measureProfile() {
  const profile = document.querySelector('.map-place');
  const beside = !window.matchMedia(NARROW).matches;
  profileWidth.value =
    beside && profile instanceof HTMLElement
      ? profile.getBoundingClientRect().width
      : 0;
}

const placesParkedWidth = computed(() =>
  !placesOpen.value && placesStore.selectedId ? profileWidth.value : 0
);

/**
 * False while the open place columns leave too little map for the timeline.
 * With no column open the timeline keeps its place, even on a phone.
 */
const timelineRoom = ref(true);

/** Compare the drawn timeline with the map beside the place columns. */
function measureTimelineRoom() {
  const frame = document.querySelector('.map-frame');
  const timeline = document.querySelector('.timeline');
  if (!(frame instanceof HTMLElement) || !(timeline instanceof HTMLElement)) {
    return;
  }
  const box = timeline.getBoundingClientRect();
  if (!box.width) return;
  const columns = [
    placesOpen.value ? document.querySelector('.places-bar') : null,
    placesStore.selectedId ? document.querySelector('.map-place') : null,
  ].filter(column => column !== null);
  if (!columns.length) {
    timelineRoom.value = true;
    return;
  }
  const mapLeft = Math.max(
    frame.getBoundingClientRect().left,
    ...columns.map(column => column.getBoundingClientRect().right)
  );
  timelineRoom.value =
    box.left >= mapLeft && box.right <= frame.getBoundingClientRect().right;
}

/** Follow the profile as it opens, closes, or the window changes. */
function observeProfile() {
  profileObserver?.disconnect();
  profileObserver = null;
  measureProfile();
  measureTimelineRoom();
  if (typeof ResizeObserver === 'undefined') return;
  profileObserver = new ResizeObserver(() => {
    measureProfile();
    measureTimelineRoom();
  });
  const watched = document.querySelectorAll(
    '.map-frame, .map-place, .places-bar, .timeline'
  );
  watched.forEach(element => profileObserver?.observe(element));
}

watch(
  () => [placesStore.selectedId, placesOpen.value, timelineStore.visible],
  observeProfile,
  { flush: 'post' }
);
onMounted(observeProfile);

// Determine layer color to use
const layerColorKey = computed(() => {
  return currentBasemap.value.title === 'Satellite'
    ? 'layer_color_satellite'
    : 'layer_color_streets';
});

// Timeline visibility from store
const timelineVisibility = computed(() => timelineStore.visible);
const activeYear = computed(() => timelineStore.activeYear);

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

const monochromeConfig = {
  basemap: { theme: 'monochrome', lightPreset: 'day' },
};

const mapOptions: mapboxgl.MapboxOptions = {
  accessToken:
    'pk.eyJ1IjoibmF0dXJlLXdhdGNoIiwiYSI6ImNsZWU4MHN6MjBlZmwzcG12cTdnNGJwcGEifQ.gK_j2FlTCHa0bV0cUT_3IA',
  container: 'mapDiv',
  style: currentBasemap.value.url,
  config:
    currentBasemap.value.title === 'Monochrome' ? monochromeConfig : undefined,
  center: [20.23928, 7.35074],
  zoom: 5,
  attributionControl: false,
  projection: 'globe' as unknown as mapboxgl.Projection,
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
        if (map.value) {
          updateMapLayer(newLayer as any, map.value as any);
        }
        // Update opacity
        updateLayerOpacityOnMap(
          newLayer.title,
          currentOpacity,
          map.value as any
        );

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
      if (map.value) {
        updateMapLayer(layer, map.value as any, oldActiveYear);
        // Update opacity
        updateLayerOpacityOnMap(layer.title, currentOpacity, map.value as any);
      }
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
        updateLayerOpacityOnMap(layer.title, layer.opacity, map.value as any);
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
  if (map) {
    const layer = map.getLayer(fullLayerId);
    if (layer) {
      const opacityValue = opacity / 100;

      // Determine the correct opacity property based on layer type
      const layerType = layer.type;
      let opacityProperty: 'raster-opacity' | 'circle-opacity' | '' = '';
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
}

onMounted(() => {
  // Create the controls
  const nav = new mapboxgl.NavigationControl();

  // Initiate map
  const mapInstance = new mapboxgl.Map(mapOptions) as mapboxgl.Map;
  map.value = mapInstance;

  // Add the custom controls during map initialization
  mapInstance.addControl(nav, 'bottom-right');

  mapInstance.addControl(
    new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      // When active the map will receive updates to the device's location as it changes.
      trackUserLocation: true,
      // Draw an arrow next to the location dot to indicate which direction the device is heading.
      showUserHeading: true,
    }),
    'bottom-right'
  );

  // Add event listener for style.load
  mapInstance.on('style.load', () => {
    // Check if basemap has a Map Layer
    if (currentBasemap.value.layer) {
      addSourceAndLayer(
        currentBasemap.value.layer,
        activeYear.value,
        mapInstance
      );
    }
    visibleMapLayers.value.forEach((layer, index) => {
      addSourceAndLayer(layer, activeYear.value, mapInstance);
    });
    setLabels(mapInstance);
  });

  // Add right-click event listener
  mapInstance.on('contextmenu', e => {
    displayCoordinates(e.lngLat, e.originalEvent);
  });

  timelineStore.bindTileWait(() => waitForVisibleTiles(mapInstance));
});

onBeforeUnmount(() => {
  profileObserver?.disconnect();
  timelineStore.bindTileWait(() => Promise.resolve());
});

/** Methods */
/**
 * Resolve once the tiles in the current view have loaded.
 * An idle event before the new year has been drawn is ignored.
 * @param {mapboxgl.Map} mapInstance - The map showing the selected year.
 */
async function waitForVisibleTiles(mapInstance: mapboxgl.Map): Promise<void> {
  await nextTick();
  let sawLoad = false;
  const onLoading = () => {
    sawLoad = true;
  };
  mapInstance.on('dataloading', onLoading);
  await new Promise(resolve => window.setTimeout(resolve, 50));
  mapInstance.off('dataloading', onLoading);
  const ready = () => mapInstance.areTilesLoaded() && !mapInstance.isMoving();
  if (!sawLoad && ready()) return;
  await new Promise<void>(resolve => {
    let settled = false;
    let poll = 0;
    const finish = () => {
      if (settled) return;
      settled = true;
      mapInstance.off('idle', onIdle);
      window.clearTimeout(giveUp);
      window.clearTimeout(poll);
      resolve();
    };
    const onIdle = () => {
      if (ready()) finish();
    };
    const look = () => {
      if (ready()) finish();
      else poll = window.setTimeout(look, 100);
    };
    mapInstance.on('idle', onIdle);
    const giveUp = window.setTimeout(finish, 8000);
    poll = window.setTimeout(look, 100);
  });
}

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
    const style = map.getStyle();
    if (style?.imports?.some(item => item.id === 'basemap')) {
      const visible = areLabelsVisible.value;
      map.setConfigProperty('basemap', 'showPlaceLabels', visible);
      map.setConfigProperty('basemap', 'showPointOfInterestLabels', visible);
      map.setConfigProperty('basemap', 'showRoadLabels', visible);
      map.setConfigProperty('basemap', 'showTransitLabels', visible);
    }
    if (style && style.layers) {
      style.layers.forEach(function (layer) {
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
}

/** Handle basemap change */
function handleBasemapChanged(newStyleUrl: string) {
  if (map.value) {
    map.value.setStyle(
      newStyleUrl,
      currentBasemap.value.title === 'Monochrome'
        ? {
            config: monochromeConfig,
            localFontFamily: undefined,
            localIdeographFontFamily: undefined,
          }
        : undefined
    );
    const layer = currentBasemap.value.layer;
    if (layer) {
      if (map.value) {
        updateMapLayer(layer, map.value as any);
      }
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
  map: mapboxgl.Map,
  previousYear?: number
) {
  if (layer.visible) {
    addSourceAndLayer(layer, activeYear.value, map);
    if (previousYear && map.getLayer(layer.title + previousYear)) {
      map.removeLayer(layer.title + previousYear);
    }
  } else if (map.getSource(layer.title + activeYear.value)) {
    map.removeLayer(layer.title + activeYear.value);
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
    const resolvedYear = resolveLayerYear(
      layer.years_available,
      activeYear,
      layer.year_meaning
    );
    if (resolvedYear === null) {
      activeYear = NaN;
    } else {
      activeYear = resolvedYear;
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
          // Without this the map requests tiles that do not exist beyond maxzoom
          ...(layer.max_zoom !== undefined && { maxzoom: layer.max_zoom }),
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

    const style = map.getStyle();
    if (style && style.layers) {
      for (const layer of style.layers) {
        if (layer.type === 'symbol') {
          firstLabelId = layer.id;
        } else if (layer.type === 'line') {
          firstLineId = layer.id;
          break;
        }
      }
    }

    const layerId = layer.title + activeYear.value;
    const onStandard = !!style?.imports?.length;
    if (layer.type === 'raster') {
      const spec: mapboxgl.RasterLayer = {
        id: layerId,
        type: 'raster',
        source: layerId,
        paint: {
          'raster-opacity': currentOpacity, // Set the opacity here
          ...(layer.resampling && { 'raster-resampling': layer.resampling }),
          ...(layer.color_classes?.length
            ? classRasterPaint(layer.color_classes)
            : {}),
        },
      };
      if (onStandard) spec.slot = 'middle';
      map.addLayer(spec, onStandard ? undefined : firstLineId);
    } else if (layer.type === 'circle') {
      const spec: mapboxgl.CircleLayer = {
        id: layerId,
        type: layer.type,
        source: layerId,
        'source-layer': layer.sourceLayer,
        paint: {
          'circle-radius': layer.circle_radius,
          'circle-color': layer[layerColorKey.value],
          'circle-opacity': currentOpacity, // Set the opacity here
        },
      };
      if (onStandard) spec.slot = 'middle';
      map.addLayer(spec, onStandard ? undefined : firstLabelId);
    } else if (layer.type === 'line') {
      // If there are additional paint properties for lines, include them here
      const spec: mapboxgl.LineLayer = {
        id: layerId,
        type: layer.type,
        source: layerId,
        'source-layer': layer.sourceLayer,
        paint: {
          // 'line-opacity': currentOpacity, // Uncomment and set if line opacity is used
        },
      };
      if (onStandard) spec.slot = 'middle';
      map.addLayer(spec, onStandard ? undefined : firstLineId);
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
  <div class="map-parent">
    <div
      class="map-frame"
      :class="{
        'has-list': placesOpen,
        'has-place': !!placesStore.selectedId,
      }"
    >
      <div class="map-container">
        <div id="mapDiv" />
        <div class="map-logo">
          <img :src="mark" alt="Nature Watch" />
        </div>
        <BlobButton
          class="blob-places"
          label="Places"
          edge="left"
          panel-id="places-panel"
          :image="blobPlaces"
          :expanded="placesOpen"
          corner
          :parked-width="placesParkedWidth"
          @toggle="togglePlaces"
        >
          <PlacesBarComponent />
        </BlobButton>
        <BlobButton
          class="blob-layers"
          label="Landscape"
          edge="right"
          panel-id="layers-panel"
          :image="blobLayers"
          :expanded="drawerVisible"
          corner
          @toggle="toggleLayers"
        >
          <DrawerComponent />
        </BlobButton>
        <BlobButton
          class="blob-measure"
          label="Measure"
          edge="bottom"
          panel-id="measure-panel"
          :image="blobMeasure"
          :expanded="measureOpen"
          corner
          @toggle="toggleMeasure"
        >
          <MeasureComponent v-if="map" :map-instance="map" />
        </BlobButton>
        <p
          v-if="placesStore.visible && placesStore.notice"
          class="place-notice"
        >
          {{ placesStore.notice }}
        </p>
        <SideButtonsComponent />
        <!-- Places columns and the controls that sit beside them -->
        <div class="map-overlay">
          <PlaceProfileComponent
            v-if="placesStore.selectedId"
            class="map-place map-panel nw"
            :place-id="placesStore.selectedId"
            :name="selectedName"
            @close="placesStore.clearSelection()"
            @zoom="zoomToSelectedPlace"
          />
          <!-- Toggle basemap labels -->
          <div class="basemap-button">
            <button
              id="labelsButton"
              type="button"
              class="map-control"
              :class="{ 'is-on': areLabelsVisible }"
              @click="handleLabelsChanged(map as any)"
            >
              Labels
            </button>
            <!-- Toggle Basemap type -->
            <BasemapButtonComponent
              id="basmapButton"
              @basemap-changed="handleBasemapChanged"
            />
          </div>
        </div>
      </div>
      <!-- Timeline Component -->
      <TimelineComponent
        v-show="timelineVisibility"
        class="timeline"
        :class="{ 'is-squeezed': !timelineRoom }"
      />
    </div>
  </div>
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

.map-parent,
.map-frame {
  height: 100%;
}

/*
 * One layout for the places columns. The list and the profile share
 * --place-column. Everything that must clear them reads --places-offset.
 */
.map-frame {
  --place-column: clamp(300px, 27vw, 380px);
  --list-track: 0px;
  --profile-track: 0px;
  --places-offset: calc(var(--list-track) + var(--profile-track));

  position: relative;
  text-align: center;
}

.map-frame.has-list {
  --list-track: var(--place-column);
}

.map-frame.has-place {
  --profile-track: var(--place-column);
}

.map-overlay {
  position: absolute;
  inset: 0;
  z-index: 13;
  display: grid;
  grid-template-columns: var(--list-track) var(--profile-track) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) auto;
  pointer-events: none;
}

.map-overlay > * {
  pointer-events: auto;
}

.map-place {
  grid-column: 2;
  grid-row: 1 / -1;
  min-width: 0;
  height: 100dvh;
  border-radius: 0;
}

.map-frame:not(.has-list) .map-place {
  grid-column: 1 / 3;
}

.map-container {
  position: relative;
  height: 100vh;
}

#mapDiv {
  height: 100vh;
}

.place-notice {
  position: absolute;
  right: 4px;
  bottom: 0;
  z-index: 4;
  max-width: calc(100vw - 24px);
  margin: 0;
  padding: 0 4px;
  font-size: 9px;
  line-height: 14px;
  white-space: nowrap;
  text-align: right;
  color: #3a3935;
  background: rgba(248, 249, 249, 0.72);
  pointer-events: none;
}

.basemap-button {
  grid-column: 3;
  grid-row: 2;
  justify-self: start;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  margin: 0 0 16px 12px;
}
#labelsButton {
  justify-content: center;
  width: 50px;
  background: #f8f9f9;
  color: #24312c;
  border: 1px solid var(--border);
  box-shadow: none;
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0;
}

#labelsButton.is-on {
  background: #3a3935;
  border-color: #3a3935;
  color: #fff;
}
.timeline {
  position: absolute;
  left: calc(var(--places-offset) + (100% - var(--places-offset)) / 2);
  bottom: 18px;
  top: auto;
  width: auto;
  z-index: 12;
  transform: translateX(calc(-50% - 72px));
}

/* Hidden but still laid out, so its width can be measured again. */
.timeline.is-squeezed {
  visibility: hidden;
  pointer-events: none;
}

.map-logo {
  position: absolute;
  top: 12px;
  left: 50%;
  z-index: 12;
  width: 52px;
  height: 52px;
  transform: translateX(-50%);
  pointer-events: none;
}

.map-logo img {
  width: 52px;
  height: 52px;
}

.blob-places {
  top: 12px;
  left: 12px;
  z-index: 14;
  --panel-inset-top: 0px;
  --panel-inset-left: 0px;
}

.blob-layers {
  /* Centre lines up with the open half, so the slide is horizontal. */
  top: 132px;
  right: 12px;
  z-index: 14;
  /* The card used to sit under the chevron, which started at 72px. */
  --panel-inset-top: 116px;
  --panel-inset-right: 12px;
}

.blob-measure {
  /* Two thirds of the 112px circle. */
  --blob-size: 74.667px;
  --blob-label: 13.333px;
  right: 96px;
  bottom: 18px;
  z-index: 15;
}

.map-parent {
  padding: 0;
}

/* Two open columns leave too little map for these beside Measure. */
@media (max-width: 900px) {
  .has-list.has-place .basemap-button {
    margin-bottom: 100px;
  }
}

/* The list and the profile share one column, stacked, beside a strip of map. */
@media (max-width: 720px) {
  .map-frame {
    --place-column: min(360px, calc(100vw - 72px));
    --places-offset: max(var(--list-track), var(--profile-track));
  }

  .map-frame.has-list.has-place {
    --places-list-height: 50dvh;
  }

  .map-overlay {
    grid-template-columns: var(--places-offset) minmax(0, 1fr);
  }

  .map-place,
  .map-frame:not(.has-list) .map-place {
    grid-column: 1;
    grid-row: 1 / -1;
  }

  .has-list .map-place {
    align-self: end;
    height: 50dvh;
  }

  .basemap-button {
    grid-column: 2;
    margin-bottom: 100px;
  }

  /* The strip beside an open column holds the map controls, then Measure, then these. */
  .has-list .basemap-button,
  .has-place .basemap-button {
    margin-bottom: 276px;
  }

  .blob-measure {
    right: 12px;
    bottom: 192px;
  }

  .has-list .blob-layers,
  .has-place .blob-layers,
  .has-list .blob-measure,
  .has-place .blob-measure {
    --blob-size: 64px;
    --blob-label: 11px;

    right: 4px;
  }
}
</style>
