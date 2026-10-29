<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { loadPilotPlaces, type PlaceSummary } from '@/places/api';
import { Input } from '@/components/ui/input';

const status = ref<'loading' | 'ok' | 'unconfigured' | 'error'>('loading');
const places = ref<PlaceSummary[]>([]);
const total = ref(0);
const query = ref('');

let request = 0;

/** Load the next name window. A newer keystroke supersedes an older request. */
async function loadPlaces() {
  const mine = ++request;
  const result = await loadPilotPlaces(query.value);
  if (mine !== request) return;
  status.value = result.status;
  if (result.status === 'ok') {
    places.value = result.places;
    total.value = result.total;
  }
}

onMounted(loadPlaces);
watch(query, loadPlaces);
</script>

<template>
  <div class="places">
    <h1>Places</h1>
    <p class="intro">
      Terrestrial protected areas of at least 10 km².
      <router-link :to="{ name: 'Home' }">Back to the map</router-link>
    </p>

    <p v-if="status === 'loading'">Loading places.</p>
    <p v-else-if="status === 'unconfigured'">
      The place store is not configured.
    </p>
    <p v-else-if="status === 'error'">The places could not be loaded.</p>
    <template v-else>
      <div class="find">
        <span id="places-find">Find a place</span>
        <Input v-model="query" aria-labelledby="places-find" />
      </div>
      <p v-if="places.length === 0">No places match.</p>
      <template v-else>
        <p class="count">
          {{ places.length.toLocaleString('en-GB') }} of
          {{ total.toLocaleString('en-GB') }} places
        </p>
        <ul class="place-list">
          <li v-for="place in places" :key="place.id">
            <router-link :to="{ name: 'Place', params: { id: place.id } }">
              {{ place.name }}
            </router-link>
          </li>
        </ul>
      </template>
    </template>
  </div>
</template>

<style scoped>
.places {
  height: 100%;
  max-width: 720px;
  padding: 24px;
  overflow: auto;
  color: var(--foreground);
  font-family: var(--font-sans);
}

h1 {
  margin: 0 0 8px;
  font-size: 1.5rem;
  font-weight: 500;
}

.intro {
  margin-bottom: 16px;
}

.find {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
  font-size: 14px;
}

.count {
  margin: 0 0 8px;
  font-size: 14px;
}

.place-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.place-list li {
  border-top: 1px solid var(--border);
}

.place-list a {
  display: block;
  padding: 8px 0;
  color: inherit;
  text-decoration: none;
}

.place-list a:hover {
  text-decoration: underline;
}
</style>
