<script setup lang="ts">
// This starter template is using Vue 3 <script setup> SFCs
// Check out https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup
import MapBox from '@/components/MapComponent.vue';

const jsonLd = JSON.stringify(
  {
    '@schema': 'https://json.schemastore.org/jsonld.json',
    '@context': 'http://schema.org',
    '@type': 'WebSite',
    name: 'Project NatureWatch',
    url: 'https://github.com/logue/vite-vuetify-ts-starter',
    description: 'A geospatial web application using Vue3, Vuetify and Mapbox',
  },
  null,
  2
);
</script>

<template>
  <v-container class="map-parent" fluid>
    <map-box msg="Hello World" />
  </v-container>
  <teleport to="head">
    <meta
      name="keyword"
      content="nature,watch,globe,space,sattelite,geo,conservation,human,footprint,geospatial"
    />
    <meta name="description" content="A geospatial web application using Vue3, Vuetify and Mapbox" />
    <component :is="'script'" type="application/ld+json">
      {{ jsonLd }}
    </component>
  </teleport>
</template>

<style scoped>
.map-parent {
  padding: 0
}
</style>