<script setup lang="ts">
import { useMeasureStore } from '@/store/MeasureStore';
import { useConfig } from '@/store';

const configStore = useConfig();
const measureStore = useMeasureStore();

const handleButtonClick = (type: string) => {
  if (type === 'delete-all') {
    measureStore.triggerDeleteAll();
    }
};

</script>

<template>
  <!-- Transparent toolbar floating on the top right -->
  <v-container flat color="transparent" class="floating-toolbar m-0" dense>
    <v-row class="d-flex flex-column">
      <v-col class="pa-1" cols="12">
        <v-btn icon @click="handleButtonClick('delete-all')" variant="tonal" title="Delete All">
          <v-icon>mdi-delete-empty</v-icon>
        </v-btn>
      </v-col>
      <v-col class="pa-1" cols="12">
        <v-btn icon variant="tonal" @click="configStore.toggleTheme" title = "Toggle Dark Mode">
          <v-icon>mdi-theme-light-dark</v-icon>
        </v-btn>
      </v-col>
    </v-row>
  </v-container>
</template>


<style scoped>
/* Position the toolbar at the top right corner of the map */
.floating-toolbar {
  position: absolute;
  top: 260px;
  right: 0px;
  z-index: 10;
  width: 80px;
  box-shadow: none;
}

</style>
