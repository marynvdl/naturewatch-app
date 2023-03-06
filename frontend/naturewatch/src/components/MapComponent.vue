<script setup lang="ts">
import {
  onMounted
} from 'vue';
import * as mapboxgl from 'mapbox-gl';


/** Props */
defineProps<{
  msg: string;
}>();


onMounted(() => {
    new mapboxgl.Map({
      accessToken: "pk.eyJ1Ijoic29jaWFsZXhwbG9yZXIiLCJhIjoiREFQbXBISSJ9.dwFTwfSaWsHvktHrRtpydQ",
      container: "mapDiv",
      style: "mapbox://styles/mapbox/satellite-streets-v12?optimize=true",
      center: [20.23928, 7.35074],
      zoom: 5,
    });
});

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

      <div id="mapDiv"></div>
      
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
