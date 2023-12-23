<script setup lang="ts">
import type DrawerMenuItem from '@/interfaces/DrawerMenuItemInterface';
import useMapLayerStore from '@/store/MapLayerStore';
import useTimelineStore from '@/store/TimelineStore';
import { computed } from 'vue';
import logo from '@/assets/logo_nw.png';

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
  <v-container
    class="pt-2 pb-0 position-relative d-flex justify-center align-center"
  >
    <v-btn
      class="elevation-0 bg-transparent overflow-hidden rounded-circle"
      nav
      :disabled="!homeItem.to"
      :to="homeItem.to"
      size="60"
    >
      <v-img class="position-absolute" width="100%" cover :src="logo" />
    </v-btn>
  </v-container>
  <v-container class="pt-1 pb-0">
    <v-row align="center" justify="center">
      <template v-for="item in mapLayers" :key="item.title">
        <!-- Big buttons -->
        <v-col
          v-if="item.button_type === 'big'"
          class="mt-2 mb-0 px-2 pt-4 pb-1"
          cols="12"
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
        <v-col v-else-if="item.button_type === 'small'" class="pa-1" cols="12">
          <v-row no-gutters align="center">
            <v-col cols="auto" class="pr-1">
              <v-btn
                class="small-button"
                size="small"
                :disabled="!item.active"
                :variant="item.visible ? undefined : 'tonal'"
                :prepend-icon="item.icon"
                rounded="lg"
                :color="item.visible ? item.button_color : 'default'"
                elevation="0"
                width="90px"
                @click="handleButtonClick(item.title)"
              >
                <span class="button-text pa-0 ma-0">
                  {{ item.title }}
                </span>
              </v-btn>
            </v-col>
            <v-col cols="auto" class="pa-0 ma-0">
              <v-icon v-if="item.visible" size="x-small" color="grey-darken-2">
                mdi-circle-opacity
              </v-icon>
            </v-col>
          </v-row>
        </v-col>
      </template>
    </v-row>
  </v-container>
</template>

<style scoped>
.position-relative {
  position: relative;
}
.position-absolute {
  position: absolute;
}
.button-text {
  text-transform: capitalize;
  font-size: 11px;
  margin-left: 8px;
}
.small-button {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}
</style>
