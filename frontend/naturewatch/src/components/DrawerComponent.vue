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
const sliderRef = ref<HTMLElement | null>(null);
const iconRefs = ref<Record<string, HTMLElement | undefined>>({});

/**
 * Generate ref name for each icon
 * @param {string} title - Layer title.
 */
// eslint-disable-next-line no-unused-vars
function iconRefName(title: string) {
  return `icon-${title}`;
}

/**
 * Handle click event outside of opacity slider.
 * @param {event} event - The mouse click event.
 */
function handleClickOutside(event: MouseEvent) {
  const buffer = 0; // Buffer size in pixels

  if (sliderRef.value) {
    const { top, right, bottom, left } =
      sliderRef.value.getBoundingClientRect();

    // Check if the click is within the buffer zone around the slider
    const isClickInsideBuffer =
      event.clientX >= left - buffer &&
      event.clientX <= right + buffer + 70 &&
      event.clientY >= top - buffer &&
      event.clientY <= bottom + buffer;

    if (!isClickInsideBuffer) {
      const isClickInsideIcon = Object.values(iconRefs.value).some(
        iconEl =>
          iconEl &&
          (iconEl === event.target || iconEl.contains(event.target as Node))
      );

      if (!isClickInsideIcon) {
        sliderVisible.value = false;
      }
    }
  }
}

watch(sliderVisible, newVal => {
  if (newVal) {
    window.addEventListener('click', handleClickOutside, true);
  } else {
    window.removeEventListener('click', handleClickOutside, true);
  }
});

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
 * @param {title} title - The title of the layer.
 */
function openSlider(event: MouseEvent, title: string) {
  iconRefs.value[title] = event.currentTarget as HTMLElement;

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
    class="pt-2 pb-5 position-relative d-flex justify-center align-center"
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
          class="px-1 pt-5 pb-3"
          cols="12"
        >
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
                <span class="big-button-text pa-0 ma-0">
                  {{ item.title }}
                </span>
              </v-btn>
            </v-col>
            <v-col cols="auto" class="pa-0 ma-0">
              <v-icon
                v-if="item.visible"
                ref="iconRefs[iconRefName(item.title)]"
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
                ref="iconRefs[iconRefName(item.title)]"
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
  <div
    v-if="sliderVisible"
    ref="sliderRef"
    :style="sliderStyles"
    class="slider-container"
  >
    <v-slider
      v-model="currentOpacity"
      min="0"
      max="100"
      step="5"
      track-size="3"
      :thumb-size="13"
      thumb-label="always"
    />
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
.big-button-text {
  text-transform: capitalize;
  font-size: 13px;
  margin-left: 1px;
}
.small-button {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}
.slider-container {
  position: absolute;
  z-index: 1005;
  width: 110px;
}
</style>
