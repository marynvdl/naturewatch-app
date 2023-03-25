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
const mapstylename = ref<string | undefined>('Mapbox Satellite Streets');

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
function changeBaseMap(styleUrl: string) {
  if (map.value !== null) {
    mapstylename.value = map.value.getStyle().name;
    console.log(mapstylename.value);
    map.value.setStyle(styleUrl);
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

      <div id="mapDiv" />
      <BasemapButtonComponent
        :mapstylename="mapstylename"
        @change-base-map="changeBaseMap"
      />
    </v-responsive>
  </v-container>
</template>

<style scoped>
.logo:hover {
  will-change: filter;
  filter: drop-shadow(0 0 1em #2196f3aa);
}

#mapDiv {
  height: 100vh;
}
</style>
