<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ChevronRight, LocateFixed, X } from '@lucide/vue';
import PlaceCard from '@/components/PlaceCard.vue';
import PlacePhotos from '@/components/PlacePhotos.vue';
import {
  PLACE_TYPE,
  loadPilotPlace,
  loadPlaceRecognitions,
  loadRecognisedPlaces,
  type PlaceDetail,
  type PlaceRecognition,
  type PlaceSummary,
} from '@/places/api';
import {
  CROPLAND_NOT_CALCULATED,
  RECOGNITION_LABEL,
  recognitionColour,
  SPECIES_NOTHING_YET,
  countryName,
  countryNames,
  formatAreaTag,
  formatKm2,
  formatPercent,
} from '@/places/display';
import type { PlacePhoto } from '@/places/photos';

const props = withDefaults(
  defineProps<{
    placeId: string;
    /** Shown while the stored record loads. */
    name?: string;
    /** Approved photographs. None are stored yet. */
    photos?: PlacePhoto[];
  }>(),
  { name: undefined, photos: () => [] }
);

const emit = defineEmits<{
  close: [];
  zoom: [];
  /** The place was merged into another. Its id is the one shown. */
  moved: [id: string];
  /** A recognition badge or a recognised place was chosen. Open it. */
  open: [id: string];
}>();

type TabId = 'overview' | 'areas' | 'landscape' | 'species';

const status = ref<'loading' | 'ok' | 'missing' | 'unconfigured' | 'error'>(
  'loading'
);
const place = ref<PlaceDetail | null>(null);
/** Confirmed recognitions of the place. A recognition has none. */
const recognitions = ref<PlaceRecognition[]>([]);
/** Conservation areas a recognition recognises, largest first. */
const recognised = ref<PlaceSummary[]>([]);
/** Whether the conservation areas of a recognition have been read. */
const recognisedStatus = ref<'loading' | 'ok' | 'error'>('loading');
/** Cards shown at once on a recognition's Conservation areas tab. */
const RECOGNISED_STEP = 20;
const recognisedShown = ref(RECOGNISED_STEP);
const activeTab = ref<TabId>('overview');
const tabButtons = ref<HTMLButtonElement[]>([]);

const title = computed(() => place.value?.name ?? props.name ?? '');
const country = computed(() => countryName(place.value?.iso3 ?? null));
const countries = computed(() => countryNames(place.value?.iso3 ?? null));
const subtitle = computed(() =>
  [country.value, place.value?.designation].filter(Boolean).join(' · ')
);
const isRecognition = computed(
  () => !!place.value && place.value.placeTypeId !== PLACE_TYPE
);
/** A recognition has a tab for the conservation areas it recognises. */
const tabs = computed<{ id: TabId; label: string }[]>(() => [
  { id: 'overview', label: 'Overview' },
  ...(isRecognition.value ? [{ id: 'areas' as const, label: 'Areas' }] : []),
  { id: 'landscape', label: 'Landscape' },
  { id: 'species', label: 'Species' },
]);
const hasCropland = computed(
  () => place.value?.croplandKm2 != null && place.value?.percent != null
);
const source = computed(() => place.value?.citation ?? '');

/** Load the stored record for the selected place. */
async function load(id: string) {
  status.value = 'loading';
  place.value = null;
  recognitions.value = [];
  recognised.value = [];
  recognisedStatus.value = 'loading';
  recognisedShown.value = RECOGNISED_STEP;
  activeTab.value = 'overview';
  const result = await loadPilotPlace(id);
  if (id !== props.placeId) return;
  status.value = result.status;
  if (result.status !== 'ok') return;
  place.value = result.place;
  if (result.place.id !== id) {
    emit('moved', result.place.id);
    return;
  }
  if (result.place.placeTypeId === PLACE_TYPE) {
    const read = await loadPlaceRecognitions(id);
    if (id !== props.placeId || read.status !== 'ok') return;
    recognitions.value = read.recognitions;
    return;
  }
  const read = await loadRecognisedPlaces(id);
  if (id !== props.placeId) return;
  recognisedStatus.value = read.status === 'ok' ? 'ok' : 'error';
  if (read.status === 'ok') recognised.value = read.places;
}

watch(() => props.placeId, load, { immediate: true });

/** Move between tabs with the arrow keys. */
function onTabKey(event: KeyboardEvent, index: number) {
  const step =
    event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!step) return;
  event.preventDefault();
  const next = (index + step + tabs.value.length) % tabs.value.length;
  activeTab.value = tabs.value[next].id;
  tabButtons.value[next]?.focus();
}
</script>

<template>
  <section
    class="place-profile"
    :class="{ 'is-list-tab': activeTab === 'areas' }"
    aria-label="Place"
  >
    <PlacePhotos :photos="photos" :place-name="title" />
    <button
      type="button"
      class="place-close"
      aria-label="Close place"
      @click="$emit('close')"
    >
      <X :size="16" :stroke-width="2.25" aria-hidden="true" />
    </button>

    <div class="place-body">
      <h2 class="place-title panel-heading">{{ title }}</h2>
      <ul
        v-if="recognitions.length"
        class="place-recognitions"
        aria-label="Recognised as"
      >
        <li v-for="recognition in recognitions" :key="recognition.id">
          <button
            type="button"
            class="place-recognition"
            :title="recognition.name"
            :aria-label="`${RECOGNITION_LABEL[recognition.placeTypeId] ?? 'Recognition'}: ${recognition.name}`"
            @click="$emit('open', recognition.id)"
          >
            <span
              class="place-recognition-dot"
              :style="{
                backgroundColor: recognitionColour(recognition.placeTypeId),
              }"
              aria-hidden="true"
            />
            {{ RECOGNITION_LABEL[recognition.placeTypeId] ?? 'Recognition' }}
            <ChevronRight
              class="place-recognition-go"
              :size="12"
              :stroke-width="2.25"
              aria-hidden="true"
            />
          </button>
        </li>
      </ul>
      <div class="place-meta">
        <p class="place-subtitle">{{ subtitle }}</p>
        <p v-if="place?.areaKm2 != null" class="place-area">
          {{ formatAreaTag(place.areaKm2) }} km²
        </p>
      </div>

      <button
        type="button"
        class="place-zoom map-control"
        @click="$emit('zoom')"
      >
        <LocateFixed :size="16" aria-hidden="true" />
        Zoom to place
      </button>

      <p v-if="status === 'loading'" class="place-status">Loading place.</p>
      <p v-else-if="status === 'unconfigured'" class="place-status">
        The place store is not configured.
      </p>
      <p v-else-if="status === 'missing'" class="place-status">
        This place is not in the pilot set.
      </p>
      <p v-else-if="status === 'error'" class="place-status">
        The place could not be loaded.
      </p>

      <template v-else-if="place">
        <div class="place-tabs" role="tablist" aria-label="Place sections">
          <button
            v-for="(tab, index) in tabs"
            :id="`place-tab-${tab.id}`"
            :key="tab.id"
            ref="tabButtons"
            type="button"
            role="tab"
            class="place-tab"
            :aria-selected="activeTab === tab.id"
            :aria-controls="`place-panel-${tab.id}`"
            :tabindex="activeTab === tab.id ? 0 : -1"
            @click="activeTab = tab.id"
            @keydown="onTabKey($event, index)"
          >
            {{ tab.label }}
          </button>
        </div>

        <div
          :id="`place-panel-${activeTab}`"
          class="place-panel"
          role="tabpanel"
          :aria-labelledby="`place-tab-${activeTab}`"
        >
          <template v-if="activeTab === 'overview'">
            <dl class="place-facts">
              <div v-if="place.designation">
                <dt>Designation</dt>
                <dd>{{ place.designation }}</dd>
              </div>
              <div v-if="countries.length">
                <dt>{{ countries.length > 1 ? 'Countries' : 'Country' }}</dt>
                <dd>
                  <ul class="place-countries">
                    <li
                      v-for="countryLabel in countries"
                      :key="countryLabel"
                      class="place-country"
                    >
                      {{ countryLabel }}
                    </li>
                  </ul>
                </dd>
              </div>
              <div v-if="place.areaKm2 != null">
                <dt>Area</dt>
                <dd>{{ formatKm2(place.areaKm2) }} km²</dd>
              </div>
            </dl>
          </template>

          <template v-else-if="activeTab === 'areas'">
            <p v-if="recognisedStatus === 'loading'" class="place-note">
              Loading conservation areas.
            </p>
            <p v-else-if="recognisedStatus === 'error'" class="place-note">
              The conservation areas could not be loaded.
            </p>
            <p v-else-if="recognised.length === 0" class="place-note">
              No conservation area lies at least 75% inside this recognition.
            </p>
            <template v-else>
              <p class="place-recognised-count map-section">
                {{ recognised.length.toLocaleString('en-GB') }}
                {{
                  recognised.length === 1
                    ? 'conservation area'
                    : 'conservation areas'
                }}
                at least 75% inside
              </p>
              <ul class="place-recognised" aria-label="Conservation areas">
                <li
                  v-for="item in recognised.slice(0, recognisedShown)"
                  :key="item.id"
                >
                  <PlaceCard
                    :name="item.name"
                    :iso3="item.iso3"
                    :area-km2="item.area_km2"
                    @click="$emit('open', item.id)"
                  />
                </li>
                <li v-if="recognisedShown < recognised.length">
                  <button
                    type="button"
                    class="place-recognised-more map-control"
                    @click="recognisedShown += RECOGNISED_STEP"
                  >
                    Show
                    {{
                      Math.min(
                        RECOGNISED_STEP,
                        recognised.length - recognisedShown
                      )
                    }}
                    more
                  </button>
                </li>
              </ul>
            </template>
          </template>

          <template v-else-if="activeTab === 'landscape'">
            <p class="map-section">Cropland, 2024</p>
            <dl v-if="hasCropland" class="place-facts">
              <div>
                <dt>Cropland area</dt>
                <dd>{{ formatKm2(place.croplandKm2 as number) }} km²</dd>
              </div>
              <div>
                <dt>Share of the place</dt>
                <dd>{{ formatPercent(place.percent as number) }}%</dd>
              </div>
            </dl>
            <p v-else class="place-note">{{ CROPLAND_NOT_CALCULATED }}</p>
          </template>

          <p v-else class="place-note">{{ SPECIES_NOTHING_YET }}</p>
        </div>
      </template>
    </div>
    <p v-if="place" class="place-source">{{ source }}</p>
  </section>
</template>

<style scoped>
.place-profile {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  padding: 0;
  scrollbar-width: thin;
}

.place-close {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--background);
  color: var(--map-control-text, #24312c);
  cursor: pointer;
  transition: transform 180ms ease;
}

.place-close:hover {
  transform: scale(1.045);
}

.place-close:focus-visible,
.place-tab:focus-visible {
  outline: 2px solid var(--foreground, #24312c);
  outline-offset: 2px;
}

.place-body {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 16px;
  padding: var(--map-panel-padding);
}

.place-title {
  font-size: 28px;
  line-height: 1.1;
  overflow-wrap: anywhere;
}

.place-recognitions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: -8px 0 0;
  padding: 0;
  list-style: none;
}

.place-recognition {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  margin: 0;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--background);
  color: var(--foreground);
  font: inherit;
  font-size: 12px;
  line-height: 1.3;
  text-align: left;
  cursor: pointer;
}

.place-recognition:hover {
  background: var(--muted, #ece9e0);
}

.place-recognition:focus-visible {
  outline: 2px solid var(--foreground, #24312c);
  outline-offset: 2px;
}

.place-recognition-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.place-meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-top: -6px;
}

.place-countries {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.place-country {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--foreground);
  font-size: 12px;
  line-height: 1.4;
}

.place-recognised-count {
  margin: 0;
}

.place-recognised {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 2px;
  list-style: none;
}

.place-recognised-more {
  cursor: pointer;
}

.place-recognition-go {
  margin-left: -2px;
  color: var(--muted-foreground);
}

/*
 * On the Conservation areas tab only the list scrolls. The header, the tabs,
 * and the source line stay where they are. A narrow screen scrolls as one.
 */
@media (min-width: 721px) {
  .place-profile.is-list-tab {
    overflow: hidden;
  }

  .place-profile.is-list-tab .place-body,
  .place-profile.is-list-tab .place-panel {
    flex: 1 1 auto;
    min-height: 0;
  }

  .place-profile.is-list-tab .place-recognised {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
}

.place-subtitle {
  min-width: 0;
  margin: 0;
  padding-top: 5px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--muted-foreground);
}

.place-area {
  flex: none;
  margin: 0;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--on);
  color: var(--on-foreground);
  font-size: 14px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.place-zoom {
  align-self: flex-start;
}

.place-status,
.place-note {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted-foreground);
}

.place-tabs {
  display: flex;
  gap: 24px;
  border-bottom: 1px solid var(--border);
}

.place-tab {
  white-space: nowrap;
  margin: 0 0 -1px;
  padding: 0 0 10px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--muted-foreground);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.place-tab[aria-selected='true'] {
  border-bottom-color: var(--foreground);
  color: var(--foreground);
  font-weight: 500;
}

.place-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.place-panel .map-section {
  margin: 0;
}

.place-facts {
  margin: 0;
}

.place-facts div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-top: 1px solid var(--border);
  font-size: 13px;
}

.place-facts div:first-child {
  border-top: 0;
  padding-top: 0;
}

.place-facts dt {
  color: var(--muted-foreground);
}

.place-facts dd {
  margin: 0;
  text-align: right;
  color: var(--foreground);
  font-variant-numeric: tabular-nums;
}

.place-source {
  flex: none;
  margin: auto 0 0;
  padding: 12px var(--map-panel-padding) 16px;
  border-top: 1px solid var(--border);
  font-size: 10px;
  line-height: 1.5;
  color: var(--muted-foreground);
}

@media (max-width: 720px) {
  .place-body {
    gap: 12px;
    padding: 16px;
  }

  .place-source {
    padding: 10px 16px 12px;
  }

  .place-title {
    font-size: 24px;
  }
}
</style>
