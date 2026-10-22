<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { loadPilotPlaces, type PlaceSummary } from '@/places/api';
import { placesMatching } from '@/places/display';

const status = ref<'loading' | 'ok' | 'unconfigured' | 'error'>('loading');
const places = ref<PlaceSummary[]>([]);
const query = ref('');

const shown = computed(() => placesMatching(places.value, query.value));

onMounted(async () => {
  const result = await loadPilotPlaces();
  status.value = result.status;
  if (result.status === 'ok') places.value = result.places;
});
</script>

<template>
  <v-container class="places pa-6">
    <h1 class="text-h5 mb-2">Places</h1>
    <p class="mb-4">
      Terrestrial protected areas in South Africa of at least 10 km².
      <router-link :to="{ name: 'Home' }">Back to the map</router-link>
    </p>

    <p v-if="status === 'loading'">Loading places.</p>
    <p v-else-if="status === 'unconfigured'">
      The place store is not configured.
    </p>
    <p v-else-if="status === 'error'">The places could not be loaded.</p>
    <template v-else>
      <v-text-field
        v-model="query"
        label="Find a place"
        hide-details
        density="comfortable"
        class="mb-4"
      />
      <p v-if="shown.length === 0">No places match.</p>
      <v-list v-else density="compact">
        <v-list-item
          v-for="place in shown"
          :key="place.id"
          :to="{ name: 'Place', params: { id: place.id } }"
          :title="place.name"
        />
      </v-list>
    </template>
  </v-container>
</template>
