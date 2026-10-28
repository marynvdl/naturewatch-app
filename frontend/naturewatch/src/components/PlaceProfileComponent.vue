<script setup lang="ts">
import { X } from '@lucide/vue';

defineProps<{
  name: string;
}>();

defineEmits<{
  close: [];
  zoom: [];
}>();
</script>

<template>
  <section class="place-profile" aria-label="Place">
    <button
      type="button"
      class="place-close"
      aria-label="Close place"
      @click="$emit('close')"
    >
      <X :size="16" :stroke-width="2.25" aria-hidden="true" />
    </button>
    <h2 class="panel-heading">{{ name }}</h2>
    <button type="button" class="map-control" @click="$emit('zoom')">
      Zoom to place
    </button>
  </section>
</template>

<style scoped>
.place-profile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 16px;
}

.panel-heading {
  min-width: 0;
  padding-right: 40px;
  overflow-wrap: anywhere;
}

.place-close {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--map-control-text, #24312c);
  cursor: pointer;
  transition: transform 180ms ease;
}

.place-close:hover {
  transform: scale(1.045);
}

.place-close:focus-visible {
  outline: 2px solid var(--foreground, #24312c);
  outline-offset: 2px;
}

.map-control {
  align-self: flex-start;
}
</style>
