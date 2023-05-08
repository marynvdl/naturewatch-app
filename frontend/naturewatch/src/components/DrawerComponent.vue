<script setup lang="ts">
import type DrawerMenuItem from '@/interfaces/DrawerMenuItemInterface';
import useMapLayerStore from '@/store/MapLayerStore';
import { computed } from 'vue';

// Using the Map Layer store
const mapLayerStore = useMapLayerStore();

// Accessing the Map Layers and Toggle layer visibility function
const mapLayers = computed(() => mapLayerStore.MapLayers);
const toggleLayerVisibility = mapLayerStore.toggleLayerVisibility;

/** Drawer menu items */
const homeItem: DrawerMenuItem = {
  title: 'Home',
  icon: 'mdi-home',
  isNav: true,
  to: { name: 'Home' },
};
</script>

<template>
  <v-list>
    <v-list-item
      nav
      :disabled="!homeItem.to"
      :prepend-icon="homeItem.icon"
      :to="homeItem.to"
      link
    />
  </v-list>
  <v-container>
    <!-- Big buttons -->
    <v-row align="center" justify="center">
      <template v-for="item in mapLayers" :key="'big-' + item.title">
        <v-col v-if="item.button_type === 'big'" class="my-0" cols="auto">
          <div class="d-flex flex-column align-center position-relative">
            <v-btn
              :variant="item.visible ? undefined : 'tonal'"
              block
              rounded="lg"
              class="position-relative d-flex align-center justify-center"
              style="min-height: 100px; min-width: 100px"
              @click="toggleLayerVisibility(item.title)"
            >
              <v-img
                class="position-absolute rounded-lg"
                width="100%"
                cover
                :src="item.image"
              />
              <span class="text-center" style="z-index: 1">
                {{ item.title }}
              </span>
            </v-btn>
          </div>
        </v-col>
      </template>
    </v-row>

    <!-- Small buttons -->
    <v-row align="center" justify="center">
      <template v-for="item in mapLayers" :key="'small-' + item.title">
        <v-col v-if="item.button_type === 'small'" class="pa-2" cols="">
          <div class="d-flex flex-column align-center">
            <v-btn
              :variant="item.visible ? undefined : 'tonal'"
              :icon="item.icon"
              size="large"
              rounded="lg"
              :color="item.visible ? item.button_color : 'default'"
              elevation="0"
              @click="toggleLayerVisibility(item.title)"
            >
              <template #default>
                <v-icon color="grey-darken-3" />
              </template>
            </v-btn>
            <span class="mb-2" style="font-size: 12px">
              {{ item.title }}
            </span>
          </div>
        </v-col>
      </template>
    </v-row>
  </v-container>
</template>

<style scoped>
.position-relative {
  position: relative;
}
</style>
