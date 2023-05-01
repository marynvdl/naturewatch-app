<script setup lang="ts">
import { onMounted, ref } from 'vue';
import * as mapboxgl from 'mapbox-gl';
import BasemapButtonComponent from '@/components/BasemapButtonComponent.vue';

/** Interfaces */
interface MapboxMap {
  accessToken: string;
  container: string;
  style: string;
  center: [number, number];
  zoom: number;
}

/** Props */
defineProps<{
  msg: string;
}>();

/** Data */
const map = ref<mapboxgl.Map | null>(null);

const mapOptions: MapboxMap = {
  accessToken:
    'pk.eyJ1Ijoic29jaWFsZXhwbG9yZXIiLCJhIjoiREFQbXBISSJ9.dwFTwfSaWsHvktHrRtpydQ',
  container: 'mapDiv',
  style: 'mapbox://styles/mapbox/satellite-streets-v12?optimize=true',
  center: [20.23928, 7.35074],
  zoom: 5,
};

onMounted(() => {
  map.value = new mapboxgl.Map(mapOptions);
});

/** Methods */
function handleBasemapChanged(newStyleUrl: string) {
  if (map.value) {
    map.value.setStyle(newStyleUrl);
  }
}
</script>

<template>
  <v-container class="fill-height">
    <v-responsive class="d-flex align-center text-center fill-height">
      <!-- Logo -->
      <!-- <v-img
        src="@/assets/logo.svg"
        alt="vuetify"
        :width="256"
        class="logo mx-auto"
      /> -->
      <!-- <p>{{ msg }}</p> -->
      <div class="map-container">
        <div id="mapDiv" />
        <BasemapButtonComponent
          id="basmapButton"
          class="basemap-button"
          @basemap-changed="handleBasemapChanged"
        />
      </div>
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
  bottom: 20px;
  left: 20px;
  z-index: 10;
}
</style>
