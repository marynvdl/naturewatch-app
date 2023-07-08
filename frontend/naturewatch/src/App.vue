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
import DrawerComponent from '@/components/DrawerComponent.vue';
import logo from '@/assets/logo.svg';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useTheme } from 'vuetify';

// Stores
import { useGlobal, useConfig } from '@/store';
import useDrawerStore from '@/store/DrawerStore';
import useBasemapStore from '@/store/BasemapStore';

/** Using stores */
const drawerStore = useDrawerStore();
const globalStore = useGlobal();
const configStore = useConfig();
const basemapStore = useBasemapStore();

/** Title */
const title = import.meta.env.VITE_APP_TITLE || 'NatureWatch';

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

/** Drawer */
const drawerVisible = computed(() => drawerStore.visible);
const drawerWidth = computed(() => drawerStore.width);
const toggleDrawerVisibility = drawerStore.toggleDrawerVisibility;

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
});
</script>

<template>
  <v-app>
    <v-navigation-drawer v-model="drawerVisible" :width="drawerWidth">
      <drawer-component />
    </v-navigation-drawer>

    <v-main class="pa-0">
      <v-btn
        class="drawer-button"
        :style="
          drawerVisible ? `left: ${parseInt(drawerWidth) - 15}px` : 'left: 15px'
        "
        :icon="drawerVisible ? 'mdi-menu-open' : 'mdi-menu'"
        elevation="2"
        @click="toggleDrawerVisibility"
      />
      <router-view v-slot="{ Component, route }">
        <component :is="Component" :key="route.path" />
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

/* Override Mapbox CSS that causes issues with layout */
.mapboxgl-ctrl-bottom-left,
.mapboxgl-ctrl-bottom-right,
.mapboxgl-ctrl-top-left,
.mapboxgl-ctrl-top-right {
  position: inherit;
}

.drawer-button {
  position: absolute;
  top: 80px;
  z-index: 1005;
  transition: left 0.2s ease-in-out;
}
</style>
