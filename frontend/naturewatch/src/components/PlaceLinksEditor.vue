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
import { Button } from '@/components/ui/button';
import {
  LINK_CHOICES,
  linkLabel,
  loadPlaceLinks,
  searchPlaces,
  setPlaceRelationship,
  type LinkStatus,
  type PlaceLink,
  type PlaceSummary,
} from '@/places/api';
import { formatPercent, placeTypeLabel } from '@/places/display';

const props = defineProps<{ placeId: string }>();

const emit = defineEmits<{
  /** A link was added or its status changed. */
  changed: [];
  /** The other place of a link was chosen. Open it. */
  open: [id: string];
}>();

/** Links shown at once in each group. */
const LINK_STEP = 20;
/** Wait this long after typing before searching. */
const SEARCH_DELAY_MS = 250;

const GROUPS: { status: LinkStatus; label: string }[] = [
  { status: 'proposed', label: 'Proposed' },
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'rejected', label: 'Rejected' },
  { status: 'retired', label: 'Retired' },
];

/** The actions each status offers, in order. */
const ACTIONS: Record<LinkStatus, { status: LinkStatus; label: string }[]> = {
  proposed: [
    { status: 'confirmed', label: 'Confirm' },
    { status: 'rejected', label: 'Reject' },
  ],
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
const shown = ref<Record<LinkStatus, number>>(initialShown());
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

const grouped = computed(() =>
  GROUPS.map(group => ({
    ...group,
    links: links.value.filter(link => link.status === group.status),
  })).filter(group => group.links.length > 0)
);

/** Every group starts with one step of links shown. */
function initialShown(): Record<LinkStatus, number> {
  return {
    proposed: LINK_STEP,
    confirmed: LINK_STEP,
    rejected: LINK_STEP,
    retired: LINK_STEP,
  };
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
    shown.value = initialShown();
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

/** Confirm, reject, or retire one link, then read the links again. */
async function review(link: PlaceLink, next: LinkStatus) {
  busyId.value = link.id;
  linkError.value = null;
  const [subject, object] = ends(link.outward, link.otherId);
  const result = await setPlaceRelationship(subject, link.typeId, object, next);
  busyId.value = null;
  if (result.status !== 'ok') {
    linkError.value = {
      id: link.id,
      message:
        result.status === 'error'
          ? result.message
          : 'The place store is not configured.',
    };
    return;
  }
  await load();
  emit('changed');
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
      :key="group.status"
      class="links-group"
      :aria-label="group.label"
      :data-status="group.status"
    >
      <p class="map-section links-heading">
        {{ group.label }} ({{ group.links.length.toLocaleString('en-GB') }})
      </p>
      <ul class="links-list">
        <li
          v-for="link in group.links.slice(0, shown[group.status])"
          :key="link.id"
          class="links-item"
          :data-link="link.id"
        >
          <p class="links-label">{{ linkLabel(link.typeId, link.outward) }}</p>
          <button
            v-if="link.otherName"
            type="button"
            class="links-name"
            @click="emit('open', link.otherId)"
          >
            {{ link.otherName }}
          </button>
          <p v-else class="links-name is-plain">{{ link.otherId }}</p>
          <p class="links-note">
            {{ placeTypeLabel(link.otherTypeId) }} ·
            {{ link.origin === 'manual' ? 'Added by an admin' : link.origin }}
            <template v-if="link.coverage != null">
              · {{ formatPercent(link.coverage * 100) }}% of this place inside
            </template>
          </p>
          <p
            v-if="linkError?.id === link.id"
            class="links-note is-error"
            role="alert"
          >
            {{ linkError.message }}
          </p>
          <div v-if="ACTIONS[link.status].length" class="links-actions">
            <Button
              v-for="action in ACTIONS[link.status]"
              :key="action.status"
              type="button"
              size="sm"
              :variant="action.status === 'confirmed' ? 'default' : 'outline'"
              :disabled="busyId === link.id"
              @click="review(link, action.status)"
            >
              {{ action.label }}
            </Button>
          </div>
        </li>
        <li v-if="shown[group.status] < group.links.length">
          <button
            type="button"
            class="links-more map-control"
            @click="shown[group.status] += LINK_STEP"
          >
            Show
            {{ Math.min(LINK_STEP, group.links.length - shown[group.status]) }}
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

.links-input:focus-visible,
.links-name:focus-visible {
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

.links-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.links-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--background);
}

.links-name {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--foreground);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  text-align: left;
  overflow-wrap: anywhere;
  cursor: pointer;
}

.links-name:hover {
  text-decoration: underline;
}

.links-name.is-plain {
  font-weight: 400;
  color: var(--muted-foreground);
  cursor: default;
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
  margin-top: 4px;
}

.links-more {
  width: 100%;
}
</style>
