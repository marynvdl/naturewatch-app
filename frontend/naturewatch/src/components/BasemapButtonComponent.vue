<script setup lang="ts">
/** Props */
// export interface Props {
//   basemaptype: string;
// }

// const props = withDefaults(defineProps<Props>(), {
//   basemaptype: 'satellite',
// });

/** Emits */
const emit = defineEmits<{
  (e: 'changeBaseMap', value: string): void;
}>();
</script>

<template>
  <div>
    <v-btn variant="tonal" @click="emit('changeBaseMap', 'street')">
      Street
    </v-btn>
  </div>
</template>

<style scoped></style>
