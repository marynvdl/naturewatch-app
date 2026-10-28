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
import { X } from '@lucide/vue';
import logo from '@/assets/logo.svg';
import 'mapbox-gl/dist/mapbox-gl.css';

// Stores
import { useGlobal } from '@/store';

/** Using stores */
const globalStore = useGlobal();

/** Title */
const title = import.meta.env.VITE_APP_TITLE || 'Nature Watch';

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
  const preloader = document.getElementById('preloader');
  if (preloader) {
    preloader.style.display = 'none';
  }
});
</script>

<template>
  <div class="app-frame">
    <router-view v-slot="{ Component, route: activeRoute }">
      <component :is="Component" :key="activeRoute.path" />
    </router-view>
    <div v-if="loading" class="loading-overlay" role="status" aria-label="Loading">
      <span class="spinner" />
    </div>
    <div v-if="snackbar" class="snackbar" role="status">
      <p>{{ snackbarText }}</p>
      <button type="button" aria-label="Close" @click="onSnackbarChanged">
        <X :size="16" />
      </button>
    </div>
  </div>
  <teleport to="head">
    <link rel="icon" :href="logo" type="image/svg+xml" />
  </teleport>
</template>

<style>
html {
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #e0e0e0 #9e9e9e;
}

::-webkit-scrollbar {
  width: 0.5rem;
  height: 0.5rem;
}

::-webkit-scrollbar-track {
  box-shadow: inset 0 0 0.5rem rgba(0, 0, 0, 0.1);
  background-color: #e0e0e0;
}

::-webkit-scrollbar-thumb {
  border-radius: 0.5rem;
  background-color: #9e9e9e;
  box-shadow: inset 0 0 0.5rem rgba(0, 0, 0, 0.1);
}

.app-frame {
  min-height: 100vh;
  overflow-y: auto;
}

.loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(248, 249, 249, 0.72);
}

.spinner {
  width: 64px;
  height: 64px;
  border: 4px solid var(--border);
  border-top-color: var(--foreground);
  border-radius: 50%;
  animation: app-spin 0.8s linear infinite;
}

@keyframes app-spin {
  to {
    transform: rotate(360deg);
  }
}

.snackbar {
  position: fixed;
  left: 50%;
  bottom: 24px;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(420px, calc(100vw - 32px));
  padding: 12px 12px 12px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--foreground);
  color: var(--primary-foreground);
  transform: translateX(-50%);
}

.snackbar p {
  margin: 0;
  font-size: 14px;
}

.snackbar button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
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
