<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import { Button } from '@/components/ui/button';
import { formatAreaTag } from '@/places/display';
import {
  approveBoundary,
  checkEditedShape,
  EDIT_POINTS_MAX,
  loadCurrentBoundary,
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
 * GeoJSON file, which the map outlines, and Edit on map opens the current
 * boundary in the map's draw tool. Submit stores either as a proposed
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
/** The current boundary being edited on the map, or null. */
const editing = ref<{ boundaryId: string } | null>(null);
/** Why Edit on map did not open. */
const editNote = ref('');
let request = 0;

/** The edited shape, checked, with its size. */
const edited = computed(() => {
  const shape = placesStore.boundaryEdited;
  return editing.value && shape ? checkEditedShape(shape) : null;
});

/** The shape the map outlines. The draw tool shows the edited one. */
const shown = computed(() =>
  editing.value ? null : (picked.value?.shape ?? proposed.value?.shape ?? null)
);
watch(shown, shape => {
  placesStore.boundaryPreview = shape;
});
onBeforeUnmount(() => {
  placesStore.boundaryPreview = null;
  placesStore.boundaryEdit = null;
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
  return `${current.derivedFrom ? 'Edited' : 'Uploaded'} ${day}${who}.`;
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
    editNote.value = '';
    endEdit();
    void load();
  },
  { immediate: true }
);

/** Open the file picker. */
function choose() {
  error.value = '';
  editNote.value = '';
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

/** Open the current boundary in the map's draw tool. */
async function startEdit() {
  error.value = '';
  editNote.value = '';
  busy.value = true;
  const place = props.placeId;
  const result = await loadCurrentBoundary(place);
  busy.value = false;
  if (place !== props.placeId) return;
  if (result.status !== 'ok') {
    error.value = 'The boundary could not be read.';
    return;
  }
  const current = result.current;
  if (!current) {
    error.value = 'This place has no current boundary.';
    return;
  }
  if (!current.shape) {
    editNote.value = `This boundary has ${current.points.toLocaleString('en-GB')} points. Edit on map takes at most ${EDIT_POINTS_MAX.toLocaleString('en-GB')}. Use Replace boundary instead.`;
    return;
  }
  approved.value = false;
  editing.value = { boundaryId: current.boundaryId };
  placesStore.boundaryEdit = current.shape;
}

/** Close the draw tool, dropping the changes. */
function endEdit() {
  editing.value = null;
  placesStore.boundaryEdit = null;
}

/** Delete the points selected in the draw tool. */
function deletePoints() {
  placesStore.boundaryEditTrash += 1;
}

/** Drop the chosen file or the edit. */
function cancel() {
  endEdit();
  picked.value = null;
  sourceUrl.value = '';
  error.value = '';
}

/** Store the chosen or edited shape as the proposed boundary. */
async function submit() {
  const edit = editing.value;
  let shape = picked.value?.shape ?? null;
  if (edit) {
    const result = edited.value;
    if (!result) return;
    if (!result.ok) {
      error.value = result.message;
      return;
    }
    shape = result.shape;
  }
  if (!shape) return;
  busy.value = true;
  error.value = '';
  const message = await submitBoundary(
    props.placeId,
    shape,
    sourceUrl.value.trim() || null,
    edit?.boundaryId ?? null
  );
  if (message) {
    busy.value = false;
    error.value = message;
    return;
  }
  endEdit();
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
    <p v-if="proposed || picked || editing" class="upload-heading">
      {{
        proposed
          ? 'Proposed boundary'
          : editing
            ? 'Editing boundary'
            : 'New boundary'
      }}
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
    <template v-else-if="picked || editing">
      <p v-if="editing" class="upload-help">
        Drag a point to move it, or a midpoint to add one. Select points and
        choose Delete point, or press Delete, to remove them.
      </p>
      <p v-if="editing && edited?.ok" class="upload-help">
        {{ sizeText(edited.areaKm2, edited.points) }}.
      </p>
      <p v-else-if="picked" class="upload-help">
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
        <Button
          v-if="editing"
          type="button"
          size="sm"
          variant="outline"
          :disabled="busy"
          @click="deletePoints"
        >
          Delete point
        </Button>
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
      <p v-if="editNote" class="upload-help">{{ editNote }}</p>
      <p v-if="error" class="upload-error" role="alert">{{ error }}</p>
      <div class="upload-actions">
        <Button type="button" size="sm" variant="outline" @click="choose">
          Replace boundary
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          :disabled="busy"
          @click="startEdit"
        >
          Edit on map
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
