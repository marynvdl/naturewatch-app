<script setup lang="ts">
import { ref, defineProps, onMounted, watch, onBeforeUnmount } from 'vue';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import turfLength from '@turf/length';
import turfArea from '@turf/area';
import turfAlong from '@turf/along';import turfCentroid from '@turf/centroid';


/* eslint-disable vue/require-default-prop */
const props = defineProps({
  mapInstance: Object,
});

const map = ref(props.mapInstance);

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
});

// Measure with turf
map.value?.on('draw.create', measure);
map.value?.on('draw.update', measure);

function measure(event: any) {
  const geometry = event.features[0].geometry;
  let label = '';
  let position;

  // Unique ID for the source and layer
  const id = `measurement-${Date.now()}`;

  if (geometry.type === 'LineString') {
    const distance = turfLength(geometry);
    label = `${distance.toFixed(0)} km`;

    // Calculate position for the label for LineString
    position = turfAlong(geometry, distance / 2);
  } else if (geometry.type === 'Polygon') {
    const area = turfArea(geometry);
    label = `${(area / 1000000).toFixed(0)} km²`;

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
  });
}

// Remove enent listeners when component is destroyed
const unwatch = watch(map, (newValue, oldValue) => {
  if (oldValue) {
    oldValue.off('draw.create', measure);
    oldValue.off('draw.update', measure);
  }
  if (newValue) {
    newValue.on('draw.create', measure);
    newValue.on('draw.update', measure);
  }
});

onBeforeUnmount(() => {
  unwatch();
});


</script>

<!-- <template>
</template> -->

<style scoped>

</style>
