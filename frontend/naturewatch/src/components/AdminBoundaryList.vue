<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import PlaceCard from '@/components/PlaceCard.vue';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/ui/segmented-control';
import {
  BOUNDARY_LIST_PAGE,
  listNote,
  loadBoundaryList,
  type BoundaryListView,
  type ListedBoundary,
} from '@/places/boundaryReview';
import { mainPhotoOf, requestMainPhotos } from '@/places/mainPhotos';
import usePlacesStore from '@/store/PlacesStore';
import useAuthStore from '@/store/AuthStore';

/**
 * The polygon review queue, for an admin in the Places panel: the current
 * boundaries still pending for Stats, or excluded. Choosing one opens its
 * place on the Status tab, where the Boundary section holds the decision.
 */
const VIEWS: { id: BoundaryListView; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'excluded', label: 'Excluded' },
];

const placesStore = usePlacesStore();
const auth = useAuthStore();

const view = ref<BoundaryListView>('pending');
const status = ref<'loading' | 'ok' | 'error'>('loading');
const boundaries = ref<ListedBoundary[]>([]);
const total = ref(0);
const loadingMore = ref(false);
let request = 0;

const hasMore = computed(() => boundaries.value.length < total.value);
const countText = computed(() => {
  const noun = total.value === 1 ? 'boundary' : 'boundaries';
  const shown =
    boundaries.value.length === total.value
      ? `${total.value}`
      : `${boundaries.value.length} of ${total.value}`;
  return `${shown} ${view.value} ${noun}`;
});

watch(boundaries, list =>
  requestMainPhotos(list.map(boundary => boundary.placeId))
);

/** Read the list from the start, keeping as many boundaries as are shown. */
async function reload() {
  const current = ++request;
  const limit = Math.max(BOUNDARY_LIST_PAGE, boundaries.value.length);
  const result = await loadBoundaryList(view.value, Math.min(limit, 200), 0);
  if (current !== request) return;
  if (result.status !== 'ok') {
    status.value = 'error';
    return;
  }
  boundaries.value = result.boundaries;
  total.value = result.total;
  status.value = 'ok';
}

/** Add the next page. */
async function showMore() {
  if (loadingMore.value) return;
  const current = request;
  loadingMore.value = true;
  const result = await loadBoundaryList(
    view.value,
    BOUNDARY_LIST_PAGE,
    boundaries.value.length
  );
  loadingMore.value = false;
  if (current !== request || result.status !== 'ok') return;
  const have = new Set(boundaries.value.map(b => b.boundaryId));
  boundaries.value = [
    ...boundaries.value,
    ...result.boundaries.filter(b => !have.has(b.boundaryId)),
  ];
  total.value = result.total || total.value;
}

/**
 * Switch between Pending and Excluded.
 * @param next - The view chosen.
 */
function setView(next: unknown) {
  if (next !== 'pending' && next !== 'excluded') return;
  if (next === view.value) return;
  view.value = next;
  boundaries.value = [];
  status.value = 'loading';
  void reload();
}

/**
 * Open the boundary's place on its Status tab, in Edit mode.
 * @param boundary - The chosen boundary.
 */
function choose(boundary: ListedBoundary) {
  auth.setEditMode(true);
  placesStore.openFromAdminList(boundary.placeId);
}

onMounted(reload);
watch(
  () => placesStore.adminListVersion,
  () => void reload()
);
</script>

<template>
  <div class="queue">
    <SegmentedControl
      :model-value="view"
      type="single"
      variant="outline"
      size="sm"
      aria-label="Stats eligibility"
      @update:model-value="setView"
    >
      <SegmentedControlItem
        v-for="item in VIEWS"
        :key="item.id"
        :value="item.id"
      >
        {{ item.label }}
      </SegmentedControlItem>
    </SegmentedControl>

    <p v-if="status === 'loading'" class="queue-status">Loading boundaries.</p>
    <p v-else-if="status === 'error'" class="queue-status" role="alert">
      The boundaries could not be loaded.
    </p>
    <p v-else-if="total === 0" class="queue-status">
      No boundary is {{ view }}.
    </p>
    <template v-else>
      <p class="queue-count">{{ countText }}</p>
      <ul class="queue-list" aria-label="Boundaries">
        <li
          v-for="boundary in boundaries"
          :key="boundary.boundaryId"
          :data-place-id="boundary.placeId"
        >
          <PlaceCard
            :name="boundary.name"
            :iso3="boundary.iso3"
            :area-km2="boundary.areaKm2"
            :place-type-id="boundary.placeType"
            :current="placesStore.selectedId === boundary.placeId"
            :photo="mainPhotoOf(boundary.placeId)"
            :note="listNote(boundary, view)"
            @click="choose(boundary)"
            @highlight="on => placesStore.hoverPlace(boundary.placeId, on)"
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
