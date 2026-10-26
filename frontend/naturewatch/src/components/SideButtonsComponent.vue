<script setup lang="ts">
import InfoButtonComponent from './InfoButtonComponent.vue';
</script>

<template>
  <!-- Separate container for the InfoButtonComponent positioned at the bottom left -->
  <v-container flat color="transparent" class="info-button-container m-0" dense>
    <v-row class="d-flex flex-column">
      <v-col class="pa-1" cols="12">
        <InfoButtonComponent />
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.info-button-container {
  position: absolute;
  bottom: 16px;
  left: 128px;
  z-index: 10;
  width: auto;
  box-shadow: none;
}
</style>
