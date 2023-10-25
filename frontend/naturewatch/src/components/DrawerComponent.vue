<script setup lang="ts">
import type DrawerMenuItem from '@/interfaces/DrawerMenuItemInterface';
import useMapLayerStore from '@/store/MapLayerStore';
import useTimelineStore from '@/store/TimelineStore';
import { computed } from 'vue';
import logo from '@/assets/logo_nw.png';
import InfoButtonComponent from './InfoButtonComponent.vue';

// Using stores
const mapLayerStore = useMapLayerStore();
const timelineStore = useTimelineStore();

// Accessing values from the stores
// Map layers and their visibility
const mapLayers = computed(() => mapLayerStore.MapLayers);
const toggleLayerVisibility = mapLayerStore.toggleLayerVisibility;
const visibleMapLayers = computed(() => mapLayerStore.getVisibleLayers());
// Timeline visibility
const toggleTimelineVisibility = timelineStore.toggleTimelineVisibility;

/** Drawer menu items */
const homeItem: DrawerMenuItem = {
  title: 'Home',
  icon: 'mdi-home',
  isNav: true,
  to: { name: 'Home' },
};

/** Methods */
/** Handle button click to toggle layer */
function handleButtonClick(title: string) {
  toggleLayerVisibility(title);
  if (visibleMapLayers.value.length === 0) {
    toggleTimelineVisibility(false);
  } else if (visibleMapLayers.value.length > 0) {
    toggleTimelineVisibility(true);
  }
}
</script>

<template>
  <v-container class="position-relative d-flex justify-center align-center">
    <v-btn
      class="elevation-0 bg-transparent overflow-hidden rounded-circle"
      nav
      :disabled="!homeItem.to"
      :to="homeItem.to"
      size="80"
    >
      <v-img class="position-absolute" width="100%" cover :src="logo" />
    </v-btn>
  </v-container>
  <v-container>
    <v-row align="center" justify="center">
      <template v-for="item in mapLayers" :key="item.title">
        <!-- Big buttons -->
        <v-col
          v-if="item.button_type === 'big'"
          class="mt-3 mb-0 px-4"
          cols="auto"
        >
          <div class="d-flex flex-column align-center aspect-ratio--1-1">
            <v-btn
              :disabled="!item.active"
              :variant="item.visible ? undefined : 'tonal'"
              :icon="item.icon"
              rounded="lg"
              :color="item.visible ? item.button_color : 'default'"
              elevation="0"
              @click="handleButtonClick(item.title)"
            >
              <template #default>
                <v-icon color="grey-darken-3" />
              </template>
            </v-btn>
            <span
              class="mb-0"
              :class="!item.active ? 'text-disabled' : ''"
              style="font-size: 12px"
            >
              {{ item.title }}
            </span>
          </div>
        </v-col>
        <!-- Small buttons -->
        <v-col
          v-else-if="item.button_type === 'small'"
          class="pa-1"
          cols="auto"
        >
          <div class="d-flex flex-column align-center aspect-ratio--1-1">
            <v-btn
              :disabled="!item.active"
              :variant="item.visible ? undefined : 'tonal'"
              :icon="item.icon"
              rounded="lg"
              :color="item.visible ? item.button_color : 'default'"
              elevation="0"
              @click="handleButtonClick(item.title)"
            >
              <template #default>
                <v-icon color="grey-darken-3" />
              </template>
            </v-btn>
            <span
              class="mb-0"
              :class="!item.active ? 'text-disabled' : ''"
              style="font-size: 12px"
            >
              {{ item.title }}
            </span>
          </div>
        </v-col>
      </template>
    </v-row>
  </v-container>
  <v-container align-self="end">
    <InfoButtonComponent></InfoButtonComponent>
  </v-container>
</template>

<style scoped>
.position-relative {
  position: relative;
}
.position-absolute {
  position: absolute;
}
</style>
