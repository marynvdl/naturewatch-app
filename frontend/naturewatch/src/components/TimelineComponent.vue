<script setup lang="ts">
import { ref, watch } from 'vue';
import useTimelineStore from '@/store/TimelineStore';

// Using stores
const timelineStore = useTimelineStore();

// Timeline year and function to update year from store
const activeYear = timelineStore.activeYear;
const setActiveYear = timelineStore.setActiveYear;

const selectedYear = ref(activeYear);

// Watcher
watch(selectedYear, (newYear, oldYear) => {
  setActiveYear(newYear);
});
</script>

<template>
  <v-slider
    v-model="selectedYear"
    color="white"
    show-ticks="always"
    tick-size="6"
    :min="2016"
    :max="2023"
    :step="1"
    thumb-label="always"
  />
</template>

<style scoped></style>
