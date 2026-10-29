<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import turfLength from '@turf/length';
import turfArea from '@turf/area';
import turfAlong from '@turf/along';
import turfCentroid from '@turf/centroid';
import turfBearing from '@turf/bearing';
import turfDestination from '@turf/destination';
import { Eraser, Pentagon, Ruler, Trash2 } from '@lucide/vue';
import useBasemapStore from '@/store/BasemapStore';
import { useMeasureStore } from '@/store/MeasureStore';

/** Using stores */
const basemapStore = useBasemapStore();
const measureStore = useMeasureStore();

// Get current basemap from store
const currentBasemap = computed(() => basemapStore.currentBasemap);

const themeSatellite = computed(() => {
  return currentBasemap.value.title === 'Satellite' ? true : false;
});

/* eslint-disable vue/require-default-prop */
const props = defineProps({
  mapInstance: Object,
});

const map = ref(props.mapInstance);
const mode = ref('simple_select');
let draw: MapboxDraw | null = null;

/** Keep the length and area buttons in step with the draw tool. */
function syncMode() {
  mode.value = draw?.getMode() ?? 'simple_select';
}

/** Start a length or area measurement, or stop it if that tool is already on. */
function toggleMode(next: 'draw_line_string' | 'draw_polygon') {
  if (!draw) return;
  if (draw.getMode() === next) {
    draw.changeMode('simple_select');
  } else if (next === 'draw_line_string') {
    draw.changeMode('draw_line_string');
  } else {
    draw.changeMode('draw_polygon');
  }
  syncMode();
}

/** Remove the selected measurement. */
function deleteSelected() {
  draw?.trash();
}

/** Remove every measurement. */
function deleteAll() {
  measureStore.triggerDeleteAll();
}

// Keep track of stored labels
const storedLabels = ref<
  { id: string; description: string; coordinates: number[] | undefined }[]
>([]);

onMounted(() => {
  draw = new MapboxDraw({
    displayControlsDefault: false,
  });

  map.value?.addControl(draw, 'bottom-right');
  map.value?.on('draw.actionable', syncMode);
  map.value?.on('draw.create', syncMode);
  map.value?.on('draw.delete', syncMode);

  watch(
    () => measureStore.shouldDeleteAll,
    newValue => {
      if (newValue) {
        // Function to delete all drawn objects
        draw?.deleteAll();

        // Remove all measurement labels
        storedLabels.value.forEach(label => {
          if (map.value?.getSource(label.id)) {
            map.value.removeLayer(label.id);
            map.value.removeSource(label.id);
          }
        });

        // Clear the storedLabels
        storedLabels.value = [];
        // After deleting, reset the trigger in the store
        measureStore.resetDeleteAllTrigger();
      }
    }
  );
});

// Measure with turf
map.value?.on('draw.create', measure);
map.value?.on('draw.update', measure);
map.value?.on('draw.delete', removeMeasurementLabel);

/** Format a measured area in square metres, hectares, or square kilometres. */
function formatArea(areaM2: number): string {
  if (areaM2 >= 1_000_000) {
    // Convert to km² and format
    return `${(areaM2 / 1_000_000).toLocaleString('en-US', {
      maximumFractionDigits: 2,
    })} km²`;
  } else if (areaM2 >= 10_000) {
    // Convert to hectares and format
    return `${(areaM2 / 10_000).toLocaleString('en-US', {
      maximumFractionDigits: 2,
    })} ha`;
  } else {
    // Format as m²
    return `${areaM2.toLocaleString('en-US', { maximumFractionDigits: 2 })} m²`;
  }
}

/** Format a measured length in metres or kilometres. */
function formatDistance(distanceM: number): string {
  if (distanceM >= 1000) {
    // Convert to km and format
    return `${(distanceM / 1000).toLocaleString('en-US', {
      maximumFractionDigits: 2,
    })} km`;
  } else {
    // Format as m
    return `${distanceM.toLocaleString('en-US', {
      maximumFractionDigits: 2,
    })} m`;
  }
}

/** Label a finished line or polygon with its length or area. */
function measure(event: any) {
  const geometry = event.features[0].geometry;
  let label = '';
  let position;

  // Unique ID for the source and layer
  const id = `measure-label-${event.features[0].id}`;

  if (geometry.type === 'LineString') {
    // Function to slightly offset label
    const distance = turfLength(geometry, { units: 'meters' });
    label = formatDistance(distance);
    position = turfAlong(geometry, distance / 2, { units: 'meters' });

    const [start, end] = geometry.coordinates;

    const bearingValue = turfBearing(start, end);
    const offsetDistanceX = 0.02;
    const offsetDistanceY = 0.01;

    // Calculate horizontal and vertical offsets using trigonometry
    const xOffset = Math.cos(toRadians(bearingValue)) * offsetDistanceX;
    const yOffset = Math.sin(toRadians(bearingValue)) * offsetDistanceY;

    // Apply the horizontal offset
    const positionAfterXOffset = turfDestination(position, xOffset, 90);

    // Apply the vertical offset
    position = turfDestination(positionAfterXOffset, yOffset, 0);
  } else if (geometry.type === 'Polygon') {
    const area = turfArea(geometry); // Returns area in square meters
    label = formatArea(area);

    // Calculate position for the label for Polygon
    position = turfCentroid(geometry);
  }

  /** Convert degrees to radians. */
  function toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  // Add source and layer to the map for the label
  map.value?.addSource(id, {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: position?.geometry.coordinates,
      },
      properties: {
        description: label,
      },
    },
  });

  map.value?.addLayer({
    id: id,
    type: 'symbol',
    source: id,
    layout: {
      'text-field': ['get', 'description'],
      'text-anchor': 'center',
    },
    paint: {
      'text-color': themeSatellite.value ? 'white' : 'black',
    },
  });

  // Store the label
  storedLabels.value.push({
    id,
    description: label,
    coordinates: position?.geometry.coordinates,
  });
}

/** Remove the label for a deleted measurement. */
function removeMeasurementLabel(event: any) {
  const id = `measure-label-${event.features[0].id}`;
  if (map.value?.getSource(id)) {
    map.value.removeLayer(id);
    map.value.removeSource(id);
  }

  // Remove the label from storedLabels
  const index = storedLabels.value.findIndex(label => label.id === id);
  if (index !== -1) {
    storedLabels.value.splice(index, 1);
  }
}

// Remove event listeners when component is destroyed
const unwatch = watch(map, (newValue, oldValue) => {
  if (oldValue) {
    oldValue.off('draw.create', measure);
    oldValue.off('draw.update', measure);
    oldValue.off('draw.delete', removeMeasurementLabel);
  }
  if (newValue) {
    newValue.on('draw.create', measure);
    newValue.on('draw.update', measure);
    newValue.on('draw.delete', removeMeasurementLabel);
  }
});

onBeforeUnmount(() => {
  map.value?.off('draw.actionable', syncMode);
  map.value?.off('draw.create', syncMode);
  map.value?.off('draw.delete', syncMode);
  unwatch();
});

map.value?.on('style.load', () => {
  // Re-add the labels
  storedLabels.value.forEach(label => {
    // Re-add the label
    map.value?.addSource(label.id, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: label.coordinates,
        },
        properties: {
          description: label.description,
        },
      },
    });

    map.value?.addLayer({
      id: label.id,
      type: 'symbol',
      source: label.id,
      layout: {
        'text-field': ['get', 'description'],
        'text-anchor': 'center',
      },
      paint: {
        'text-color': themeSatellite.value ? 'white' : 'black',
      },
    });
  });
});
</script>

<template>
  <div class="measure-panel map-panel nw">
    <h2 class="panel-heading">Measure</h2>
    <div class="measure-tools">
      <button
        type="button"
        class="measure-tool map-control map-icon"
        :class="{ 'is-on': mode === 'draw_line_string' }"
        title="Measure length"
        aria-label="Measure length"
        :aria-pressed="mode === 'draw_line_string'"
        @click="toggleMode('draw_line_string')"
      >
        <Ruler aria-hidden="true" />
      </button>
      <button
        type="button"
        class="measure-tool map-control map-icon"
        :class="{ 'is-on': mode === 'draw_polygon' }"
        title="Measure area"
        aria-label="Measure area"
        :aria-pressed="mode === 'draw_polygon'"
        @click="toggleMode('draw_polygon')"
      >
        <Pentagon aria-hidden="true" />
      </button>
      <button
        type="button"
        class="measure-tool map-control map-icon"
        title="Delete selected measurement"
        aria-label="Delete selected measurement"
        @click="deleteSelected"
      >
        <Trash2 aria-hidden="true" />
      </button>
      <button
        type="button"
        class="measure-tool map-control map-icon"
        title="Delete all measurements"
        aria-label="Delete all measurements"
        @click="deleteAll"
      >
        <Eraser aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.measure-panel {
  order: 0;
  pointer-events: auto;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  width: max-content;
  margin: 0;
}

.measure-panel .panel-heading {
  white-space: nowrap;
}

.measure-tools {
  display: flex;
  flex-direction: row;
  gap: 8px;
  padding-right: 40px;
}
</style>
