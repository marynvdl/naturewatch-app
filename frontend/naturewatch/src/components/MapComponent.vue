<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import * as mapboxgl from 'mapbox-gl';
import BasemapButtonComponent from '@/components/BasemapButtonComponent.vue';
import { useConfig } from '@/store';
import useBasemapStore from '@/store/BasemapStore';

/** Using stores */
const configStore = useConfig();
const basemapStore = useBasemapStore();

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
// Current basemap from store
const currentBasemap = computed(() => basemapStore.currentBasemap());

const map = ref<mapboxgl.Map | null>(null);

const mapOptions: MapboxMap = {
  accessToken:
    'pk.eyJ1IjoibmF0dXJlLXdhdGNoIiwiYSI6ImNsZWU4MHN6MjBlZmwzcG12cTdnNGJwcGEifQ.gK_j2FlTCHa0bV0cUT_3IA',
  container: 'mapDiv',
  style: currentBasemap.value.url,
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
  <v-container fluid class="map-parent">
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
        <!-- Toggle Dark mode -->
        <v-btn
          id="darkmodeButton"
          class="darkmode-button"
          icon="mdi-theme-light-dark"
          @click="configStore.toggleTheme"
        />
        <!-- Toggle Basemap type -->
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
  bottom: 90px;
  right: 45px;
  z-index: 10;
}

.darkmode-button {
  position: absolute;
  top: 30px;
  right: 40px;
  z-index: 10;
}

.map-parent {
  padding: 0;
}
</style>
