<script setup lang="ts">
import { useMeasureStore } from '@/store/MeasureStore';
import { useConfig } from '@/store';
import InfoButtonComponent from './InfoButtonComponent.vue';

const configStore = useConfig();
const measureStore = useMeasureStore();

const handleButtonClick = (type: string) => {
  if (type === 'delete-all') {
    measureStore.triggerDeleteAll();
  }
};
</script>

<template>
  <!-- Transparent toolbar floating on the top right for delete and toggle buttons -->
  <v-container flat color="transparent" class="floating-toolbar m-0" dense>
    <v-row class="d-flex flex-column">
      <v-col class="pa-1" cols="12">
        <v-btn
          size="small"
          icon
          @click="handleButtonClick('delete-all')"
          variant="flat"
          title="Delete All"
        >
          <v-icon>mdi-delete-empty</v-icon>
        </v-btn>
      </v-col>
      <v-col class="pa-1" cols="12">
        <v-btn
          size="small"
          icon
          variant="flat"
          @click="configStore.toggleTheme"
          title="Toggle Dark Mode"
        >
          <v-icon>mdi-theme-light-dark</v-icon>
        </v-btn>
      </v-col>
    </v-row>
  </v-container>

  <!-- Separate container for the InfoButtonComponent positioned at the bottom right -->
  <v-container flat color="transparent" class="info-button-container m-0" dense>
    <v-row class="d-flex flex-column">
      <v-col class="pa-1" cols="12">
        <InfoButtonComponent></InfoButtonComponent>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.floating-toolbar {
  position: absolute;
  top: 260px;
  right: 0px;
  z-index: 10;
  width: 80px;
  box-shadow: none;
}

.info-button-container {
  position: absolute;
  bottom: 0px; /* position at the bottom of the page */
  right: 0px;
  z-index: 10;
  width: 80px;
  box-shadow: none;
}
</style>
