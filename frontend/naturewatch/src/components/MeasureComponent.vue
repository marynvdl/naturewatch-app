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
import type { Polygon } from 'geojson';
import { Eraser, Flag, Pentagon, Ruler, Trash2 } from '@lucide/vue';
import CorrectionForm from '@/components/CorrectionForm.vue';
import { catalog } from '@/catalog';
import { correctableLayers, shapeProblem } from '@/corrections/form';
import useBasemapStore from '@/store/BasemapStore';
import { useMeasureStore } from '@/store/MeasureStore';
import useAuthStore from '@/store/AuthStore';
import useMapLayerStore from '@/store/MapLayerStore';
import useTimelineStore from '@/store/TimelineStore';

/** Using stores */
const basemapStore = useBasemapStore();
const measureStore = useMeasureStore();
const auth = useAuthStore();
const mapLayerStore = useMapLayerStore();
const timelineStore = useTimelineStore();

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
  if (mode.value !== 'simple_select') {
    measureStore.setDrawing(true);
    return;
  }
  // The click that finishes a shape ends the mode first. Keep the flag
  // until that same click has passed, so it cannot choose a place.
  window.setTimeout(() => {
    measureStore.setDrawing(
      (draw?.getMode() ?? 'simple_select') !== 'simple_select'
    );
  }, 0);
}

/** The layers on the map that a correction can be flagged for. */
const correctable = computed(() =>
  correctableLayers(
    catalog,
    mapLayerStore.MapLayers.filter(layer => layer.visible).map(
      layer => layer.title
    )
  )
);

/** True from pressing Flag until the correction form closes. */
const correcting = ref(false);
const correctionFeatureId = ref<string | null>(null);
const correctionPolygon = ref<Polygon | null>(null);
const correctionOpen = ref(false);
const notice = ref('');
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Show a short line in the panel.
 * @param text - The line.
 * @param ms - How long it stays, or 0 to keep it.
 */
function showNotice(text: string, ms = 0) {
  clearTimeout(noticeTimer);
  notice.value = text;
  if (ms > 0) noticeTimer = setTimeout(() => (notice.value = ''), ms);
}

/** Drop the correction polygon and leave correction mode. */
function endCorrection() {
  if (correctionFeatureId.value) draw?.delete(correctionFeatureId.value);
  correctionFeatureId.value = null;
  correctionPolygon.value = null;
  correctionOpen.value = false;
  if (correcting.value && draw?.getMode() === 'draw_polygon') {
    draw.changeMode('simple_select');
  }
  correcting.value = false;
  syncMode();
}

/** Start drawing a correction, or stop if one is being drawn. */
function toggleCorrection() {
  if (!draw) return;
  if (correcting.value) {
    endCorrection();
    showNotice('');
    return;
  }
  correcting.value = true;
  draw.changeMode('draw_polygon');
  showNotice('Draw the area that is wrong. Click the first point to finish.');
  syncMode();
}

/**
 * Open the form for a finished correction polygon, or ask for another one.
 * @param feature - The drawn feature.
 * @param feature.id - Its draw id.
 * @param feature.geometry - Its polygon.
 */
function startCorrection(feature: { id: string; geometry: Polygon }) {
  const problem = shapeProblem(feature.geometry);
  if (problem) {
    draw?.delete(feature.id);
    showNotice(problem);
    draw?.changeMode('draw_polygon');
    syncMode();
    return;
  }
  correctionFeatureId.value = feature.id;
  correctionPolygon.value = feature.geometry;
  showNotice('');
  correctionOpen.value = true;
}

/** Closing the form, saved or not, ends the correction. */
watch(correctionOpen, isOpen => {
  if (!isOpen && correcting.value) endCorrection();
});

/** Leaving edit mode, or turning the last pressure layer off, ends it too. */
watch(
  () => auth.editMode && correctable.value.length > 0,
  allowed => {
    if (!allowed && correcting.value) {
      endCorrection();
      showNotice('');
    }
  }
);

/** The form saved a correction. */
function onCorrectionSaved() {
  showNotice('Correction saved for review', 4000);
}

/** Start a length or area measurement, or stop it if that tool is already on. */
function toggleMode(next: 'draw_line_string' | 'draw_polygon') {
  if (!draw) return;
  if (correcting.value) {
    endCorrection();
    showNotice('');
  }
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
  map.value?.on('draw.modechange', syncMode);

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
  if (correcting.value) {
    if (event.type === 'draw.create') startCorrection(event.features[0]);
    return;
  }
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
  map.value?.off('draw.modechange', syncMode);
  measureStore.setDrawing(false);
  clearTimeout(noticeTimer);
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
  <div
    class="measure-panel map-panel nw"
    :class="{ 'has-flag': auth.editMode }"
  >
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
      <button
        v-if="auth.editMode"
        type="button"
        class="measure-tool map-control map-icon"
        :class="{ 'is-on': correcting }"
        :title="
          correctable.length > 0
            ? 'Flag a correction'
            : 'Turn on a pressure layer to flag a correction'
        "
        aria-label="Flag a correction"
        :aria-pressed="correcting"
        :disabled="correctable.length === 0"
        @click="toggleCorrection"
      >
        <Flag aria-hidden="true" />
      </button>
    </div>
    <p v-if="notice" class="measure-notice map-panel" role="status">
      {{ notice }}
    </p>
    <CorrectionForm
      v-if="auth.editMode"
      v-model:open="correctionOpen"
      :polygon="correctionPolygon"
      :layers="correctable"
      :timeline-year="timelineStore.activeYear"
      @saved="onCorrectionSaved"
    />
  </div>
</template>

<style scoped>
.measure-panel {
  position: relative;
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

/* Above the panel, so a message never widens it. */
.measure-notice {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  width: max-content;
  max-width: min(320px, calc(100vw - 24px));
  margin: 0;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted-foreground);
}

/* On a narrow screen the Flag button would push the heading off the edge. */
@media (max-width: 720px) {
  .measure-panel.has-flag {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}

.measure-tools {
  display: flex;
  flex-direction: row;
  gap: 8px;
  padding-right: 40px;
}
</style>
