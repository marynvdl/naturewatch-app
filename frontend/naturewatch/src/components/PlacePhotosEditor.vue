<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ChevronDown, ChevronUp, Plus } from '@lucide/vue';
import EditDialog from '@/components/EditDialog.vue';
import { Button } from '@/components/ui/button';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/ui/segmented-control';
import {
  CAPTION_MAX,
  COMMONS_THUMB_WIDTH,
  IMAGE_TYPES,
  commonsFileTitle,
  commonsFileUrl,
  fetchCommonsFile,
  licenceShortName,
  type CommonsFile,
} from '@/places/commons';
import {
  AREA_IMAGE_LIMIT,
  addPlaceImage,
  byGallery,
  linkPlaceImage,
  loadImageLicences,
  loadPlaceImages,
  loadBorrowedImages,
  orderPlaceImages,
  setPlaceImage,
  uploadPlaceImage,
  uploadProblem,
  type ImageLicence,
  type ImageWriteResult,
  type PlaceImage,
  type PlaceImageStatus,
  type ImageGroup,
} from '@/places/images';

const props = defineProps<{ placeId: string }>();

const emit = defineEmits<{
  /** A photograph was added, reviewed, or moved. */
  changed: [];
}>();

/** Wait this long after typing a Commons URL before reading it. */
const COMMONS_DELAY_MS = 400;
/** Longest alt text the database stores. */
const ALT_MAX = 300;

const GROUPS: { status: PlaceImageStatus; label: string }[] = [
  { status: 'approved', label: 'Approved' },
  { status: 'suggested', label: 'Suggested' },
  { status: 'rejected', label: 'Rejected' },
];

const images = ref<PlaceImage[]>([]);
/** Photographs of related places this place can use too. */
const borrowed = ref<{
  fromRecognitions: ImageGroup[];
  fromAreas: ImageGroup[];
  areasTotal: number;
}>(noneBorrowed());
const status = ref<'loading' | 'ok' | 'error'>('loading');
/** The photograph being saved, so its buttons are disabled. */
const busyId = ref<string | null>(null);
const imageError = ref<{ id: string; message: string } | null>(null);

/** The add form's dialog is open. */
const addOpen = ref(false);
const addMode = ref<'upload' | 'commons'>('commons');
const commonsUrl = ref('');
const commonsFile = ref<CommonsFile | null>(null);
const commonsStatus = ref<'idle' | 'loading' | 'ok' | 'error'>('idle');
const commonsMessage = ref('');
const file = ref<File | null>(null);
const filePreview = ref('');
const creator = ref('');
const licenceId = ref('');
const licences = ref<ImageLicence[]>([]);
const altText = ref('');
const caption = ref('');
const adding = ref(false);
const addError = ref('');
let commonsTimer: ReturnType<typeof setTimeout> | undefined;
let commonsAbort: AbortController | null = null;

const grouped = computed(() =>
  GROUPS.map(group => ({
    ...group,
    images: images.value
      .filter(image => image.status === group.status)
      .sort(byGallery),
  })).filter(group => group.images.length > 0)
);
/** Approved photographs after the main one, in gallery order. */
const gallery = computed(() =>
  images.value
    .filter(image => image.status === 'approved' && !image.isPrimary)
    .sort(byGallery)
);
const canAdd = computed(() => {
  if (adding.value || !altText.value.trim()) return false;
  if (addMode.value === 'commons') return commonsFile.value !== null;
  return file.value !== null && !!creator.value.trim() && !!licenceId.value;
});

/** Nothing borrowed yet. */
function noneBorrowed() {
  return { fromRecognitions: [], fromAreas: [], areasTotal: 0 };
}

/** The sections of photographs from related places, in order. */
const borrowedSections = computed(() =>
  [
    {
      id: 'recognitions',
      label: 'From recognitions',
      groups: borrowed.value.fromRecognitions,
      note: '',
    },
    {
      id: 'areas',
      label: 'From conservation areas',
      groups: borrowed.value.fromAreas,
      note:
        borrowed.value.areasTotal > AREA_IMAGE_LIMIT
          ? `The first ${AREA_IMAGE_LIMIT} of ${borrowed.value.areasTotal.toLocaleString('en-GB')} photographs.`
          : '',
    },
  ].filter(section => section.groups.length > 0)
);

/** Read the place's photographs and those of related places. */
async function load() {
  const id = props.placeId;
  const [own, fromRelated] = await Promise.all([
    loadPlaceImages(id),
    loadBorrowedImages(id),
  ]);
  if (id !== props.placeId) return;
  if (own.status !== 'ok') {
    status.value = 'error';
    return;
  }
  images.value = own.images;
  borrowed.value = fromRelated.status === 'ok' ? fromRelated : noneBorrowed();
  status.value = 'ok';
}

watch(
  () => props.placeId,
  () => {
    status.value = 'loading';
    images.value = [];
    borrowed.value = noneBorrowed();
    imageError.value = null;
    addOpen.value = false;
    resetForm();
    void load();
  },
  { immediate: true }
);

/** The message for a failed write. */
function messageOf(result: ImageWriteResult): string | null {
  if (result.status === 'ok') return null;
  return result.status === 'error'
    ? result.message
    : 'The place store is not configured.';
}

/** Run one write for a photograph, then read the photographs again. */
async function change(imageId: string, run: () => Promise<ImageWriteResult>) {
  busyId.value = imageId;
  imageError.value = null;
  const message = messageOf(await run());
  busyId.value = null;
  if (message) {
    imageError.value = { id: imageId, message };
    return;
  }
  await load();
  emit('changed');
}

/**
 * Approve or reject a photograph.
 * @param image - The photograph.
 * @param next - The new status.
 */
function review(image: PlaceImage, next: 'approved' | 'rejected') {
  return change(image.imageId, () =>
    setPlaceImage(props.placeId, image.imageId, { status: next })
  );
}

/**
 * Make a photograph the main one.
 * @param image - An approved photograph.
 */
function makeMain(image: PlaceImage) {
  return change(image.imageId, () =>
    setPlaceImage(props.placeId, image.imageId, { is_primary: true })
  );
}

/** Swap a photograph with its neighbour in the gallery after the main one. */
function move(image: PlaceImage, step: -1 | 1) {
  const order = gallery.value.map(item => item.imageId);
  const from = order.indexOf(image.imageId);
  const to = from + step;
  if (from < 0 || to < 0 || to >= order.length) return;
  [order[from], order[to]] = [order[to], order[from]];
  const main = images.value.find(
    item => item.status === 'approved' && item.isPrimary
  );
  const ids = main ? [main.imageId, ...order] : order;
  return change(image.imageId, () => orderPlaceImages(props.placeId, ids));
}

/**
 * Link a recognition's photograph to this place.
 * @param image - The recognition's photograph.
 */
function useHere(image: PlaceImage) {
  return change(image.imageId, () =>
    linkPlaceImage(props.placeId, image.imageId)
  );
}

/** A credit line for a photograph. */
function credit(image: PlaceImage): string {
  return [image.creator, licenceShortName(image.licenceId), image.sourceTitle]
    .filter(Boolean)
    .join(' · ');
}

/** Read a Commons URL a short while after typing stops. */
function onCommonsUrl(text: string) {
  commonsUrl.value = text;
  commonsFile.value = null;
  commonsMessage.value = '';
  clearTimeout(commonsTimer);
  commonsAbort?.abort();
  if (!text.trim()) {
    commonsStatus.value = 'idle';
    return;
  }
  const title = commonsFileTitle(text);
  if (!title) {
    commonsStatus.value = 'error';
    commonsMessage.value = 'This is not a Wikimedia Commons file address.';
    return;
  }
  commonsStatus.value = 'loading';
  commonsTimer = setTimeout(async () => {
    const abort = new AbortController();
    commonsAbort = abort;
    const read = await fetchCommonsFile(title, abort.signal);
    if (abort.signal.aborted) return;
    if (read.status !== 'ok') {
      commonsStatus.value = 'error';
      commonsMessage.value = read.message;
      return;
    }
    commonsFile.value = read.file;
    commonsStatus.value = 'ok';
    if (!caption.value.trim()) caption.value = read.file.caption;
  }, COMMONS_DELAY_MS);
}

/** A file was chosen for upload. */
function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const chosen = input.files?.[0] ?? null;
  if (filePreview.value) URL.revokeObjectURL(filePreview.value);
  filePreview.value = '';
  file.value = null;
  addError.value = '';
  if (!chosen) return;
  const problem = uploadProblem(chosen);
  if (problem) {
    addError.value = problem;
    input.value = '';
    return;
  }
  file.value = chosen;
  filePreview.value = URL.createObjectURL(chosen);
}

/** Empty the add form and cancel a Commons read in flight. */
function resetForm() {
  clearTimeout(commonsTimer);
  commonsAbort?.abort();
  commonsUrl.value = '';
  commonsFile.value = null;
  commonsStatus.value = 'idle';
  commonsMessage.value = '';
  if (filePreview.value) URL.revokeObjectURL(filePreview.value);
  filePreview.value = '';
  file.value = null;
  creator.value = '';
  licenceId.value = '';
  altText.value = '';
  caption.value = '';
  addError.value = '';
}

/** Store the photograph as approved, then close the dialog. */
async function add() {
  if (!canAdd.value) return;
  adding.value = true;
  addError.value = '';
  const text = {
    alt_text: altText.value.trim(),
    caption: caption.value.trim() || undefined,
  };
  let result: ImageWriteResult;
  if (addMode.value === 'commons' && commonsFile.value) {
    const found = commonsFile.value;
    result = await addPlaceImage(props.placeId, {
      external_url: found.fileUrl,
      source_id: 'wikimedia-commons',
      source_record_id: found.title,
      source_url: found.pageUrl,
      creator_name: found.creator,
      licence_id: found.licenceId,
      width: found.width,
      height: found.height,
      ...text,
    });
  } else if (file.value) {
    const stored = await uploadPlaceImage(file.value);
    result =
      stored.status === 'ok'
        ? await addPlaceImage(props.placeId, {
            storage_path: stored.storagePath,
            source_id: 'sooty-earth-contributors',
            creator_name: creator.value.trim(),
            licence_id: licenceId.value,
            sha256: stored.sha256,
            width: stored.width,
            height: stored.height,
            ...text,
          })
        : stored;
  } else {
    result = { status: 'error', message: 'Choose a photograph first.' };
  }
  adding.value = false;
  const message = messageOf(result);
  if (message) {
    addError.value = message;
    return;
  }
  addOpen.value = false;
  await load();
  emit('changed');
}

/** Opening the dialog reads the licences once. Closing it empties the form. */
watch(addOpen, async open => {
  if (!open) {
    resetForm();
    return;
  }
  if (licences.value.length) return;
  const read = await loadImageLicences();
  if (read.status === 'ok') licences.value = read.licences;
});

onBeforeUnmount(() => {
  clearTimeout(commonsTimer);
  commonsAbort?.abort();
  if (filePreview.value) URL.revokeObjectURL(filePreview.value);
});
</script>

<template>
  <div class="photos">
    <div class="photos-bar">
      <Button
        type="button"
        size="sm"
        variant="outline"
        class="photos-open"
        @click="addOpen = true"
      >
        Add
        <Plus :size="14" :stroke-width="2.25" aria-hidden="true" />
      </Button>
      <EditDialog
        v-model:open="addOpen"
        title="Add a photograph"
        description="Add a photograph from Wikimedia Commons, or upload one, with its alt text and an optional caption."
        :submit-label="adding ? 'Adding' : 'Add'"
        :submit-disabled="!canAdd"
        :busy="adding"
        :error="addError"
        @submit="add"
      >
        <SegmentedControl
          v-model="addMode"
          type="single"
          variant="outline"
          size="sm"
          aria-label="Photograph from"
        >
          <SegmentedControlItem value="commons">
            Commons URL
          </SegmentedControlItem>
          <SegmentedControlItem value="upload">Upload</SegmentedControlItem>
        </SegmentedControl>

        <template v-if="addMode === 'commons'">
          <label class="photos-field" for="photo-commons">
            <span class="photos-label">Wikimedia Commons file address</span>
            <input
              id="photo-commons"
              :value="commonsUrl"
              class="photos-input"
              type="url"
              placeholder="https://commons.wikimedia.org/wiki/File:…"
              @input="onCommonsUrl(($event.target as HTMLInputElement).value)"
            />
          </label>
          <p v-if="commonsStatus === 'loading'" class="photos-note">
            Reading Commons.
          </p>
          <p
            v-else-if="commonsStatus === 'error'"
            class="photos-note is-error"
            role="alert"
          >
            {{ commonsMessage }}
          </p>
          <div
            v-else-if="commonsFile"
            class="photos-preview"
            data-preview="commons"
          >
            <img
              class="photos-thumb"
              :src="commonsFileUrl(commonsFile.title, COMMONS_THUMB_WIDTH)"
              alt=""
            />
            <p class="photos-note">
              {{ commonsFile.creator }} ·
              {{ licenceShortName(commonsFile.licenceId) }} ·
              {{ commonsFile.width }} × {{ commonsFile.height }}
            </p>
          </div>
        </template>

        <template v-else>
          <p class="photos-note">
            A photograph from another website: save it, then upload it here with
            its creator and licence.
          </p>
          <label class="photos-field" for="photo-file">
            <span class="photos-label">JPEG, PNG, or WebP, up to 10 MB</span>
            <input
              id="photo-file"
              class="photos-input photos-file"
              type="file"
              :accept="IMAGE_TYPES.join(',')"
              @change="onFile"
            />
          </label>
          <div v-if="filePreview" class="photos-preview">
            <img class="photos-thumb" :src="filePreview" alt="" />
            <p class="photos-note">Source: Sooty Earth contributors</p>
          </div>
          <label class="photos-field" for="photo-creator">
            <span class="photos-label">Creator</span>
            <input
              id="photo-creator"
              v-model="creator"
              class="photos-input"
              type="text"
            />
          </label>
          <label class="photos-field" for="photo-licence">
            <span class="photos-label">Licence</span>
            <select id="photo-licence" v-model="licenceId" class="photos-input">
              <option value="" disabled>Choose a licence</option>
              <option
                v-for="licence in licences"
                :key="licence.id"
                :value="licence.id"
              >
                {{ licence.title }}
              </option>
            </select>
          </label>
        </template>

        <label class="photos-field" for="photo-alt">
          <span class="photos-label">Alt text: what the photograph shows</span>
          <input
            id="photo-alt"
            v-model="altText"
            class="photos-input"
            type="text"
            required
            :maxlength="ALT_MAX"
          />
        </label>
        <label class="photos-field" for="photo-caption">
          <span class="photos-label">Caption (optional)</span>
          <textarea
            id="photo-caption"
            v-model="caption"
            class="photos-input photos-textarea"
            rows="2"
            :maxlength="CAPTION_MAX"
          />
        </label>
      </EditDialog>
    </div>

    <p v-if="status === 'loading'" class="place-note">Loading photographs.</p>
    <p v-else-if="status === 'error'" class="place-note">
      The photographs could not be loaded.
    </p>
    <template v-else>
      <p v-if="images.length === 0" class="place-note">No photographs yet.</p>
      <section
        v-for="group in grouped"
        :key="group.status"
        class="photos-group"
        :aria-label="group.label"
        :data-status="group.status"
      >
        <p class="map-section photos-heading">
          {{ group.label }} ({{ group.images.length.toLocaleString('en-GB') }})
        </p>
        <ul class="photos-list">
          <li
            v-for="image in group.images"
            :key="image.imageId"
            class="photos-item"
            :data-image="image.imageId"
          >
            <div
              v-if="image.status === 'approved' && !image.isPrimary"
              class="photos-order"
              role="group"
              aria-label="Order"
            >
              <button
                type="button"
                class="photos-order-button"
                aria-label="Move up"
                title="Move up"
                :disabled="
                  busyId === image.imageId || gallery.indexOf(image) === 0
                "
                @click="move(image, -1)"
              >
                <ChevronUp :size="14" :stroke-width="2.25" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="photos-order-button"
                aria-label="Move down"
                title="Move down"
                :disabled="
                  busyId === image.imageId ||
                  gallery.indexOf(image) === gallery.length - 1
                "
                @click="move(image, 1)"
              >
                <ChevronDown
                  :size="14"
                  :stroke-width="2.25"
                  aria-hidden="true"
                />
              </button>
            </div>
            <img
              class="photos-thumb"
              :src="image.thumbnail"
              :alt="image.altText"
              loading="lazy"
            />
            <div class="photos-text">
              <p v-if="image.isPrimary" class="photos-main">Main photograph</p>
              <p class="photos-caption">{{ image.caption ?? image.altText }}</p>
              <p class="photos-note">{{ credit(image) }}</p>
              <p v-if="image.suggestedByPipeline" class="photos-note">
                Suggested by {{ image.suggestedByPipeline }}
              </p>
              <p
                v-if="imageError?.id === image.imageId"
                class="photos-note is-error"
                role="alert"
              >
                {{ imageError.message }}
              </p>
              <div class="photos-actions">
                <template v-if="image.status === 'approved'">
                  <template v-if="!image.isPrimary">
                    <Button
                      type="button"
                      size="sm"
                      :disabled="busyId === image.imageId"
                      @click="makeMain(image)"
                    >
                      Make main
                    </Button>
                  </template>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    :disabled="busyId === image.imageId"
                    @click="review(image, 'rejected')"
                  >
                    Reject
                  </Button>
                </template>
                <template v-else>
                  <Button
                    type="button"
                    size="sm"
                    :disabled="busyId === image.imageId"
                    @click="review(image, 'approved')"
                  >
                    Approve
                  </Button>
                  <Button
                    v-if="image.status === 'suggested'"
                    type="button"
                    size="sm"
                    variant="outline"
                    :disabled="busyId === image.imageId"
                    @click="review(image, 'rejected')"
                  >
                    Reject
                  </Button>
                </template>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <section
        v-for="section in borrowedSections"
        :key="section.id"
        class="photos-group"
        :aria-label="section.label"
        :data-status="section.id"
      >
        <p class="map-section photos-heading">{{ section.label }}</p>
        <p v-if="section.note" class="photos-note">{{ section.note }}</p>
        <section
          v-for="group in section.groups"
          :key="group.placeId"
          class="photos-group"
          :aria-label="group.name"
        >
          <p class="photos-label">{{ group.name }}</p>
          <ul class="photos-list">
            <li
              v-for="image in group.images"
              :key="image.imageId"
              class="photos-item"
              :data-image="image.imageId"
            >
              <img
                class="photos-thumb"
                :src="image.thumbnail"
                :alt="image.altText"
                loading="lazy"
              />
              <div class="photos-text">
                <p class="photos-caption">
                  {{ image.caption ?? image.altText }}
                </p>
                <p class="photos-note">{{ credit(image) }}</p>
                <p
                  v-if="imageError?.id === image.imageId"
                  class="photos-note is-error"
                  role="alert"
                >
                  {{ imageError.message }}
                </p>
                <div class="photos-actions">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    :disabled="busyId === image.imageId"
                    @click="useHere(image)"
                  >
                    Use here
                  </Button>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </section>
    </template>
  </div>
</template>

<style scoped>
.photos {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.photos-bar {
  display: flex;
  justify-content: flex-end;
}

.photos-open {
  gap: 4px;
}

.photos-heading {
  margin: 0;
}

.photos-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.photos-label {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted-foreground);
}

.photos-input {
  width: 100%;
  min-width: 0;
  height: 36px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
  color: var(--foreground);
  font: inherit;
  font-size: 14px;
}

.photos-file {
  padding: 6px 10px;
  font-size: 12px;
}

.photos-textarea {
  height: auto;
  min-height: 56px;
  resize: vertical;
}

.photos-input:focus-visible {
  outline: 2px solid var(--foreground, #24312c);
  outline-offset: 2px;
}

.photos-preview {
  display: flex;
  align-items: center;
  gap: 12px;
}

.photos-preview .photos-thumb {
  width: 160px;
  height: 120px;
}

.photos-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.photos-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.photos-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--background);
}

.photos-thumb {
  flex: none;
  width: 80px;
  height: 60px;
  border-radius: 8px;
  background: #dfe3df;
  object-fit: cover;
}

.photos-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.photos-main {
  align-self: flex-start;
  margin: 0;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--foreground, #24312c);
  color: var(--background, #fff);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.6;
}

.photos-caption {
  margin: 0;
  font-size: 14px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.photos-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted-foreground);
  overflow-wrap: anywhere;
}

.photos-note.is-error {
  color: var(--destructive, #b42318);
}

/* Two small arrows stacked at the top right of a card. */
.photos-order {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.photos-order-button {
  display: grid;
  width: 24px;
  height: 20px;
  padding: 0;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--background);
  color: var(--foreground);
  cursor: pointer;
}

.photos-order-button:hover:not(:disabled) {
  background: var(--muted);
}

.photos-order-button:focus-visible {
  outline: 2px solid var(--foreground, #24312c);
  outline-offset: 1px;
}

.photos-order-button:disabled {
  opacity: 0.35;
  cursor: default;
}

/* Room for the arrows beside the text. */
.photos-order + .photos-thumb + .photos-text {
  padding-right: 24px;
}

.photos-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}
</style>
