<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import PlaceCard from '@/components/PlaceCard.vue';
import {
  PHOTO_QUEUE_PAGE,
  loadPhotoQueue,
  type QueuedPlace,
} from '@/places/images';
import { mainPhotoOf, requestMainPhotos } from '@/places/mainPhotos';
import usePlacesStore from '@/store/PlacesStore';
import useAuthStore from '@/store/AuthStore';

/**
 * The places with suggested photographs, for an admin in the Places panel.
 * Choosing one opens it in Edit mode on its Photos tab.
 */
const placesStore = usePlacesStore();
const auth = useAuthStore();

const status = ref<'loading' | 'ok' | 'error'>('loading');
const places = ref<QueuedPlace[]>([]);
const total = ref(0);
const loadingMore = ref(false);
let request = 0;

const hasMore = computed(() => places.value.length < total.value);
const countText = computed(() => {
  const noun = total.value === 1 ? 'place' : 'places';
  return places.value.length === total.value
    ? `${total.value} ${noun}`
    : `${places.value.length} of ${total.value} ${noun}`;
});

watch(
  places,
  list => {
    placesStore.photoQueueIds = list.map(place => place.placeId);
    requestMainPhotos(placesStore.photoQueueIds);
  },
  { deep: false }
);

/** Read the queue from the start, keeping as many places as are shown. */
async function reload() {
  const current = ++request;
  const limit = Math.max(PHOTO_QUEUE_PAGE, places.value.length);
  const result = await loadPhotoQueue(Math.min(limit, 200), 0);
  if (current !== request) return;
  if (result.status !== 'ok') {
    status.value = 'error';
    return;
  }
  places.value = result.places;
  total.value = result.total;
  status.value = 'ok';
}

/** Add the next page of places. */
async function showMore() {
  if (loadingMore.value) return;
  const current = request;
  loadingMore.value = true;
  const result = await loadPhotoQueue(PHOTO_QUEUE_PAGE, places.value.length);
  loadingMore.value = false;
  if (current !== request || result.status !== 'ok') return;
  const have = new Set(places.value.map(place => place.placeId));
  places.value = [
    ...places.value,
    ...result.places.filter(place => !have.has(place.placeId)),
  ];
  total.value = result.total || total.value;
}

/**
 * Open a place on its Photos tab, in Edit mode.
 * @param place - The chosen place.
 */
function choose(place: QueuedPlace) {
  auth.setEditMode(true);
  placesStore.openFromPhotoQueue(place.placeId);
}

/** A card's note, such as `12 suggested`. */
function note(place: QueuedPlace): string {
  return `${place.suggested} suggested`;
}

onMounted(reload);
watch(() => placesStore.photoQueueVersion, reload);
</script>

<template>
  <div class="queue">
    <p v-if="status === 'loading'" class="queue-status">
      Loading the photo queue.
    </p>
    <p v-else-if="status === 'error'" class="queue-status" role="alert">
      The photo queue could not be loaded.
    </p>
    <p v-else-if="total === 0" class="queue-status">
      No place has suggested photographs.
    </p>
    <template v-else>
      <p class="queue-count">{{ countText }} with suggested photographs</p>
      <ul class="queue-list" aria-label="Photo queue">
        <li
          v-for="place in places"
          :key="place.placeId"
          :data-place-id="place.placeId"
        >
          <PlaceCard
            :name="place.name"
            :iso3="place.iso3"
            :area-km2="place.areaKm2"
            :place-type-id="place.placeType"
            :current="placesStore.selectedId === place.placeId"
            :photo="mainPhotoOf(place.placeId)"
            :note="note(place)"
            @click="choose(place)"
            @highlight="on => placesStore.hoverPlace(place.placeId, on)"
          />
        </li>
      </ul>
      <button
        v-if="hasMore"
        type="button"
        class="map-control queue-more"
        :disabled="loadingMore"
        @click="showMore"
      >
        Show more
      </button>
    </template>
  </div>
</template>

<style scoped>
/* Reaches into the left padding, as the Places list does. */
.queue {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 12px;
  width: 0;
  min-width: calc(100% + var(--map-panel-padding));
  min-height: 0;
  margin-left: calc(-1 * var(--map-panel-padding));
  padding-left: var(--map-panel-padding);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.queue-status,
.queue-count {
  margin: 0;
  font-size: 12px;
  color: var(--muted-foreground);
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 2px 0 0;
  list-style: none;
}

.queue-list li {
  margin: 0;
  padding: 0;
}

.queue-more {
  align-self: flex-start;
  margin-bottom: 8px;
}

@media (max-width: 720px) {
  .queue {
    overflow-y: visible;
  }
}
</style>
