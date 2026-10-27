<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { loadPilotPlace, type PlaceDetail } from '@/places/api';
import {
  formatKm2,
  formatPercent,
  formatReleaseMonth,
  PROTECTED_AREA_ATTRIBUTION,
  protectedPlanetUrl,
} from '@/places/display';

const route = useRoute();
const status = ref<'loading' | 'ok' | 'missing' | 'unconfigured' | 'error'>(
  'loading'
);
const place = ref<PlaceDetail | null>(null);

/** Load the place named in the route. */
async function load() {
  status.value = 'loading';
  place.value = null;
  const result = await loadPilotPlace(String(route.params.id));
  status.value = result.status;
  if (result.status === 'ok') place.value = result.place;
}

onMounted(load);
watch(() => route.params.id, load);
</script>

<template>
  <div class="place">
    <p class="back">
      <router-link :to="{ name: 'Places' }">Places</router-link>
    </p>

    <p v-if="status === 'loading'">Loading place.</p>
    <p v-else-if="status === 'unconfigured'">
      The place store is not configured.
    </p>
    <p v-else-if="status === 'missing'">This place is not in the pilot set.</p>
    <p v-else-if="status === 'error'">The place could not be loaded.</p>

    <template v-else-if="place">
      <h1>{{ place.name }}</h1>
      <p v-if="place.croplandKm2 !== null && place.percent !== null">
        Cropland: {{ formatKm2(place.croplandKm2) }} km² ({{
          formatPercent(place.percent)
        }}%)
      </p>
      <p v-else>No cropland figure is stored for this place.</p>
      <p>Release month: {{ formatReleaseMonth(place.releaseMonth) }}</p>
      <p>{{ place.sourceName }}. {{ PROTECTED_AREA_ATTRIBUTION }}</p>
      <p v-if="place.siteId">
        <a
          :href="protectedPlanetUrl(place.siteId)"
          target="_blank"
          rel="noopener noreferrer"
        >
          Protected Planet
        </a>
      </p>
    </template>
  </div>
</template>

<style scoped>
.place {
  max-width: 720px;
  padding: 24px;
  color: var(--foreground);
  font-family: var(--font-sans);
}

.back {
  margin-bottom: 16px;
}

h1 {
  margin: 0 0 16px;
  font-size: 1.5rem;
  font-weight: 500;
}
</style>
