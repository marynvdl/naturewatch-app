<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import useTimelineStore from '@/store/TimelineStore';

// Using stores
const timelineStore = useTimelineStore();

// Timeline year and function to update year from store
const activeYear = timelineStore.activeYear;
const setActiveYear = timelineStore.setActiveYear;
const lastActiveYear = computed(() => timelineStore.lastActiveYear);

const selectedYear = ref(activeYear);
const jumpYearIcon = ref('mdi-timer-sand-complete');

const toggleIcon = () => {
  selectedYear.value = lastActiveYear.value;
  jumpYearIcon.value =
    jumpYearIcon.value === 'mdi-timer-sand-complete'
      ? 'mdi-timer-sand'
      : 'mdi-timer-sand-complete';
};

// Watcher
watch(selectedYear, (newYear, oldYear) => {
  setActiveYear(newYear);
});
</script>

<template>
  <v-row class="timelineRow" no-gutters d-flex>
    <v-col class="d-flex" cols="auto">
      <div class="timeline-container">
        <v-slider
          v-model="selectedYear"
          class="timeline"
          show-ticks="always"
          tick-size="6"
          :min="2016"
          :max="2023"
          :step="1"
          thumb-label="always"
        />
      </div>
    </v-col>
    <v-col class="d-flex" cols="auto">
      <v-btn
        class="mx-3"
        size="x-small"
        color="surface-variant"
        :icon="jumpYearIcon"
        @click="toggleIcon"
      />
    </v-col>
  </v-row>
</template>

<style scoped>
.timelineRow {
  position: absolute;
  top: 50px;
  z-index: 10;
  transition: left 0.2s ease-in-out;
  flex-wrap: nowrap; /* This prevents line wrapping */
}

.timeline-container {
  width: 260px;
}
</style>
