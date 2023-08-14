<script setup lang="ts">
import { ref, defineProps, onMounted } from 'vue';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

/* eslint-disable vue/require-default-prop */
const props = defineProps({
  mapInstance: Object,
});

const map = ref(props.mapInstance);

onMounted(() => {
  const draw = new MapboxDraw({
    displayControlsDefault: true,
  });

  map.value?.addControl(draw, 'bottom-right');
});
</script>

<!-- <template>
</template> -->

<style scoped>

</style>
