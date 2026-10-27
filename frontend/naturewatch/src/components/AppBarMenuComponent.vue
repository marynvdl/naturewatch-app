<script setup lang="ts">
import { SunMoon } from '@lucide/vue';
import { useConfig } from '@/store';

/** Config Store */
const configStore = useConfig();
</script>

<template>
  <button
    type="button"
    class="theme-toggle"
    aria-label="Toggle colour theme"
    @click="configStore.toggleTheme"
  >
    <SunMoon :size="18" />
  </button>
</template>

<style scoped>
.theme-toggle {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #f8f9f9;
  color: #24312c;
  cursor: pointer;
}
</style>
