<script setup lang="ts">
/** Props */
export interface Props {
  mapstylename: string;
}

const props = withDefaults(defineProps<Props>(), {
  mapstylename: 'satellite',
});

/** Emits */
const emit = defineEmits<{
  (e: 'changeBaseMap', value: string): void;
}>();

/** Methods */
function changeBaseMap() {
  console.log('comp:' + props.mapstylename);

  if (props.mapstylename === 'Mapbox Satellite Streets') {
    emit('changeBaseMap', 'mapbox://styles/mapbox/streets-v12');
  } else {
    emit(
      'changeBaseMap',
      'mapbox://styles/mapbox/satellite-streets-v12?optimize=true'
    );
  }
}
</script>

<template>
  <div>
    <v-btn variant="tonal" @click="changeBaseMap">Street</v-btn>
  </div>
</template>

<style scoped></style>
