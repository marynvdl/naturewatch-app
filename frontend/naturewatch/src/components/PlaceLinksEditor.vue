<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxRoot,
  ComboboxViewport,
} from 'reka-ui';
import { Plus } from '@lucide/vue';
import EditDialog from '@/components/EditDialog.vue';
import PlaceCard from '@/components/PlaceCard.vue';
import { Button } from '@/components/ui/button';
import {
  LINK_CHOICES,
  groupByRelationship,
  largestFirst,
  linkLabel,
  loadPlaceLinks,
  searchPlaces,
  setPlaceRelationship,
  type LinkStatus,
  type PlaceLink,
  type PlaceSummary,
} from '@/places/api';
import { formatPercent, placeTypeLabel } from '@/places/display';
import { mainPhotoOf, requestMainPhotos } from '@/places/mainPhotos';
import { reviewOverlap, type OverlapDecision } from '@/places/overlapReview';
import usePlacesStore from '@/store/PlacesStore';

const props = defineProps<{
  placeId: string;
  /** This place's type. Same place needs two conservation areas. */
  placeTypeId?: string | null;
}>();

const placesStore = usePlacesStore();

const emit = defineEmits<{
  /** A link was added or its status changed. */
  changed: [];
  /** The other place of a link was chosen. Open it. */
  open: [id: string];
  /** The pointer or focus entered or left a link's card. */
  highlight: [id: string, on: boolean];
}>();

/** Links shown at once in each group. */
const LINK_STEP = 20;
/** Wait this long after typing before searching. */
const SEARCH_DELAY_MS = 250;

/** How each origin reads under a card. */
const ORIGIN_LABEL: Record<PlaceLink['origin'], string> = {
  manual: 'Added by an admin',
  derived: 'Derived from the boundaries',
  imported: 'Imported',
};

/** One group of the list: a status, or one relationship of the confirmed links. */
interface LinkGroup {
  key: string;
  label: string;
  status: LinkStatus;
  links: PlaceLink[];
}

/** One button under a card: a status to set, or a decision on a proposed link. */
type LinkAction =
  | { kind: 'status'; status: LinkStatus; label: string }
  | { kind: 'decision'; decision: OverlapDecision; label: string };

/** The decisions on a proposed link, in order. */
const PROPOSED: LinkAction[] = [
  { kind: 'decision', decision: 'keep', label: 'Keep link' },
  { kind: 'decision', decision: 'not_related', label: 'Not related' },
];
const SAME_PLACE: LinkAction = {
  kind: 'decision',
  decision: 'same_place',
  label: 'Same place, hide it',
};
const BACK_TO_REVIEW: LinkAction = {
  kind: 'decision',
  decision: 'undo',
  label: 'Back to review',
};
const CONSERVATION_AREA = 'conservation_area';

/** The statuses a reviewed link can be set to, in order. */
const ACTIONS: Record<
  Exclude<LinkStatus, 'proposed'>,
  { status: LinkStatus; label: string }[]
> = {
  confirmed: [
    { status: 'rejected', label: 'Reject' },
    { status: 'retired', label: 'Retire' },
  ],
  rejected: [
    { status: 'confirmed', label: 'Confirm' },
    { status: 'retired', label: 'Retire' },
  ],
  retired: [],
};

const links = ref<PlaceLink[]>([]);
const status = ref<'loading' | 'ok' | 'error'>('loading');
/** Cards shown in each group, by its key. */
const shown = ref<Record<string, number>>({});
/** The link being saved, so its buttons are disabled. */
const busyId = ref<string | null>(null);
const linkError = ref<{ id: string; message: string } | null>(null);

/** The add form's dialog is open. */
const addOpen = ref(false);
const choiceIndex = ref(0);
const query = ref('');
const results = ref<PlaceSummary[]>([]);
const searching = ref(false);
const chosen = ref<PlaceSummary | null>(null);
const adding = ref(false);
const addError = ref('');
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchAbort: AbortController | null = null;

/**
 * Proposed links first, then the confirmed ones in the Related tab's groups,
 * then the rejected and the retired ones. Each link appears once.
 */
const grouped = computed<LinkGroup[]>(() => {
  const byStatus = (status: LinkStatus, label: string): LinkGroup => ({
    key: status,
    label,
    status,
    links: links.value
      .filter(link => link.status === status)
      .sort(largestFirst),
  });
  return [
    byStatus('proposed', 'Proposed'),
    ...groupByRelationship(
      links.value.filter(link => link.status === 'confirmed')
    ).map(group => ({
      key: `confirmed:${group.label}`,
      label: group.label,
      status: 'confirmed' as const,
      links: group.links,
    })),
    byStatus('rejected', 'Rejected'),
    byStatus('retired', 'Retired'),
  ].filter(group => group.links.length > 0);
});

/**
 * Cards shown in one group.
 * @param key - The group's key.
 * @returns How many cards to show.
 */
function shownIn(key: string): number {
  return shown.value[key] ?? LINK_STEP;
}

/** Read the main photographs of the cards shown. */
watch(
  () =>
    grouped.value.flatMap(group =>
      group.links
        .slice(0, shownIn(group.key))
        .filter(link => link.otherName)
        .map(link => link.otherId)
    ),
  ids => requestMainPhotos(ids)
);

/**
 * The line under a card: the relationship outside the confirmed groups, the
 * origin, and the share of this place inside the other.
 */
function noteOf(link: PlaceLink, group: LinkGroup): string {
  return [
    group.status === 'confirmed' ? null : linkLabel(link.typeId, link.outward),
    ORIGIN_LABEL[link.origin] ?? link.origin,
    link.coverage != null
      ? `${formatPercent(link.coverage * 100)}% of this place inside`
      : null,
    link.otherCoverage != null
      ? `${formatPercent(link.otherCoverage * 100)}% of it inside this place`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Read every link of the place. */
async function load() {
  const id = props.placeId;
  const read = await loadPlaceLinks(id);
  if (id !== props.placeId) return;
  if (read.status !== 'ok') {
    status.value = 'error';
    return;
  }
  links.value = read.links;
  status.value = 'ok';
}

watch(
  () => props.placeId,
  () => {
    status.value = 'loading';
    links.value = [];
    shown.value = {};
    linkError.value = null;
    resetForm();
    void load();
  },
  { immediate: true }
);

/** Subject and object of a link, in the order the database stores them. */
function ends(outward: boolean, otherId: string): [string, string] {
  return outward ? [props.placeId, otherId] : [otherId, props.placeId];
}

/**
 * The buttons under a card. A proposed link gets the decisions, with Same
 * place for an overlap between two conservation areas. A reviewed derived link
 * can go back to review.
 */
function actionsOf(link: PlaceLink): LinkAction[] {
  if (link.status === 'proposed') {
    const same =
      link.typeId === 'overlaps' &&
      props.placeTypeId === CONSERVATION_AREA &&
      link.otherTypeId === CONSERVATION_AREA;
    return same ? [...PROPOSED, SAME_PLACE] : PROPOSED;
  }
  const actions: LinkAction[] = ACTIONS[link.status].map(action => ({
    kind: 'status',
    ...action,
  }));
  if (link.status !== 'retired' && link.origin === 'derived')
    actions.push(BACK_TO_REVIEW);
  return actions;
}

/** Whether a button is the main one: the one that keeps the link. */
function isMain(action: LinkAction): boolean {
  return action.kind === 'status'
    ? action.status === 'confirmed'
    : action.decision === 'keep';
}

/** A key for a button. */
function keyOf(action: LinkAction): string {
  return action.kind === 'status' ? action.status : action.decision;
}

/** Run one button, then read the links again. */
async function act(link: PlaceLink, action: LinkAction) {
  if (action.kind === 'status') await review(link, action.status);
  else await decide(link, action.decision);
}

/** Show why a change failed under its link. */
function fail(link: PlaceLink, message: string) {
  linkError.value = { id: link.id, message };
}

/** The links changed: read them again, and tell the list and the map. */
async function changed(hidden: boolean) {
  await load();
  emit('changed');
  placesStore.adminListVersion += 1;
  if (hidden) void placesStore.loadWithdrawn();
}

/** Confirm, reject, or retire one link, then read the links again. */
async function review(link: PlaceLink, next: LinkStatus) {
  busyId.value = link.id;
  linkError.value = null;
  const [subject, object] = ends(link.outward, link.otherId);
  const result = await setPlaceRelationship(subject, link.typeId, object, next);
  busyId.value = null;
  if (result.status !== 'ok') {
    fail(
      link,
      result.status === 'error'
        ? result.message
        : 'The place store is not configured.'
    );
    return;
  }
  await changed(false);
}

/**
 * Keep a proposed link, mark it not related, hide the place on the card as
 * the same place, or put a reviewed link back to review.
 */
async function decide(link: PlaceLink, decision: OverlapDecision) {
  busyId.value = link.id;
  linkError.value = null;
  const message = await reviewOverlap(
    link.id,
    decision,
    decision === 'same_place' ? link.otherId : null
  );
  busyId.value = null;
  if (message) {
    fail(link, message);
    return;
  }
  await changed(decision === 'same_place' || decision === 'undo');
}

/** Search for places a short while after typing stops. */
function onSearch(text: string) {
  query.value = text;
  if (chosen.value && text !== chosen.value.name) chosen.value = null;
  clearTimeout(searchTimer);
  searchAbort?.abort();
  if (!text.trim()) {
    results.value = [];
    searching.value = false;
    return;
  }
  searching.value = true;
  searchTimer = setTimeout(async () => {
    const abort = new AbortController();
    searchAbort = abort;
    const read = await searchPlaces(text, abort.signal);
    if (abort.signal.aborted) return;
    searching.value = false;
    results.value =
      read.status === 'ok'
        ? read.places.filter(item => item.id !== props.placeId)
        : [];
  }, SEARCH_DELAY_MS);
}

/** A search result was chosen. */
function onChoose(value: unknown) {
  const item = value as PlaceSummary | null;
  chosen.value = item;
  if (item) query.value = item.name;
}

/** Empty the add form and cancel a search in flight. */
function resetForm() {
  clearTimeout(searchTimer);
  searchAbort?.abort();
  query.value = '';
  results.value = [];
  searching.value = false;
  chosen.value = null;
  addError.value = '';
}

/** Store the chosen link as confirmed, then close the dialog. */
async function add() {
  const other = chosen.value;
  const choice = LINK_CHOICES[choiceIndex.value];
  if (!other || !choice) return;
  adding.value = true;
  addError.value = '';
  const [subject, object] = ends(choice.outward, other.id);
  const result = await setPlaceRelationship(
    subject,
    choice.typeId,
    object,
    'confirmed'
  );
  adding.value = false;
  if (result.status !== 'ok') {
    addError.value =
      result.status === 'error'
        ? result.message
        : 'The place store is not configured.';
    return;
  }
  addOpen.value = false;
  await load();
  emit('changed');
}

/** Closing the dialog empties the form. */
watch(addOpen, open => {
  if (!open) resetForm();
});

onBeforeUnmount(() => {
  clearTimeout(searchTimer);
  searchAbort?.abort();
});
</script>

<template>
  <div class="links">
    <div class="links-bar">
      <Button
        type="button"
        size="sm"
        variant="outline"
        class="links-open"
        @click="addOpen = true"
      >
        Add
        <Plus :size="14" :stroke-width="2.25" aria-hidden="true" />
      </Button>
      <EditDialog
        v-model:open="addOpen"
        title="Add a link"
        description="Choose how this place relates to another place, then find that place by name."
        submit-label="Add"
        :submit-disabled="!chosen"
        :busy="adding"
        :error="addError"
        @submit="add"
      >
        <label class="links-field" for="link-type">
          <span class="links-label">This place</span>
          <select
            id="link-type"
            v-model.number="choiceIndex"
            class="links-input"
          >
            <option
              v-for="(choice, index) in LINK_CHOICES"
              :key="`${choice.typeId}-${choice.outward}`"
              :value="index"
            >
              {{ choice.label }}
            </option>
          </select>
        </label>
        <div class="links-field">
          <span id="link-place-label" class="links-label">Place</span>
          <ComboboxRoot
            :model-value="chosen"
            by="id"
            ignore-filter
            :open="query.trim().length > 0 && !chosen"
            @update:model-value="onChoose"
          >
            <ComboboxAnchor>
              <ComboboxInput
                id="link-place"
                aria-labelledby="link-place-label"
                :model-value="query"
                class="links-input"
                placeholder="Search by name"
                :display-value="() => query"
                @update:model-value="onSearch"
              />
            </ComboboxAnchor>
            <ComboboxContent
              class="suggest-list nw"
              position="popper"
              :side-offset="4"
            >
              <ComboboxViewport>
                <ComboboxEmpty class="suggest-item">
                  {{ searching ? 'Searching.' : 'No place matches.' }}
                </ComboboxEmpty>
                <ComboboxItem
                  v-for="item in results"
                  :key="item.id"
                  :value="item"
                  class="suggest-item"
                >
                  <span class="links-result-name">{{ item.name }}</span>
                  <span class="links-result-type">
                    {{ placeTypeLabel(item.place_type_id ?? null) }}
                  </span>
                </ComboboxItem>
              </ComboboxViewport>
            </ComboboxContent>
          </ComboboxRoot>
        </div>
      </EditDialog>
    </div>

    <p v-if="status === 'loading'" class="place-note">Loading links.</p>
    <p v-else-if="status === 'error'" class="place-note">
      The links could not be loaded.
    </p>
    <p v-else-if="links.length === 0" class="place-note">No links yet.</p>
    <section
      v-for="group in grouped"
      v-else
      :key="group.key"
      class="links-group"
      :aria-label="group.label"
      :data-status="group.status"
    >
      <p class="map-section links-heading">
        {{ group.label }}
        <span class="links-count">
          {{ group.links.length.toLocaleString('en-GB') }}
        </span>
      </p>
      <ul class="links-list">
        <li
          v-for="link in group.links.slice(0, shownIn(group.key))"
          :key="link.id"
          class="links-item"
          :data-link="link.id"
        >
          <PlaceCard
            v-if="link.otherName"
            :name="link.otherName"
            :iso3="link.otherIso3"
            :area-km2="link.otherAreaKm2"
            :place-type-id="link.otherTypeId"
            :photo="mainPhotoOf(link.otherId)"
            @click="emit('open', link.otherId)"
            @highlight="on => emit('highlight', link.otherId, on)"
          />
          <p v-else class="links-name">{{ link.otherId }}</p>
          <p class="links-note">{{ noteOf(link, group) }}</p>
          <p
            v-if="linkError?.id === link.id"
            class="links-note is-error"
            role="alert"
          >
            {{ linkError.message }}
          </p>
          <div v-if="actionsOf(link).length" class="links-actions">
            <Button
              v-for="action in actionsOf(link)"
              :key="keyOf(action)"
              type="button"
              size="sm"
              :variant="isMain(action) ? 'default' : 'outline'"
              :disabled="busyId === link.id"
              @click="act(link, action)"
            >
              {{ action.label }}
            </Button>
          </div>
        </li>
        <li v-if="shownIn(group.key) < group.links.length">
          <button
            type="button"
            class="links-more map-control"
            @click="shown[group.key] = shownIn(group.key) + LINK_STEP"
          >
            Show
            {{ Math.min(LINK_STEP, group.links.length - shownIn(group.key)) }}
            more
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.links {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.links-bar {
  display: flex;
  justify-content: flex-end;
}

.links-open {
  gap: 4px;
}

.links-heading {
  margin: 0;
}

.links-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.links-label {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted-foreground);
}

.links-input {
  width: 100%;
  height: 36px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
  color: var(--foreground);
  font: inherit;
  font-size: 14px;
}

.links-input:focus-visible {
  outline: 2px solid var(--foreground, #24312c);
  outline-offset: 2px;
}

.links-result-name {
  display: block;
}

.links-result-type {
  display: block;
  font-size: 12px;
  color: var(--muted-foreground);
}

.links-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.links-heading {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.links-count {
  color: var(--muted-foreground);
  font-variant-numeric: tabular-nums;
}

.links-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.links-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.links-name {
  margin: 0;
  font-size: 14px;
  color: var(--muted-foreground);
  overflow-wrap: anywhere;
}

.links-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted-foreground);
  overflow-wrap: anywhere;
}

.links-note.is-error {
  color: var(--destructive, #b42318);
}

.links-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.links-more {
  width: 100%;
  cursor: pointer;
}
</style>
