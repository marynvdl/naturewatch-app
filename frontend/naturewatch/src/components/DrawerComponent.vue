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
    <v-list-item nav :disabled="!homeItem.to" :prepend-icon="homeItem.icon" :to="homeItem.to" link />
  </v-list>
  <v-container>
    <template v-for="item in mapLayers" :key="item.title">
      <!-- Big buttons -->
      <v-row v-if="item.button_type === 'big'" align="center" justify="center">
        <v-col class="my-0" cols="auto">
          <div class="d-flex flex-column align-center">
            <v-btn variant="tonal" :icon="item.icon" block rounded="lg" size="100"
              :color="item.visible ? 'light-green-darken-4' : 'default'" @click="toggleLayerVisibility(item.title)" />
            <span class="mb-0" style="font-size: 12px">{{ item.title }}</span>
          </div>
        </v-col>
      </v-row>
      <!-- Small buttons -->
      <v-row v-else-if="item.button_type === 'small'" align="center" justify="center">
        <v-col cols="auto">
          <div class="d-flex flex-column align-center">
            <v-btn variant="tonal" :icon="item.icon" size="large" rounded="lg"
              :color="item.visible ? 'light-green-darken-4' : 'default'" @click="toggleLayerVisibility(item.title)">
              <template #default>
                <v-icon color="grey-darken-3" />
              </template>
            </v-btn>
            <span class="mb-2" style="font-size: 12px">
              {{ item.title }}
            </span>
          </div>
        </v-col>
      </v-row>
    </template>
  </v-container>
</template>
