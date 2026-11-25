<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  LocateFixed,
  X,
} from '@lucide/vue';
import PlaceCard from '@/components/PlaceCard.vue';
import PlaceLinksEditor from '@/components/PlaceLinksEditor.vue';
import PlaceEditField, {
  type CuratedValue,
} from '@/components/PlaceEditField.vue';
import PlacePhotos from '@/components/PlacePhotos.vue';
import PlacePhotosEditor from '@/components/PlacePhotosEditor.vue';
import PlaceStatusEditor from '@/components/PlaceStatusEditor.vue';
import useAuthStore from '@/store/AuthStore';
import usePlacesStore from '@/store/PlacesStore';
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
  ECOREGION_TYPE,
  RECOGNITION_LABEL,
  recognitionColour,
  SPECIES_NOTHING_YET,
  countryNames,
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
import { loadPlaceStatus, type PlaceStatus } from '@/places/status';

const props = withDefaults(
  defineProps<{
    placeId: string;
    /** Shown while the stored record loads. */
    name?: string;
    /** Whether the photo queue has a place after this one. Shows Next place on the Photos tab. */
    hasNext?: boolean;
  }>(),
  { name: undefined, hasNext: false }
);

const emit = defineEmits<{
  close: [];
  zoom: [];
  /** The place was merged into another. Its id is the one shown. */
  moved: [id: string];
  /** A recognition badge or a related place was chosen. Open it. */
  open: [id: string];
  /**
   * The conservation areas the open Related tab of this place lists, or null
   * when it is closed or lists none.
   */
  areas: [placeId: string, name: string, ids: string[] | null];
  /** The pointer or focus entered or left a card on the Related tab. */
  highlight: [id: string, on: boolean];
  /** A photograph was added, reviewed, or moved. */
  photosChanged: [];
  /** Next place was chosen on the Photos tab. */
  next: [];
}>();

/** Admins turn Edit mode on in the Profile panel. */
const auth = useAuthStore();
/** The open tab, the history, and the Related sets live in the store. */
const placesStore = usePlacesStore();

type TabId =
  | 'overview'
  | 'related'
  | 'landscape'
  | 'species'
  | 'links'
  | 'photos'
  | 'status';

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
/**
 * The open tab, kept in the store so it stays when another place opens. A tab
 * this place does not have shows Overview.
 */
const activeTab = computed<TabId>({
  get: () =>
    tabs.value.some(tab => tab.id === placesStore.profileTab)
      ? (placesStore.profileTab as TabId)
      : 'overview',
  set: tab => {
    placesStore.profileTab = tab;
  },
});
/** The places before this one in the breadcrumb, most recent last. */
const BREADCRUMB_STEPS = 2;
const breadcrumb = computed(() =>
  placesStore.history
    .map((entry, index) => ({ ...entry, index }))
    .slice(-BREADCRUMB_STEPS)
);
const previous = computed(
  () => placesStore.history[placesStore.history.length - 1] ?? null
);
/** Curated values of the place, read in edit mode. */
const curation = ref<PlaceCuration | null>(null);
const curationStatus = ref<'idle' | 'loading' | 'ok' | 'error'>('idle');
const editing = computed(
  () => auth.isAdmin && auth.editMode && curationStatus.value === 'ok'
);
const tabButtons = ref<HTMLButtonElement[]>([]);

const title = computed(() => place.value?.name ?? props.name ?? '');
const countries = computed(() => countryNames(place.value?.iso3 ?? null));
/** Every place type has the same tabs. Admins in edit mode also get Links and Photos. */
/**
 * View mode has Overview, Related, Landscape, and Species. Edit mode has only
 * what an admin edits: Overview, Related (every link, to review), Photos, and
 * Status.
 */
const tabs = computed<{ id: TabId; label: string }[]>(() =>
  editing.value
    ? [
        { id: 'overview', label: 'Overview' },
        { id: 'links', label: 'Related' },
        { id: 'photos', label: 'Photos' },
        { id: 'status', label: 'Status' },
      ]
    : [
        { id: 'overview', label: 'Overview' },
        { id: 'related', label: 'Related' },
        { id: 'landscape', label: 'Landscape' },
        { id: 'species', label: 'Species' },
      ]
);

/** The tab each tab becomes when Edit mode is turned on. */
const EDIT_TAB: Partial<Record<TabId, TabId>> = {
  related: 'links',
  landscape: 'overview',
  species: 'overview',
};
/** The tab each tab becomes when Edit mode is turned off. */
const VIEW_TAB: Partial<Record<TabId, TabId>> = {
  links: 'related',
  photos: 'overview',
  status: 'overview',
};

/**
 * Turning Edit mode on or off keeps the open tab where it has a counterpart:
 * Related in view mode is Related in edit mode. This follows the toggle, not
 * `editing`, which is briefly false while the next place's values load.
 */
watch(
  () => auth.isAdmin && auth.editMode,
  on => {
    const next = (on ? EDIT_TAB : VIEW_TAB)[placesStore.profileTab as TabId];
    if (next) placesStore.profileTab = next;
  }
);
/**
 * The ecoregions the place lies in, shown as tags in Overview, largest share
 * of the place first.
 */
const ecoregions = computed(() =>
  related.value
    .filter(
      link =>
        link.outward &&
        link.typeId === 'located_in' &&
        link.otherTypeId === ECOREGION_TYPE
    )
    .sort(
      (a, b) =>
        (b.coverage ?? 0) - (a.coverage ?? 0) ||
        (a.otherName ?? '').localeCompare(b.otherName ?? '')
    )
);

/**
 * The Related tab's cards grouped by relationship, in a fixed order. The
 * recognitions shown as badges under the title, and the ecoregions shown as
 * tags in Overview, are left out.
 */
const relatedGroups = computed(() => {
  const groups = new Map<string, PlaceLink[]>();
  const badged = new Set([
    ...recognitions.value.map(item => item.id),
    ...ecoregions.value.map(link => link.otherId),
  ]);
  for (const link of related.value) {
    if (badged.has(link.otherId)) continue;
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

/** Whether the place is withdrawn or flagged. Read in edit mode. */
const placeStatus = ref<PlaceStatus | null>(null);

/** Read whether the place is withdrawn or flagged, when an admin is in edit mode. */
async function loadStatus() {
  const id = place.value?.id;
  if (!id || !auth.isAdmin || !auth.editMode) return;
  const result = await loadPlaceStatus(id);
  if (place.value?.id !== id) return;
  placeStatus.value = result.status === 'ok' ? result.placeStatus : null;
}

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
    if (!placeStatus.value) void loadStatus();
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
  curation.value = null;
  curationStatus.value = 'idle';
  placeStatus.value = null;
  const result = await loadPilotPlace(id);
  if (id !== props.placeId) return;
  status.value = result.status;
  if (result.status !== 'ok') return;
  place.value = result.place;
  placesStore.selectedName = result.place.name;
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
  emit('photosChanged');
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
    // The selected place, not the one still loaded: opening one of the listed
    // places switches the tab before the profile has read the new place.
    if (ids?.join() !== before?.join())
      emit('areas', props.placeId, title.value, ids);
  }
);

onBeforeUnmount(() => emit('areas', props.placeId, '', null));

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
    :class="{
      'is-list-tab':
        (activeTab === 'related' && related.length > 0) ||
        activeTab === 'photos',
    }"
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
    <button
      v-if="previous"
      type="button"
      class="place-close place-back"
      :aria-label="previous.name ? `Back to ${previous.name}` : 'Back'"
      :title="previous.name ? `Back to ${previous.name}` : 'Back'"
      @click="placesStore.goBack()"
    >
      <ArrowLeft :size="16" :stroke-width="2.25" aria-hidden="true" />
    </button>

    <div class="place-body">
      <nav
        v-if="breadcrumb.length"
        class="place-breadcrumb"
        aria-label="Places opened before"
      >
        <template v-for="entry in breadcrumb" :key="entry.index">
          <button
            type="button"
            class="place-breadcrumb-step"
            :title="entry.name"
            @click="placesStore.goBack(entry.index)"
          >
            {{ entry.name || 'Place' }}
          </button>
          <ChevronRight
            class="place-breadcrumb-sep"
            :size="12"
            :stroke-width="2.25"
            aria-hidden="true"
          />
        </template>
      </nav>
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
      <ul
        v-if="
          editing &&
          placeStatus &&
          (placeStatus.withdrawn || placeStatus.attentionReason)
        "
        class="place-flags"
        aria-label="Status"
      >
        <li v-if="placeStatus.withdrawn" class="place-flag is-withdrawn">
          {{
            placeStatus.withdrawalReason
              ? `Withdrawn: ${placeStatus.withdrawalReason}`
              : 'Withdrawn'
          }}
        </li>
        <li v-if="placeStatus.attentionReason" class="place-flag">
          Needs attention: {{ placeStatus.attentionReason }}
        </li>
      </ul>
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
              <div v-if="ecoregions.length" class="place-fact">
                <dt>
                  {{ ecoregions.length > 1 ? 'Ecoregions' : 'Ecoregion' }}
                </dt>
                <dd>
                  <ul class="place-countries">
                    <li v-for="link in ecoregions" :key="link.id">
                      <button
                        type="button"
                        class="place-country place-ecoregion"
                        @click="$emit('open', link.otherId)"
                      >
                        {{ link.otherName }}
                      </button>
                    </li>
                  </ul>
                </dd>
              </div>
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

          <template v-else-if="activeTab === 'photos'">
            <button
              v-if="hasNext"
              type="button"
              class="map-control place-next"
              @click="$emit('next')"
            >
              Next place
              <ArrowRight :size="16" aria-hidden="true" />
            </button>
            <PlacePhotosEditor
              :place-id="place.id"
              :place-name="title"
              @changed="onPhotosChanged"
            />
          </template>

          <PlaceStatusEditor
            v-else-if="activeTab === 'status' && placeStatus"
            :place-id="place.id"
            :place-status="placeStatus"
            @changed="next => (placeStatus = next)"
          />
          <p v-else-if="activeTab === 'status'" class="place-note">
            Loading the status.
          </p>

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
                      :highlighted="placesStore.hoveredId === link.otherId"
                      :reveal="placesStore.hoveredFrom === 'map'"
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
              <p class="place-source">{{ source }}</p>
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
        <p
          v-if="!(activeTab === 'related' && related.length > 0)"
          class="place-source"
        >
          {{ source }}
        </p>
      </template>
    </div>
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

.place-flags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.place-flag {
  padding: 2px 8px;
  border-radius: 999px;
  background: #fdf0d5;
  color: #6b4a07;
  font-size: 12px;
  line-height: 1.4;
}

.place-flag.is-withdrawn {
  background: #f6dcd9;
  color: #7a271a;
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

.place-ecoregion {
  border: 0;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.place-ecoregion:hover {
  background: var(--secondary);
}

.place-ecoregion:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 1px;
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
 * On the Related and Photos tabs only the list scrolls. The header, the tabs,
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

.place-zoom {
  align-self: flex-start;
}

.place-status,
.place-next {
  align-self: flex-end;
}

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

/* The source line ends the content and scrolls with it. */
.place-source {
  flex: none;
  margin: 8px 0 0;
  font-size: 10px;
  line-height: 1.5;
  color: var(--muted-foreground);
}

.place-back {
  right: auto;
  left: 12px;
}

/* One line of the places opened before, above the title. Long names are cut short. */
.place-breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  margin: 0 0 -8px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted-foreground);
  white-space: nowrap;
}

.place-breadcrumb-step {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 45%;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.place-breadcrumb-step:hover {
  color: var(--foreground);
}

.place-breadcrumb-step:focus-visible {
  outline: 2px solid var(--foreground, #24312c);
  outline-offset: 2px;
}

.place-breadcrumb-sep {
  flex: none;
}

@media (max-width: 720px) {
  .place-body {
    gap: 12px;
    padding: 16px;
  }

  .place-title {
    font-size: 24px;
  }
}
</style>
