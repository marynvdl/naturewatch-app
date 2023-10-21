<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import turfLength from '@turf/length';
import turfArea from '@turf/area';
import turfAlong from '@turf/along';import turfCentroid from '@turf/centroid';
import useBasemapStore from '@/store/BasemapStore';


/** Using stores */
const basemapStore = useBasemapStore();

// Get current basemap from store
const currentBasemap = computed(() => basemapStore.currentBasemap);

const themeSatellite = computed(() => {
  return currentBasemap.value.title === 'Satellite'
    ? true
    : false;
});

/* eslint-disable vue/require-default-prop */
const props = defineProps({
  mapInstance: Object,
});

const map = ref(props.mapInstance);

// Keep track of stored labels
const storedLabels = ref<Array<{ id: string, description: string, coordinates: number[] | undefined }>>([]);

onMounted(() => {
  const draw = new MapboxDraw({
    displayControlsDefault: false,
    controls: {
          line_string: true,
          polygon: true,
          trash: true,
        },
  });

  map.value?.addControl(draw, 'bottom-right');

  // After adding the Draw control, append your custom button
  // Find the container with the trash button
  const trashButton = document.querySelector('.mapbox-gl-draw_trash');
  if (trashButton) {
    const controlGroup = trashButton.closest('.mapboxgl-ctrl-group.mapboxgl-ctrl');
    if (controlGroup) {
      const deleteAllButton = document.createElement('button');
      deleteAllButton.className = 'mapbox-gl-draw_ctrl-draw-btn delete-all';
      deleteAllButton.title = 'Delete All';
      deleteAllButton.innerHTML = 'DA'; 
      deleteAllButton.onclick = () => {
        draw.deleteAll();

        // Remove all measurement labels
        storedLabels.value.forEach(label => {
        if (map.value?.getSource(label.id)) {
          map.value.removeLayer(label.id);
          map.value.removeSource(label.id);
          }
        });

        // Clear the storedLabels
        storedLabels.value = [];
      };

      controlGroup.appendChild(deleteAllButton);
    }
  }

});

// Measure with turf
map.value?.on('draw.create', measure);
map.value?.on('draw.update', measure);
map.value?.on('draw.delete', removeMeasurementLabel);

// Function to format area
function formatArea(areaM2: number): string {
  if (areaM2 >= 1_000_000) {
    // Convert to km² and format
    return `${(areaM2 / 1_000_000).toLocaleString('en-US', {maximumFractionDigits: 2})} km²`;
  } else if (areaM2 >= 10_000) {
    // Convert to hectares and format
    return `${(areaM2 / 10_000).toLocaleString('en-US', {maximumFractionDigits: 2})} ha`;
  } else {
    // Format as m²
    return `${areaM2.toLocaleString('en-US', {maximumFractionDigits: 2})} m²`;
  }
}

// Function to format distance
function formatDistance(distanceM: number): string {
  if (distanceM >= 1000) {
    // Convert to km and format
    return `${(distanceM / 1000).toLocaleString('en-US', {maximumFractionDigits: 2})} km`;
  } else {
    // Format as m
    return `${distanceM.toLocaleString('en-US', {maximumFractionDigits: 2})} m`;
  }
}

// Function to measure area or distance
function measure(event: any) {
  const geometry = event.features[0].geometry;
  let label = '';
  let position;

  // Unique ID for the source and layer
  const id = `label-${event.features[0].id}`;

  if (geometry.type === 'LineString') {
    const distance = turfLength(geometry, { units: 'meters' }); // Ensure using meters
    label = formatDistance(distance);

    // Calculate position for the label for LineString
    position = turfAlong(geometry, distance / 2, { units: 'meters' });
  } else if (geometry.type === 'Polygon') {
    const area = turfArea(geometry); // Returns area in square meters
    label = formatArea(area);

    // Calculate position for the label for Polygon
    position = turfCentroid(geometry);
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
    coordinates: position?.geometry.coordinates
  });
}


function removeMeasurementLabel(event: any) {
    const id = `label-${event.features[0].id}`;
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
                    coordinates: label.coordinates
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

<!-- <template>
</template> -->

<style scoped>

</style>
