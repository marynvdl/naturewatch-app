<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ChevronRight, LocateFixed, X } from '@lucide/vue';
import PlaceCard from '@/components/PlaceCard.vue';
import PlaceLinksEditor from '@/components/PlaceLinksEditor.vue';
import PlaceEditField, {
  type CuratedValue,
} from '@/components/PlaceEditField.vue';
import PlacePhotos from '@/components/PlacePhotos.vue';
import PlacePhotosEditor from '@/components/PlacePhotosEditor.vue';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/ui/segmented-control';
import useAuthStore from '@/store/AuthStore';
import {
  PLACE_TYPE,
  applyCuration,
  curatePlace,
  linkLabel,
  loadDesignations,
  loadPilotPlace,
  loadPlaceCuration,
  loadPlaceRecognitions,
  loadRelatedPlaces,
  type PlaceCuration,
  type PlaceDetail,
  type PlaceLink,
  type PlaceRecognition,
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
import { approvedPhotos, loadPlaceImages } from '@/places/images';
import {
  forgetMainPhoto,
  mainPhotoOf,
  requestMainPhotos,
} from '@/places/mainPhotos';
import type { PlacePhoto } from '@/places/photos';

const props = withDefaults(
  defineProps<{
    placeId: string;
    /** Shown while the stored record loads. */
    name?: string;
  }>(),
  { name: undefined }
);

const emit = defineEmits<{
  close: [];
  zoom: [];
  /** The place was merged into another. Its id is the one shown. */
  moved: [id: string];
  /** A recognition badge or a related place was chosen. Open it. */
  open: [id: string];
  /**
   * The conservation areas the open Related tab lists, or null when it is
   * closed or lists none.
   */
  areas: [ids: string[] | null];
  /** The pointer or focus entered or left a card on the Related tab. */
  highlight: [id: string, on: boolean];
}>();

/** Admins switch between viewing and editing. Visitors see no toggle. */
const auth = useAuthStore();
const profileMode = computed({
  get: () => (auth.editMode ? 'edit' : 'view'),
  set: (value: string) => auth.setEditMode(value === 'edit'),
});

type TabId =
  | 'overview'
  | 'related'
  | 'landscape'
  | 'species'
  | 'links'
  | 'photos';

const status = ref<'loading' | 'ok' | 'missing' | 'unconfigured' | 'error'>(
  'loading'
);
const place = ref<PlaceDetail | null>(null);
/** Approved photographs, main first. */
const photos = ref<PlacePhoto[]>([]);
/** Confirmed recognitions of the place. A recognition has none. */
const recognitions = ref<PlaceRecognition[]>([]);
/** Confirmed links to published places, largest place first. */
const related = ref<PlaceLink[]>([]);
/** Whether the related places have been read. */
const relatedStatus = ref<'loading' | 'ok' | 'error'>('loading');
/** Cards shown at once in each group of the Related tab. */
const RELATED_STEP = 20;
/** Cards shown in each group, by its label. */
const relatedShown = ref<Record<string, number>>({});
/** Related tab groups, read from this place's side. */
const RELATED_ORDER = [
  'Recognised by',
  'Recognises',
  'Located in',
  'Contains',
  'Part of',
  'Has part',
  'Overlaps',
];
const activeTab = ref<TabId>('overview');
/** Curated values of the place, read in edit mode. */
const curation = ref<PlaceCuration | null>(null);
const curationStatus = ref<'idle' | 'loading' | 'ok' | 'error'>('idle');
const editing = computed(
  () => auth.isAdmin && auth.editMode && curationStatus.value === 'ok'
);
const tabButtons = ref<HTMLButtonElement[]>([]);

const title = computed(() => place.value?.name ?? props.name ?? '');
const country = computed(() => countryName(place.value?.iso3 ?? null));
const countries = computed(() => countryNames(place.value?.iso3 ?? null));
const subtitle = computed(() =>
  [country.value, place.value?.designation].filter(Boolean).join(' · ')
);
/** Every place type has the same tabs. Admins in edit mode also get Links and Photos. */
const tabs = computed<{ id: TabId; label: string }[]>(() => [
  { id: 'overview', label: 'Overview' },
  { id: 'related', label: 'Related' },
  { id: 'landscape', label: 'Landscape' },
  { id: 'species', label: 'Species' },
  ...(editing.value
    ? [
        { id: 'links' as const, label: 'Links' },
        { id: 'photos' as const, label: 'Photos' },
      ]
    : []),
]);

/** Leaving edit mode closes the Links and Photos tabs. */
watch(editing, on => {
  if (!on && (activeTab.value === 'links' || activeTab.value === 'photos'))
    activeTab.value = 'overview';
});
/** The Related tab's cards grouped by relationship, in a fixed order. */
const relatedGroups = computed(() => {
  const groups = new Map<string, PlaceLink[]>();
  for (const link of related.value) {
    const label = linkLabel(link.typeId, link.outward);
    groups.set(label, [...(groups.get(label) ?? []), link]);
  }
  const rank = (label: string) => {
    const index = RELATED_ORDER.indexOf(label);
    return index === -1 ? RELATED_ORDER.length : index;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([label, links]) => ({ label, links }));
});

/**
 * Cards shown in one Related group.
 * @param label - The group's label.
 * @returns How many cards to show.
 */
function shownIn(label: string): number {
  return relatedShown.value[label] ?? RELATED_STEP;
}

const hasCropland = computed(
  () => place.value?.croplandKm2 != null && place.value?.percent != null
);
const source = computed(() => place.value?.citation ?? '');
/** The description, one paragraph per blank-line block. */
const paragraphs = computed(() =>
  (place.value?.description ?? '')
    .split(/\n\s*\n/)
    .map(text => text.trim())
    .filter(Boolean)
);
const sourceCountries = computed(() =>
  place.value?.source.iso3 ? place.value.source.iso3.split(';') : []
);
const sourceCountryNames = computed(
  () => countryNames(place.value?.source.iso3 ?? null).join(', ') || null
);

/** Read the curated values when an admin is in edit mode. */
async function loadCuration() {
  const id = place.value?.id;
  if (!id || !auth.isAdmin || !auth.editMode) return;
  curationStatus.value = 'loading';
  const result = await loadPlaceCuration(id);
  if (place.value?.id !== id) return;
  if (result.status !== 'ok') {
    curationStatus.value = 'error';
    return;
  }
  curation.value = result.curation;
  curationStatus.value = 'ok';
}

watch(
  () => [place.value?.id, auth.isAdmin, auth.editMode],
  () => {
    if (curationStatus.value !== 'ok' || !auth.editMode) void loadCuration();
  }
);

/**
 * Save one curated field, or reset it with null.
 * @returns An error message, or null when saved.
 */
async function saveField(
  field: keyof PlaceCuration,
  value: CuratedValue
): Promise<string | null> {
  const current = place.value;
  if (!current) return 'The place is not loaded.';
  const blank = Array.isArray(value) ? value.length === 0 : !value?.trim();
  const result = await curatePlace(current.id, {
    [field]: blank ? null : value,
  });
  if (result.status === 'unconfigured')
    return 'The place store is not configured.';
  if (result.status === 'error') return result.message;
  if (place.value?.id !== current.id) return null;
  curation.value = result.curation;
  place.value = applyCuration(place.value, result.curation);
  return null;
}

/** Load the stored record for the selected place. */
async function load(id: string) {
  status.value = 'loading';
  place.value = null;
  photos.value = [];
  recognitions.value = [];
  related.value = [];
  relatedStatus.value = 'loading';
  relatedShown.value = {};
  activeTab.value = 'overview';
  curation.value = null;
  curationStatus.value = 'idle';
  const result = await loadPilotPlace(id);
  if (id !== props.placeId) return;
  status.value = result.status;
  if (result.status !== 'ok') return;
  place.value = result.place;
  void loadCuration();
  if (result.place.id !== id) {
    emit('moved', result.place.id);
    return;
  }
  await Promise.all([loadPhotos(id), loadLinked(id, result.place.placeTypeId)]);
}

/** Read the approved photographs for the header and the gallery. */
async function loadPhotos(id: string) {
  const read = await loadPlaceImages(id);
  if (id === props.placeId && read.status === 'ok')
    photos.value = approvedPhotos(read.images);
}

/** A photograph changed on the Photos tab. Read the header photographs again. */
function onPhotosChanged() {
  if (!place.value) return;
  void loadPhotos(place.value.id);
  forgetMainPhoto(place.value.id);
}

/** Read the main photographs of the Related cards shown. */
watch(
  () =>
    activeTab.value === 'related'
      ? relatedGroups.value.flatMap(group =>
          group.links.slice(0, shownIn(group.label)).map(link => link.otherId)
        )
      : [],
  ids => requestMainPhotos(ids)
);

/** Read the related places, and a conservation area's recognition badges. */
async function loadLinked(id: string, placeTypeId: string) {
  const reads: Promise<void>[] = [
    loadRelatedPlaces(id).then(read => {
      if (id !== props.placeId) return;
      relatedStatus.value = read.status === 'ok' ? 'ok' : 'error';
      if (read.status === 'ok') related.value = read.links;
    }),
  ];
  if (placeTypeId === PLACE_TYPE)
    reads.push(
      loadPlaceRecognitions(id).then(read => {
        if (id === props.placeId && read.status === 'ok')
          recognitions.value = read.recognitions;
      })
    );
  await Promise.all(reads);
}

/** A link changed on the Links tab. Read what view mode shows again. */
function onLinksChanged() {
  if (place.value) void loadLinked(place.value.id, place.value.placeTypeId);
}

watch(() => props.placeId, load, { immediate: true });

/** Tell the map which conservation areas the open Related tab lists. */
watch(
  () => {
    if (activeTab.value !== 'related' || relatedStatus.value !== 'ok')
      return null;
    const ids = related.value
      .filter(link => link.otherTypeId === PLACE_TYPE)
      .map(link => link.otherId);
    return ids.length ? ids : null;
  },
  (ids, before) => {
    if (ids?.join() !== before?.join()) emit('areas', ids);
  }
);

onBeforeUnmount(() => emit('areas', null));

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
    :class="{ 'is-list-tab': activeTab === 'related' && related.length > 0 }"
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
      <SegmentedControl
        v-if="auth.isAdmin"
        v-model="profileMode"
        type="single"
        variant="outline"
        size="sm"
        class="place-mode"
        aria-label="Profile mode"
      >
        <SegmentedControlItem value="view">View</SegmentedControlItem>
        <SegmentedControlItem value="edit">Edit</SegmentedControlItem>
      </SegmentedControl>
      <p v-if="auth.editMode && curationStatus === 'error'" class="place-note">
        The curated values could not be read, so editing is off.
      </p>
      <PlaceEditField
        :editable="editing"
        label="Display name"
        :curated="curation?.display_name ?? null"
        :source="place?.source.name ?? null"
        :start="place?.source.name ?? null"
        :save="value => saveField('display_name', value)"
      >
        <h2 class="place-title panel-heading">{{ title }}</h2>
      </PlaceEditField>
      <PlaceEditField
        v-if="place && (editing || place.tagline)"
        :editable="editing"
        label="Tagline"
        :curated="curation?.tagline ?? null"
        :source="null"
        :max-length="120"
        :save="value => saveField('tagline', value)"
      >
        <p v-if="place.tagline" class="place-tagline">{{ place.tagline }}</p>
        <p v-else class="place-note">No tagline yet.</p>
      </PlaceEditField>
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
            <PlaceEditField
              v-if="editing || paragraphs.length"
              :editable="editing"
              label="Description"
              kind="text"
              :curated="curation?.description ?? null"
              :source="null"
              :max-length="2000"
              :save="value => saveField('description', value)"
            >
              <div v-if="paragraphs.length" class="place-description">
                <p v-for="(text, index) in paragraphs" :key="index">
                  {{ text }}
                </p>
              </div>
              <p v-else class="place-note">No description yet.</p>
            </PlaceEditField>
            <dl class="place-facts">
              <PlaceEditField
                v-if="editing || place.designation"
                :editable="editing"
                label="Designation"
                :curated="curation?.designation ?? null"
                :source="place.source.designation"
                :start="place.source.designation"
                :suggest="loadDesignations"
                :save="value => saveField('designation', value)"
              >
                <div class="place-fact">
                  <dt>Designation</dt>
                  <dd>{{ place.designation ?? 'None' }}</dd>
                </div>
              </PlaceEditField>
              <PlaceEditField
                v-if="editing || countries.length"
                :editable="editing"
                label="Countries"
                kind="countries"
                :curated="curation?.iso3 ?? null"
                :source="sourceCountryNames"
                :start="sourceCountries"
                :save="value => saveField('iso3', value)"
              >
                <div class="place-fact">
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
              </PlaceEditField>
              <div v-if="place.areaKm2 != null" class="place-fact">
                <dt>Area</dt>
                <dd>{{ formatKm2(place.areaKm2) }} km²</dd>
              </div>
            </dl>
          </template>

          <PlaceLinksEditor
            v-else-if="activeTab === 'links'"
            :place-id="place.id"
            @changed="onLinksChanged"
            @open="id => $emit('open', id)"
          />

          <PlacePhotosEditor
            v-else-if="activeTab === 'photos'"
            :place-id="place.id"
            @changed="onPhotosChanged"
          />

          <template v-else-if="activeTab === 'related'">
            <p v-if="relatedStatus === 'loading'" class="place-note">
              Loading related places.
            </p>
            <p v-else-if="relatedStatus === 'error'" class="place-note">
              The related places could not be loaded.
            </p>
            <p v-else-if="related.length === 0" class="place-note">
              No related places yet.
            </p>
            <div v-else class="place-related">
              <section
                v-for="group in relatedGroups"
                :key="group.label"
                class="place-related-group"
                :aria-label="group.label"
              >
                <p class="place-related-heading map-section">
                  {{ group.label }}
                  <span class="place-related-count">
                    {{ group.links.length.toLocaleString('en-GB') }}
                  </span>
                </p>
                <ul class="place-related-list">
                  <li
                    v-for="link in group.links.slice(0, shownIn(group.label))"
                    :key="link.id"
                  >
                    <PlaceCard
                      :name="link.otherName ?? ''"
                      :iso3="link.otherIso3"
                      :area-km2="link.otherAreaKm2"
                      :place-type-id="link.otherTypeId"
                      :photo="mainPhotoOf(link.otherId)"
                      @click="$emit('open', link.otherId)"
                      @highlight="on => $emit('highlight', link.otherId, on)"
                    />
                  </li>
                  <li v-if="shownIn(group.label) < group.links.length">
                    <button
                      type="button"
                      class="place-related-more map-control"
                      @click="
                        relatedShown[group.label] =
                          shownIn(group.label) + RELATED_STEP
                      "
                    >
                      Show
                      {{
                        Math.min(
                          RELATED_STEP,
                          group.links.length - shownIn(group.label)
                        )
                      }}
                      more
                    </button>
                  </li>
                </ul>
              </section>
            </div>
          </template>

          <template v-else-if="activeTab === 'landscape'">
            <p class="map-section">Cropland, 2024</p>
            <dl v-if="hasCropland" class="place-facts">
              <div class="place-fact">
                <dt>Cropland area</dt>
                <dd>{{ formatKm2(place.croplandKm2 as number) }} km²</dd>
              </div>
              <div class="place-fact">
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

.place-mode {
  align-self: flex-start;
}

.place-tagline {
  margin: -8px 0 0;
  font-size: 15px;
  line-height: 1.4;
  color: var(--foreground);
}

.place-description {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--foreground);
}

.place-description p {
  margin: 0;
  white-space: pre-line;
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

.place-related {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 2px;
}

.place-related-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.place-related-heading {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
}

.place-related-count {
  color: var(--muted-foreground);
  font-variant-numeric: tabular-nums;
}

.place-related-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.place-related-more {
  cursor: pointer;
}

.place-recognition-go {
  margin-left: -2px;
  color: var(--muted-foreground);
}

/*
 * On the Related tab only the cards scroll. The header, the tabs,
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

  .place-profile.is-list-tab .place-related {
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
  flex-wrap: wrap;
  gap: 12px 24px;
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

.place-fact {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  font-size: 13px;
}

/* A row is a fact, or a fact wrapped in its edit field. */
.place-facts > * + * {
  border-top: 1px solid var(--border);
}

.place-facts > .place-fact:first-child,
.place-facts > :first-child .place-fact {
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
