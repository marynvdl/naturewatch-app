<template>
  <main class="w-screen h-screen">
    <div id="mapContainer" class="w-full h-full"></div>
  </main>
</template>

<script>
import mapboxgl from "mapbox-gl";

export default {
  name: "BaseMap",
  data() {
    return {
      accessToken: "pk.eyJ1Ijoic29jaWFsZXhwbG9yZXIiLCJhIjoiREFQbXBISSJ9.dwFTwfSaWsHvktHrRtpydQ"
    };
  },
  mounted() {
    mapboxgl.accessToken = this.accessToken;
    new mapboxgl.Map({
      container: "mapContainer",
      style: "mapbox://styles/mapbox/satellite-streets-v12?optimize=true",
      center: [20.23928, 7.35074],
      zoom: 5,
    });
  }
};
</script>

<style lang="scss">
html,
body {
  margin: 0;
}
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
}
.w-screen {
  width: 100vw;
}
.h-screen {
  height: 100vh;
}
.h-full {
  height: 100%;
}
.w-full {
  width: 100%;
}
</style>