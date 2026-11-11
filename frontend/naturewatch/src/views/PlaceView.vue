<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { loadPilotPlace, type PlaceDetail } from '@/places/api';
import {
  formatKm2,
  formatPercent,
  formatReleaseMonth,
  protectedPlanetUrl,
} from '@/places/display';

const route = useRoute();
const router = useRouter();
const status = ref<'loading' | 'ok' | 'missing' | 'unconfigured' | 'error'>(
  'loading'
);
const place = ref<PlaceDetail | null>(null);

/** Load the place named in the route. */
async function load() {
  status.value = 'loading';
  place.value = null;
  const id = String(route.params.id);
  const result = await loadPilotPlace(id);
  status.value = result.status;
  if (result.status !== 'ok') return;
  place.value = result.place;
  // A merged place opens the place it was merged into, under that place's address.
  if (result.place.id !== id) {
    router.replace({ name: 'Place', params: { id: result.place.id } });
  }
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
      <p>{{ place.citation }}</p>
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
  height: 100%;
  max-width: 720px;
  padding: 24px;
  overflow: auto;
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
