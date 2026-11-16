<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import PlaceCard from '@/components/PlaceCard.vue';
import {
  ADMIN_LIST_PAGE,
  loadAdminPlaceList,
  type AdminListedPlace,
  type AdminPlaceListKind,
} from '@/places/status';
import { mainPhotoOf, requestMainPhotos } from '@/places/mainPhotos';
import usePlacesStore from '@/store/PlacesStore';
import useAuthStore from '@/store/AuthStore';

/**
 * The places that need attention, or the withdrawn places, for an admin in the
 * Places panel. Choosing one opens it in Edit mode on its Status tab.
 */
const props = defineProps<{ kind: AdminPlaceListKind }>();

const placesStore = usePlacesStore();
const auth = useAuthStore();

const status = ref<'loading' | 'ok' | 'error'>('loading');
const places = ref<AdminListedPlace[]>([]);
const total = ref(0);
const loadingMore = ref(false);
let request = 0;

const label = computed(() =>
  props.kind === 'attention' ? 'Needs attention' : 'Withdrawn places'
);
const hasMore = computed(() => places.value.length < total.value);
const countText = computed(() => {
  const noun = total.value === 1 ? 'place' : 'places';
  const count =
    places.value.length === total.value
      ? `${total.value} ${noun}`
      : `${places.value.length} of ${total.value} ${noun}`;
  if (props.kind === 'withdrawn') return `${count} withdrawn`;
  return `${count} ${total.value === 1 ? 'needs' : 'need'} attention`;
});

watch(places, list => requestMainPhotos(list.map(place => place.placeId)));

/** Read the list from the start, keeping as many places as are shown. */
async function reload() {
  const current = ++request;
  const limit = Math.max(ADMIN_LIST_PAGE, places.value.length);
  const result = await loadAdminPlaceList(props.kind, Math.min(limit, 200), 0);
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
  const result = await loadAdminPlaceList(
    props.kind,
    ADMIN_LIST_PAGE,
    places.value.length
  );
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
 * Open a place on its Status tab, in Edit mode.
 * @param place - The chosen place.
 */
function choose(place: AdminListedPlace) {
  auth.setEditMode(true);
  placesStore.openFromAdminList(place.placeId);
}

onMounted(reload);
watch(
  () => [props.kind, placesStore.adminListVersion] as const,
  ([kind], before) => {
    if (before && kind !== before[0]) {
      places.value = [];
      status.value = 'loading';
    }
    void reload();
  }
);
</script>

<template>
  <div class="queue">
    <p v-if="status === 'loading'" class="queue-status">
      Loading {{ label.toLowerCase() }}.
    </p>
    <p v-else-if="status === 'error'" class="queue-status" role="alert">
      {{ label }} could not be loaded.
    </p>
    <p v-else-if="total === 0" class="queue-status">
      {{
        kind === 'attention'
          ? 'No place is flagged as needing attention.'
          : 'No place is withdrawn.'
      }}
    </p>
    <template v-else>
      <p class="queue-count">{{ countText }}</p>
      <ul class="queue-list" :aria-label="label">
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
            :note="place.reason"
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
