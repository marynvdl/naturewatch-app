<script setup lang="ts">
import type DrawerMenuItem from '@/interfaces/DrawerMenuItemInterface';
import useMapLayerStore from '@/store/MapLayerStore';
import useTimelineStore from '@/store/TimelineStore';
import { ref, computed, watch } from 'vue';
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

/** Opacity slider */

// New reactive property for tracking which slider is visible
const sliderVisible = ref(false);
const sliderStyles = ref({});
const currentOpacity = ref(100);
const currentLayerTitle = ref('');

/**
 * Updates the opacity of a layer.
 * @param {string} title - The title of the layer.
 * @param {number} opacity - The new opacity value.
 */
function updateOpacity(title: string, opacity: number) {
  mapLayerStore.updateLayerOpacity(title, opacity);
}

/**
 * Opens the slider next to the clicked icon and sets its position.
 * @param {MouseEvent} event - The mouse event.
 * @param {string} title - The title of the layer.
 */
function openSlider(event: MouseEvent, title: string) {
  if (currentLayerTitle.value === title && sliderVisible.value) {
    sliderVisible.value = false;
    return;
  }

  const iconRect = (event.target as HTMLElement).getBoundingClientRect();
  sliderStyles.value = {
    position: 'absolute',
    top: `${iconRect.top - 8}px`,
    left: `${iconRect.right + 10}px`, // 10px to the right of the icon
    zIndex: 1000, // Ensure it's above other elements
  };
  currentOpacity.value = mapLayerStore.getLayerOpacity(title);
  currentLayerTitle.value = title;
  sliderVisible.value = true;
}

watch(currentOpacity, newOpacity => {
  if (sliderVisible.value) {
    updateOpacity(currentLayerTitle.value, newOpacity);
  }
});
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
              <v-icon
                v-if="item.visible"
                size="x-small"
                :color="
                  currentLayerTitle === item.title && sliderVisible
                    ? 'grey-darken-4'
                    : 'grey-lighten-2'
                "
                @click="event => openSlider(event, item.title)"
              >
                mdi-circle-opacity
              </v-icon>
            </v-col>
          </v-row>
        </v-col>
      </template>
    </v-row>
  </v-container>
  <div v-if="sliderVisible" :style="sliderStyles" class="slider-container">
    <v-slider v-model="currentOpacity" min="0" max="100" step="1" />
  </div>
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
.slider-container {
  position: absolute;
  z-index: 1005;
  width: 100px;
}
</style>
