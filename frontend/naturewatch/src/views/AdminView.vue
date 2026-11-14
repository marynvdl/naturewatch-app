<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArrowRight, ChevronLeft, ChevronRight } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import PlacePhotosEditor from '@/components/PlacePhotosEditor.vue';
import useAuthStore from '@/store/AuthStore';
import { placeTypeLabel } from '@/places/display';
import {
  PHOTO_QUEUE_PAGE,
  loadPhotoQueue,
  type QueuedPlace,
} from '@/places/images';

/**
 * Lists that span many places. For now the photo queue: the places with
 * suggested photographs, and the Photos editor of the one chosen.
 */
const auth = useAuthStore();

const status = ref<'loading' | 'ok' | 'error'>('loading');
const places = ref<QueuedPlace[]>([]);
const total = ref(0);
const offset = ref(0);
/** The place being reviewed. Kept after its last suggestion is reviewed. */
const chosen = ref<QueuedPlace | null>(null);
/** Where the chosen place was in the list, so Next place still works once it leaves. */
const chosenIndex = ref(0);

const pageEnd = computed(() =>
  Math.min(offset.value + places.value.length, total.value)
);
const hasPrevious = computed(() => offset.value > 0);
const hasNext = computed(() => offset.value + PHOTO_QUEUE_PAGE < total.value);

/** The place after the chosen one, on this page, or null at its end. */
const nextPlace = computed<QueuedPlace | null>(() => {
  const at = chosen.value
    ? places.value.findIndex(p => p.placeId === chosen.value?.placeId)
    : -1;
  const index = at >= 0 ? at + 1 : chosenIndex.value;
  return places.value[index] ?? null;
});

/** Read the current page. Choose its first place when none is chosen. */
async function load() {
  const result = await loadPhotoQueue(PHOTO_QUEUE_PAGE, offset.value);
  if (result.status !== 'ok') {
    status.value = 'error';
    return;
  }
  places.value = result.places;
  total.value = result.total;
  status.value = 'ok';
  if (!chosen.value && result.places.length) choose(result.places[0], 0);
}

function choose(place: QueuedPlace, index: number) {
  chosen.value = place;
  chosenIndex.value = index;
}

async function goToNext() {
  if (nextPlace.value) {
    choose(nextPlace.value, places.value.indexOf(nextPlace.value));
    return;
  }
  if (!hasNext.value) return;
  offset.value += PHOTO_QUEUE_PAGE;
  chosen.value = null;
  await load();
}

async function page(step: number) {
  offset.value = Math.max(0, offset.value + step * PHOTO_QUEUE_PAGE);
  chosen.value = null;
  status.value = 'loading';
  await load();
}

watch(
  () => auth.isAdmin,
  isAdmin => {
    if (isAdmin) load();
  },
  { immediate: true }
);
</script>

<template>
  <main class="admin-page nw">
    <section
      v-if="!auth.isAdmin"
      class="admin-card map-panel"
      aria-labelledby="admin-title"
    >
      <h1 id="admin-title" class="panel-heading">Admin</h1>
      <p class="admin-text">This page is for admins.</p>
      <Button v-if="!auth.signedIn" as-child class="nw:w-fit">
        <router-link to="/signin">Sign in</router-link>
      </Button>
    </section>

    <template v-else>
      <aside class="admin-queue map-panel" aria-labelledby="queue-title">
        <h1 id="queue-title" class="panel-heading">Photo queue</h1>
        <p v-if="status === 'loading'" class="admin-text">Loading…</p>
        <p v-else-if="status === 'error'" class="admin-text" role="alert">
          The queue could not be loaded.
        </p>
        <p v-else-if="!total" class="admin-text">
          No place has suggested photographs.
        </p>
        <template v-else>
          <p class="map-section">
            {{ offset + 1 }}–{{ pageEnd }} of {{ total }} places
          </p>
          <ul class="queue-list">
            <li v-for="(place, index) in places" :key="place.placeId">
              <button
                type="button"
                class="queue-item"
                :class="{ 'is-on': chosen?.placeId === place.placeId }"
                :aria-current="
                  chosen?.placeId === place.placeId ? 'true' : undefined
                "
                @click="choose(place, index)"
              >
                <span class="queue-name">{{ place.name }}</span>
                <span class="queue-meta">
                  {{ placeTypeLabel(place.placeType) }} ·
                  {{ place.suggested }} suggested
                </span>
              </button>
            </li>
          </ul>
          <div v-if="hasPrevious || hasNext" class="queue-pages">
            <button
              type="button"
              class="map-control"
              :disabled="!hasPrevious"
              @click="page(-1)"
            >
              <ChevronLeft :size="16" aria-hidden="true" />
              Previous
            </button>
            <button
              type="button"
              class="map-control"
              :disabled="!hasNext"
              @click="page(1)"
            >
              Next
              <ChevronRight :size="16" aria-hidden="true" />
            </button>
          </div>
        </template>
      </aside>

      <section
        v-if="chosen"
        class="admin-place map-panel"
        aria-labelledby="place-title"
      >
        <header class="place-header">
          <div>
            <p class="map-section">{{ placeTypeLabel(chosen.placeType) }}</p>
            <h2 id="place-title" class="panel-heading">
              <router-link
                :to="{ name: 'Place', params: { id: chosen.placeId } }"
                class="place-link"
              >
                {{ chosen.name }}
              </router-link>
            </h2>
          </div>
          <button
            type="button"
            class="map-control"
            :disabled="!nextPlace && !hasNext"
            @click="goToNext"
          >
            Next place
            <ArrowRight :size="16" aria-hidden="true" />
          </button>
        </header>
        <PlacePhotosEditor :place-id="chosen.placeId" @changed="load" />
      </section>
    </template>
  </main>
</template>

<style scoped>
.admin-page {
  display: grid;
  height: 100%;
  box-sizing: border-box;
  padding: 16px;
  overflow: auto;
  gap: 16px;
  grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
  align-items: start;
  background: #f8f9f9;
}

.admin-card {
  display: flex;
  width: min(360px, 100%);
  flex-direction: column;
  gap: 16px;
  grid-column: 1 / -1;
  justify-self: center;
  align-self: center;
}

.admin-queue,
.admin-place {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 14px;
}

.admin-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}

.map-section {
  margin: 0;
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.queue-item {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: var(--map-control-radius);
  background: none;
  color: var(--map-control-text);
  text-align: left;
}

.queue-item:hover {
  background: #f1f3f2;
}

.queue-item.is-on {
  border-color: var(--border);
  background: var(--on);
  color: var(--on-foreground);
}

.queue-name {
  font-size: 14px;
  font-weight: 500;
}

.queue-meta {
  font-size: 12px;
  opacity: 0.75;
}

.map-control:disabled {
  opacity: 0.45;
  cursor: default;
}

.queue-pages {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.place-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.place-header .panel-heading {
  margin-top: 4px;
}

.place-link {
  color: inherit;
  text-decoration: none;
}

.place-link:hover {
  text-decoration: underline;
}

@media (max-width: 720px) {
  .admin-page {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
