<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  ref,
  watch,
  type ComputedRef,
  type Ref,
  type WritableComputedRef,
} from 'vue';
import logo from '@/assets/logo.svg';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useTheme } from 'vuetify';

// Stores
import { useGlobal, useConfig } from '@/store';
import useBasemapStore from '@/store/BasemapStore';

/** Using stores */
const globalStore = useGlobal();
const configStore = useConfig();
const basemapStore = useBasemapStore();

/** Title */
const title = import.meta.env.VITE_APP_TITLE || 'Nature Watch';

/** Theme */
const theme = useTheme();
const currentBasemap = computed(() => basemapStore.currentBasemap);

watch(
  () => configStore.themeDark,
  newVal => {
    setTheme();
  },
  { immediate: true }
);

watch(
  () => basemapStore.currentBasemap.title,
  newVal => {
    setTheme();
  },
  { immediate: true }
);

/** Methods */
function setTheme() {
  const isSatellite = currentBasemap.value.title === 'Satellite';
  const isDark = configStore.themeDark;

  if (isSatellite) {
    theme.global.name.value = isDark ? 'satelliteDark' : 'satelliteLight';
  } else {
    theme.global.name.value = isDark ? 'dark' : 'light';
  }
}

/** loading overlay visibility */
const loading: WritableComputedRef<boolean> = computed({
  get: () => globalStore.loading,
  set: v => globalStore.setLoading(v),
});

/** Appbar progressbar value */
// const progress: ComputedRef<number | null> = computed(
//   () => globalStore.progress
// );

/** Snackbar visibility */
const snackbar: Ref<boolean> = ref(false);

/** Snackbar text */
const snackbarText: ComputedRef<string> = computed(() => globalStore.message);

// When snackbar text has been set, show snackbar.
watch(
  () => globalStore.message,
  async value => {
    snackbar.value = value !== '';
    await nextTick();
  }
);

/** Clear store when snackbar hide */
const onSnackbarChanged = async () => {
  globalStore.setMessage();
  await nextTick();
};

// When loading overlay value change, force redraw screen.
watch(loading, async () => nextTick());

onMounted(() => {
  document.title = title;
  loading.value = false;
  setTheme();
  const preloader = document.getElementById('preloader');
  if (preloader) {
    preloader.style.display = 'none';
  }
});
</script>

<template>
  <v-app>
    <v-main class="pa-0">
      <router-view v-slot="{ Component, route: activeRoute }">
        <component :is="Component" :key="activeRoute.path" />
      </router-view>
    </v-main>
    <v-overlay v-model="loading" app class="justify-center align-center">
      <v-progress-circular indeterminate size="64" />
    </v-overlay>

    <v-snackbar v-model="snackbar" @update:model-value="onSnackbarChanged">
      {{ snackbarText }}
      <template #actions>
        <v-btn icon @click="onSnackbarChanged">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </template>
    </v-snackbar>
  </v-app>
  <teleport to="head">
    <link rel="icon" :href="logo" type="image/svg+xml" />
  </teleport>
</template>

<style lang="scss">
@use 'vuetify/settings';

html {
  // Fix always scrollbar shown.
  overflow-y: auto;
  // Modern scrollbar style
  scrollbar-width: thin;
  scrollbar-color: map-get(settings.$grey, 'lighten-2')
    map-get(settings.$grey, 'base');
}

::-webkit-scrollbar {
  width: 0.5rem;
  height: 0.5rem;
}

::-webkit-scrollbar-track {
  box-shadow: inset 0 0 0.5rem rgba(0, 0, 0, 0.1);
  background-color: map-get(settings.$grey, 'lighten-2');
}

::-webkit-scrollbar-thumb {
  border-radius: 0.5rem;
  background-color: map-get(settings.$grey, 'base');
  box-shadow: inset 0 0 0.5rem rgba(0, 0, 0, 0.1);
}

// Fixed a bug that the theme color is interrupted when scrolling
.v-application {
  overflow-y: auto;
}

// Fix app-bar's progress-bar
.v-app-bar .v-progress-linear {
  position: absolute;
  bottom: 0;
}

.mapboxgl-ctrl-bottom-right {
  position: absolute;
  right: 12px;
  bottom: 56px;
  left: auto;
  top: auto;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 8px;
  margin: 0;
  width: auto;
}

.mapboxgl-ctrl-bottom-right .mapboxgl-ctrl {
  margin: 0;
  float: none;
}

.mapboxgl-ctrl-bottom-right .mapboxgl-ctrl-group {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #f8f9f9;
  box-shadow: none;
  overflow: hidden;
}

.mapboxgl-ctrl-bottom-right .mapboxgl-ctrl-group:has(.mapboxgl-ctrl-zoom-in) {
  order: 1;
  display: flex;
  flex-direction: column;
}

.mapboxgl-ctrl-bottom-right .mapboxgl-ctrl-group:has(.mapboxgl-ctrl-geolocate),
.mapboxgl-ctrl-bottom-right > .mapboxgl-ctrl-geolocate {
  order: 2;
}

.mapboxgl-ctrl-bottom-right .mapboxgl-ctrl-group:has(.mapbox-gl-draw_line) {
  order: 2;
  display: flex;
  flex-direction: row;
}

.mapboxgl-ctrl-bottom-right .mapboxgl-ctrl-group:not(:has(button)) {
  display: none;
}
</style>
