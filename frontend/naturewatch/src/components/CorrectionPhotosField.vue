<script setup lang="ts">
import { computed, useId } from 'vue';
import { ImagePlus, X } from '@lucide/vue';
import { IMAGE_TYPES } from '@/places/commons';
import { CORRECTION_PHOTO_MAX } from '@/corrections/api';

/** One photo shown in the field. */
export interface CorrectionPhotoItem {
  /** Stable key: the object path, or a key for a file waiting to upload. */
  key: string;
  /** Where to show it from, or empty while it loads. */
  src: string;
}

/**
 * Photos of a correction: thumbnails with Remove, and Add photos while there
 * is room. The Flag form passes files waiting to upload, and the Corrections
 * list passes stored photos.
 */
const props = defineProps<{
  photos: CorrectionPhotoItem[];
  busy?: boolean;
}>();

const emit = defineEmits<{ add: [files: File[]]; remove: [key: string] }>();

const uid = useId();
const room = computed(() => CORRECTION_PHOTO_MAX - props.photos.length);

/**
 * Pass on the chosen files, as many as there is room for.
 * @param event - The input's change event.
 */
function onFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])].slice(0, Math.max(room.value, 0));
  input.value = '';
  if (files.length) emit('add', files);
}
</script>

<template>
  <div class="correction-photos">
    <ul v-if="photos.length" class="correction-photos-list">
      <li v-for="(photo, index) in photos" :key="photo.key">
        <img
          v-if="photo.src"
          class="correction-photos-thumb"
          :src="photo.src"
          :alt="`Photo ${index + 1}`"
        />
        <span v-else class="correction-photos-thumb is-empty" />
        <button
          type="button"
          class="correction-photos-remove"
          :aria-label="`Remove photo ${index + 1}`"
          title="Remove"
          :disabled="busy"
          @click="emit('remove', photo.key)"
        >
          <X :size="14" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <label
      v-if="room > 0"
      class="map-control correction-photos-add"
      :class="{ 'is-disabled': busy }"
      :for="`${uid}-photos`"
    >
      <ImagePlus :size="16" aria-hidden="true" />
      Add photos
      <input
        :id="`${uid}-photos`"
        class="correction-photos-input"
        type="file"
        name="photos"
        multiple
        :accept="IMAGE_TYPES.join(',')"
        :disabled="busy"
        @change="onFiles"
      />
    </label>
    <p class="correction-photos-help">
      JPEG, PNG, or WebP, up to 10 MB each. At most {{ CORRECTION_PHOTO_MAX }}.
    </p>
  </div>
</template>

<style scoped>
.correction-photos {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.correction-photos-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.correction-photos-list li {
  position: relative;
}

.correction-photos-thumb {
  display: block;
  width: 72px;
  height: 72px;
  border: 1px solid var(--border);
  border-radius: 8px;
  object-fit: cover;
}

.correction-photos-thumb.is-empty {
  background: var(--muted, #f1f3f2);
}

.correction-photos-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  display: grid;
  width: 22px;
  height: 22px;
  padding: 0;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--background);
  color: var(--foreground);
  cursor: pointer;
}

.correction-photos-add {
  position: relative;
  cursor: pointer;
}

.correction-photos-add.is-disabled {
  opacity: 0.5;
  pointer-events: none;
}

.correction-photos-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.correction-photos-help {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted-foreground);
}
</style>
