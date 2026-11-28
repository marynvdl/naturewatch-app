<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import { Button } from '@/components/ui/button';
import { formatAreaTag } from '@/places/display';
import {
  approveBoundary,
  loadProposedBoundary,
  readBoundaryFile,
  rejectBoundary,
  submitBoundary,
  type BoundaryShape,
  type ProposedBoundary,
} from '@/places/replacementBoundary';
import useAuthStore from '@/store/AuthStore';
import usePlacesStore from '@/store/PlacesStore';

/**
 * The end of the Boundary section, in Edit mode: Replace boundary takes a
 * GeoJSON file, which the map outlines, and Submit stores it as a proposed
 * version. A proposed version shows with Approve and Discard.
 */
const props = defineProps<{
  placeId: string;
}>();

const emit = defineEmits<{
  /** A proposed boundary was approved, so the current boundary changed. */
  approved: [];
}>();

const auth = useAuthStore();
const placesStore = usePlacesStore();
const uid = useId();

const state = ref<'loading' | 'ok' | 'error' | 'off'>('loading');
const proposed = ref<ProposedBoundary | null>(null);
/** The shape read from the chosen file, before it is submitted. */
const picked = ref<BoundaryShape | null>(null);
const sourceUrl = ref('');
const busy = ref(false);
const error = ref('');
const approved = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
let request = 0;

/** The shape the map outlines. */
const shown = computed(
  () => picked.value?.shape ?? proposed.value?.shape ?? null
);
watch(shown, shape => {
  placesStore.boundaryPreview = shape;
});
onBeforeUnmount(() => {
  placesStore.boundaryPreview = null;
});

/**
 * A shape's area and point count, such as "412 km², 8,214 points".
 * @param areaKm2 - Area in square kilometres.
 * @param points - Point count.
 */
function sizeText(areaKm2: number, points: number): string {
  return `${formatAreaTag(areaKm2)} km², ${points.toLocaleString('en-GB')} points`;
}

/** When and by whom the proposed boundary was uploaded. */
const uploadedText = computed(() => {
  const current = proposed.value;
  if (!current) return '';
  const day = new Date(current.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const who = !current.submittedBy
    ? ''
    : current.submittedBy === auth.session?.user.id
      ? ', by you'
      : ', by another admin';
  return `Uploaded ${day}${who}.`;
});

/** Read the place's proposed boundary. */
async function load() {
  const current = ++request;
  const result = await loadProposedBoundary(props.placeId);
  if (current !== request) return;
  if (result.status === 'unconfigured') {
    state.value = 'off';
    return;
  }
  if (result.status === 'error') {
    state.value = 'error';
    return;
  }
  proposed.value = result.proposed;
  state.value = 'ok';
}

watch(
  () => props.placeId,
  () => {
    state.value = 'loading';
    proposed.value = null;
    picked.value = null;
    sourceUrl.value = '';
    error.value = '';
    approved.value = false;
    void load();
  },
  { immediate: true }
);

/** Open the file picker. */
function choose() {
  error.value = '';
  fileInput.value?.click();
}

/**
 * Read the chosen file and outline its shape.
 * @param event - The file input's change.
 */
async function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  error.value = '';
  const result = await readBoundaryFile(file);
  if (!result.ok) {
    error.value = result.message;
    return;
  }
  const { shape, points, areaKm2 } = result;
  picked.value = { shape, points, areaKm2 };
  approved.value = false;
}

/** Drop the chosen file. */
function cancel() {
  picked.value = null;
  sourceUrl.value = '';
  error.value = '';
}

/** Store the chosen shape as the proposed boundary. */
async function submit() {
  if (!picked.value) return;
  busy.value = true;
  error.value = '';
  const message = await submitBoundary(
    props.placeId,
    picked.value.shape,
    sourceUrl.value.trim() || null
  );
  if (message) {
    busy.value = false;
    error.value = message;
    return;
  }
  picked.value = null;
  sourceUrl.value = '';
  await load();
  busy.value = false;
}

/**
 * Approve or discard the proposed boundary.
 * @param decision - Which.
 */
async function decide(decision: 'approve' | 'discard') {
  const id = proposed.value?.boundaryId;
  if (!id) return;
  busy.value = true;
  error.value = '';
  const message = await (decision === 'approve'
    ? approveBoundary(id)
    : rejectBoundary(id));
  if (message) {
    busy.value = false;
    error.value = message;
    return;
  }
  await load();
  busy.value = false;
  if (decision === 'approve') {
    approved.value = true;
    placesStore.adminListVersion += 1;
    emit('approved');
  }
}
</script>

<template>
  <div v-if="state === 'ok' || state === 'error'" class="boundary-upload">
    <p v-if="proposed || picked" class="upload-heading">
      {{ proposed ? 'Proposed boundary' : 'New boundary' }}
    </p>
    <p v-if="state === 'error'" class="upload-error" role="alert">
      The proposed boundary could not be read.
    </p>
    <template v-else-if="proposed">
      <p class="upload-help">
        {{ sizeText(proposed.areaKm2, proposed.points) }}. {{ uploadedText }}
      </p>
      <p v-if="proposed.sourceUrl" class="upload-help">
        <a
          :href="proposed.sourceUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="upload-link"
        >
          Source
        </a>
      </p>
      <p v-if="error" class="upload-error" role="alert">{{ error }}</p>
      <div class="upload-actions">
        <Button
          type="button"
          size="sm"
          :disabled="busy"
          @click="decide('approve')"
        >
          Approve
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          :disabled="busy"
          @click="decide('discard')"
        >
          Discard
        </Button>
      </div>
    </template>
    <template v-else-if="picked">
      <p class="upload-help">
        {{ sizeText(picked.areaKm2, picked.points) }}, outlined on the map.
      </p>
      <label class="upload-field" :for="`${uid}-source`">
        <span class="upload-label">Source link (optional)</span>
        <input
          :id="`${uid}-source`"
          v-model="sourceUrl"
          class="upload-input"
          name="boundary-source"
          type="url"
          maxlength="1000"
        />
      </label>
      <p v-if="error" class="upload-error" role="alert">{{ error }}</p>
      <div class="upload-actions">
        <Button type="button" size="sm" :disabled="busy" @click="submit">
          Submit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          :disabled="busy"
          @click="cancel"
        >
          Cancel
        </Button>
      </div>
    </template>
    <template v-else>
      <p v-if="approved" class="upload-help">
        Approved. The map shows the old boundary until the tiles are rebuilt.
      </p>
      <p v-else class="upload-help">
        A GeoJSON polygon in longitude and latitude, of at most 100,000 points.
      </p>
      <p v-if="error" class="upload-error" role="alert">{{ error }}</p>
      <div class="upload-actions">
        <Button type="button" size="sm" variant="outline" @click="choose">
          Replace boundary
        </Button>
      </div>
    </template>
    <input
      ref="fileInput"
      class="upload-file"
      type="file"
      accept=".geojson,.json,application/geo+json,application/json"
      aria-hidden="true"
      tabindex="-1"
      @change="onFile"
    />
  </div>
</template>

<style scoped>
.boundary-upload {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.upload-heading {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--foreground);
}

.upload-help {
  margin: 0;
}

.upload-help,
.upload-label {
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted-foreground);
}

.upload-link {
  color: inherit;
  text-decoration: underline;
}

.upload-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.upload-input {
  width: 100%;
  min-height: 36px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
  color: var(--foreground);
  font: inherit;
  font-size: 14px;
}

.upload-input:focus-visible {
  outline: 2px solid var(--foreground, #24312c);
  outline-offset: 2px;
}

.upload-error {
  margin: 0;
  font-size: 12px;
  color: var(--destructive, #b42318);
}

.upload-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.upload-file {
  display: none;
}
</style>
