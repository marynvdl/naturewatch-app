<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import CorrectionPhotosField from '@/components/CorrectionPhotosField.vue';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/ui/segmented-control';
import { catalog } from '@/catalog';
import {
  CORRECTION_PHOTO_MAX,
  loadCorrections,
  photoUrls,
  removeCorrectionPhotoObjects,
  reviewCorrection,
  setCorrectionPhotos,
  uploadCorrectionPhoto,
  type CorrectionStatus,
  type StoredCorrection,
} from '@/corrections/api';
import { ACTION_LABELS, valueText, yearsText } from '@/corrections/form';
import useCorrectionsStore from '@/store/CorrectionsStore';

/**
 * The corrections to review, for an admin in Edit mode, in the Places panel.
 * Choosing one outlines it on the map and opens its photos and review.
 */
const PAGE = 25;
/** The longest review note `layer_corrections` keeps. */
const REVIEW_NOTE_MAX = 500;
const STATUSES: { id: CorrectionStatus; label: string }[] = [
  { id: 'submitted', label: 'Submitted' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];

const corrections = useCorrectionsStore();
const uid = useId();

const status = ref<CorrectionStatus>('submitted');
const state = ref<'loading' | 'ok' | 'error'>('loading');
const items = ref<StoredCorrection[]>([]);
const total = ref(0);
const loadingMore = ref(false);
const busy = ref(false);
const error = ref('');
const reviewNote = ref('');
const urls = ref<Record<string, string>>({});
let request = 0;

const chosenId = computed(() => corrections.chosen?.id ?? null);
const hasMore = computed(() => items.value.length < total.value);
const countText = computed(() => {
  const noun = total.value === 1 ? 'correction' : 'corrections';
  const shown =
    items.value.length === total.value
      ? `${total.value}`
      : `${items.value.length} of ${total.value}`;
  return `${shown} ${status.value} ${noun}`;
});
const chosenPhotos = computed(() =>
  (corrections.chosen?.photoPaths ?? []).map(path => ({
    key: path,
    src: urls.value[path] ?? '',
  }))
);

/**
 * The layer's title in the catalog, or its id when it has left the catalog.
 * @param id - The layer id.
 */
function layerTitle(id: string): string {
  return catalog.layers.find(layer => layer.id === id)?.title ?? id;
}

/**
 * What the correction says should be there.
 * @param item - The correction.
 */
function actionText(item: StoredCorrection): string {
  const block = catalog.layers.find(
    layer => layer.id === item.layerId
  )?.corrections;
  const value = valueText(block, item.value);
  return value
    ? `${ACTION_LABELS[item.action]} · ${value}`
    : ACTION_LABELS[item.action];
}

/**
 * A date as day, short month, and year.
 * @param iso - A timestamp.
 */
function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Read the list from the start, keeping as many entries as are shown. */
async function reload() {
  const current = ++request;
  const limit = Math.min(Math.max(PAGE, items.value.length), 200);
  const result = await loadCorrections([status.value], limit, 0);
  if (current !== request) return;
  if (result.status !== 'ok') {
    state.value = 'error';
    return;
  }
  items.value = result.corrections;
  total.value = result.total;
  state.value = 'ok';
  const fresh = items.value.find(item => item.id === chosenId.value);
  if (fresh) corrections.chosen = fresh;
}

/** Add the next page. */
async function showMore() {
  if (loadingMore.value) return;
  const current = request;
  loadingMore.value = true;
  const result = await loadCorrections(
    [status.value],
    PAGE,
    items.value.length
  );
  loadingMore.value = false;
  if (current !== request || result.status !== 'ok') return;
  const have = new Set(items.value.map(item => item.id));
  items.value = [
    ...items.value,
    ...result.corrections.filter(item => !have.has(item.id)),
  ];
  total.value = result.total || total.value;
}

/**
 * Switch the status shown. Pressing the chosen one again keeps it.
 * @param next - The status pressed.
 */
function setStatus(next: unknown) {
  if (typeof next !== 'string' || !next || next === status.value) return;
  status.value = next as CorrectionStatus;
  corrections.chosen = null;
  items.value = [];
  state.value = 'loading';
  void reload();
}

/**
 * Choose a correction, or let go of it when it is chosen.
 * @param item - The correction.
 */
function choose(item: StoredCorrection) {
  error.value = '';
  corrections.chosen = chosenId.value === item.id ? null : item;
}

/** Sign links for the chosen correction's photos. */
watch(
  () => corrections.chosen?.photoPaths.join('\n') ?? '',
  async () => {
    const chosen = corrections.chosen;
    const missing = (chosen?.photoPaths ?? []).filter(
      path => !urls.value[path]
    );
    if (missing.length === 0) return;
    urls.value = { ...urls.value, ...(await photoUrls(missing)) };
  },
  { immediate: true }
);

/** The review note follows the chosen correction. */
watch(chosenId, () => {
  reviewNote.value = corrections.chosen?.reviewNote ?? '';
});

/**
 * Approve or reject the chosen correction, or set it back to submitted.
 * @param next - The new status.
 */
async function review(next: CorrectionStatus) {
  const chosen = corrections.chosen;
  if (!chosen || busy.value) return;
  busy.value = true;
  error.value = '';
  const failed = await reviewCorrection(
    chosen.id,
    next,
    next === 'submitted' ? null : reviewNote.value.trim() || null
  );
  busy.value = false;
  if (failed) {
    error.value = failed;
    return;
  }
  corrections.chosen = null;
  corrections.changed();
}

/**
 * Upload photos to the chosen correction.
 * @param files - The chosen files.
 */
async function addPhotos(files: File[]) {
  const chosen = corrections.chosen;
  if (!chosen || busy.value) return;
  busy.value = true;
  error.value = '';
  const room = CORRECTION_PHOTO_MAX - chosen.photoPaths.length;
  const results = await Promise.all(
    files.slice(0, room).map(file => uploadCorrectionPhoto(chosen.id, file))
  );
  const added = results.flatMap(result =>
    'path' in result ? [result.path] : []
  );
  const problem = results.find(result => 'error' in result);
  const paths = [...new Set([...chosen.photoPaths, ...added])];
  const failed =
    added.length > 0 ? await setCorrectionPhotos(chosen.id, paths) : null;
  busy.value = false;
  if (failed || problem) {
    error.value =
      failed ?? (problem && 'error' in problem ? problem.error : '');
  }
  if (!failed && added.length > 0) corrections.changed();
}

/**
 * Remove a photo from the chosen correction, and its stored object.
 * @param path - Its object path.
 */
async function removePhoto(path: string) {
  const chosen = corrections.chosen;
  if (!chosen || busy.value) return;
  busy.value = true;
  error.value = '';
  const failed = await setCorrectionPhotos(
    chosen.id,
    chosen.photoPaths.filter(item => item !== path)
  );
  busy.value = false;
  if (failed) {
    error.value = failed;
    return;
  }
  await removeCorrectionPhotoObjects([path]);
  corrections.changed();
}

onMounted(reload);
watch(
  () => corrections.version,
  () => void reload()
);
onBeforeUnmount(() => {
  corrections.chosen = null;
});
</script>

<template>
  <div class="queue">
    <SegmentedControl
      :model-value="status"
      type="single"
      variant="outline"
      size="sm"
      aria-label="Review status"
      @update:model-value="setStatus"
    >
      <SegmentedControlItem
        v-for="item in STATUSES"
        :key="item.id"
        :value="item.id"
      >
        {{ item.label }}
      </SegmentedControlItem>
    </SegmentedControl>

    <p v-if="state === 'loading'" class="queue-status">Loading corrections.</p>
    <p v-else-if="state === 'error'" class="queue-status" role="alert">
      The corrections could not be loaded.
    </p>
    <p v-else-if="total === 0" class="queue-status">
      No correction is {{ status }}.
    </p>
    <template v-else>
      <p class="queue-count">{{ countText }}</p>
      <ul class="queue-list" aria-label="Corrections">
        <li
          v-for="item in items"
          :key="item.id"
          :data-correction-id="item.id"
          class="correction-entry"
          :class="{ 'is-chosen': chosenId === item.id }"
        >
          <button
            type="button"
            class="correction-summary"
            :aria-expanded="chosenId === item.id"
            @click="choose(item)"
          >
            <span class="correction-title">{{ layerTitle(item.layerId) }}</span>
            <span class="correction-line">{{ actionText(item) }}</span>
            <span class="correction-line">{{ yearsText(item.years) }}</span>
            <span v-if="item.note" class="correction-note">
              {{ item.note }}
            </span>
            <span class="correction-date">
              Submitted {{ day(item.createdAt) }}
              <template v-if="item.reviewedAt">
                · {{ item.status === 'approved' ? 'Approved' : 'Rejected' }}
                {{ day(item.reviewedAt) }}
              </template>
            </span>
          </button>

          <div v-if="chosenId === item.id" class="correction-detail">
            <div class="correction-field">
              <span class="correction-label">Photos</span>
              <CorrectionPhotosField
                :photos="chosenPhotos"
                :busy="busy"
                @add="addPhotos"
                @remove="removePhoto"
              />
            </div>
            <label
              v-if="item.status === 'submitted'"
              class="correction-field"
              :for="`${uid}-review-note`"
            >
              <span class="correction-label">Review note</span>
              <textarea
                :id="`${uid}-review-note`"
                v-model="reviewNote"
                class="correction-input"
                name="review-note"
                rows="2"
                placeholder="What you checked"
                :maxlength="REVIEW_NOTE_MAX"
              />
            </label>
            <p v-else-if="item.reviewNote" class="correction-line">
              {{ item.reviewNote }}
            </p>
            <p v-if="error" class="correction-error" role="alert">
              {{ error }}
            </p>
            <div class="correction-actions">
              <template v-if="item.status === 'submitted'">
                <button
                  type="button"
                  class="map-control"
                  :disabled="busy"
                  @click="review('approved')"
                >
                  Approve
                </button>
                <button
                  type="button"
                  class="map-control"
                  :disabled="busy"
                  @click="review('rejected')"
                >
                  Reject
                </button>
              </template>
              <button
                v-else
                type="button"
                class="map-control"
                :disabled="busy"
                @click="review('submitted')"
              >
                Back to submitted
              </button>
            </div>
          </div>
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

.correction-entry {
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--map-control-radius);
  background: var(--background);
}

.correction-entry.is-chosen {
  border-color: var(--foreground);
}

.correction-summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  margin: 0;
  padding: 12px;
  border: 0;
  border-radius: var(--map-control-radius);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.correction-summary:hover,
.is-chosen .correction-summary {
  background: var(--accent);
}

.correction-summary:focus-visible {
  outline: 2px solid var(--foreground);
  outline-offset: 2px;
}

.correction-title {
  font-size: 14px;
  font-weight: 600;
}

.correction-line {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
}

.correction-note {
  display: -webkit-box;
  overflow: hidden;
  font-size: 13px;
  line-height: 1.4;
  color: var(--muted-foreground);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.is-chosen .correction-note {
  display: block;
}

.correction-date {
  font-size: 12px;
  color: var(--muted-foreground);
}

.correction-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px;
  border-top: 1px solid var(--border);
}

.correction-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.correction-label {
  font-size: 13px;
  font-weight: 500;
}

.correction-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
  color: var(--foreground);
  font: inherit;
  font-size: 14px;
  resize: vertical;
}

.correction-input:focus-visible {
  outline: 2px solid var(--foreground);
  outline-offset: 2px;
}

.correction-error {
  margin: 0;
  font-size: 13px;
  color: var(--destructive, #b42318);
}

.correction-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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
