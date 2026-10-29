<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Image, LocateFixed, X } from '@lucide/vue';
import { loadPilotPlace, type PlaceDetail } from '@/places/api';
import {
  CROPLAND_NOT_CALCULATED,
  PROTECTED_AREA_ATTRIBUTION,
  SPECIES_NOTHING_YET,
  countryName,
  formatAreaTag,
  formatKm2,
  formatPercent,
  formatReleaseMonth,
} from '@/places/display';

const props = defineProps<{
  placeId: string;
  /** Shown while the stored record loads. */
  name?: string;
}>();

defineEmits<{
  close: [];
  zoom: [];
}>();

type TabId = 'overview' | 'landscape' | 'species';

const tabs: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'landscape', label: 'Landscape' },
  { id: 'species', label: 'Species' },
];

const status = ref<'loading' | 'ok' | 'missing' | 'unconfigured' | 'error'>(
  'loading'
);
const place = ref<PlaceDetail | null>(null);
const activeTab = ref<TabId>('overview');
const tabButtons = ref<HTMLButtonElement[]>([]);

const title = computed(() => place.value?.name ?? props.name ?? '');
const country = computed(() => countryName(place.value?.iso3 ?? null));
const subtitle = computed(() =>
  [country.value, place.value?.designation].filter(Boolean).join(' · ')
);
const hasCropland = computed(
  () => place.value?.croplandKm2 != null && place.value?.percent != null
);
const source = computed(() => {
  if (!place.value) return '';
  const release = place.value.releaseMonth
    ? `, ${formatReleaseMonth(place.value.releaseMonth)}`
    : '';
  return `${place.value.sourceName}${release}. ${PROTECTED_AREA_ATTRIBUTION}`;
});

/** Load the stored record for the selected place. */
async function load(id: string) {
  status.value = 'loading';
  place.value = null;
  activeTab.value = 'overview';
  const result = await loadPilotPlace(id);
  if (id !== props.placeId) return;
  status.value = result.status;
  if (result.status === 'ok') place.value = result.place;
}

watch(() => props.placeId, load, { immediate: true });

/** Move between tabs with the arrow keys. */
function onTabKey(event: KeyboardEvent, index: number) {
  const step =
    event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!step) return;
  event.preventDefault();
  const next = (index + step + tabs.length) % tabs.length;
  activeTab.value = tabs[next].id;
  tabButtons.value[next]?.focus();
}
</script>

<template>
  <section class="place-profile" aria-label="Place">
    <div class="place-hero" aria-hidden="true">
      <Image class="place-hero-icon" :stroke-width="1.25" />
    </div>
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
              <div v-if="country">
                <dt>Country</dt>
                <dd>{{ country }}</dd>
              </div>
              <div v-if="place.areaKm2 != null">
                <dt>Area</dt>
                <dd>{{ formatKm2(place.areaKm2) }} km²</dd>
              </div>
            </dl>
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

.place-hero {
  display: grid;
  flex: none;
  height: 200px;
  place-items: center;
  background: linear-gradient(150deg, #eef0ee, #dfe3df);
  color: #a3aba6;
}

.place-hero-icon {
  width: 40px;
  height: 40px;
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

.place-meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-top: -6px;
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
  border-radius: var(--map-control-radius);
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
  .place-hero {
    height: 120px;
  }

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
