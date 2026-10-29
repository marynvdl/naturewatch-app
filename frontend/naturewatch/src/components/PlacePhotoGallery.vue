<script setup lang="ts">
import { computed } from 'vue';
import { ChevronLeft, ChevronRight, X } from '@lucide/vue';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { stepPhoto, type PlacePhoto } from '@/places/photos';

const props = defineProps<{
  photos: PlacePhoto[];
  /** Shown above the photographs. */
  placeName?: string;
}>();

const open = defineModel<boolean>('open', { required: true });
const index = defineModel<number>('index', { default: 0 });

const count = computed(() => props.photos.length);
const photo = computed(
  () => props.photos[Math.min(index.value, count.value - 1)] ?? null
);
const position = computed(() => `${index.value + 1} of ${count.value}`);

/**
 * Move through the set.
 * @param step - 1 for next, -1 for previous.
 */
function go(step: number) {
  index.value = stepPhoto(index.value, step, count.value);
}

/** Previous and next from the arrow keys. */
function onKey(event: KeyboardEvent) {
  const step =
    event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!step || count.value < 2) return;
  event.preventDefault();
  go(step);
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="gallery-overlay" />
      <DialogContent
        class="gallery nw"
        @keydown="onKey"
        @close-auto-focus.prevent
      >
        <header class="gallery-head">
          <p v-if="count > 1" class="gallery-count" aria-live="polite">
            {{ position }}
          </p>
          <DialogTitle class="gallery-title">
            {{ placeName ? `Photographs of ${placeName}` : 'Photographs' }}
          </DialogTitle>
          <DialogClose
            class="gallery-close map-control map-icon"
            aria-label="Close photographs"
          >
            <X aria-hidden="true" />
          </DialogClose>
        </header>
        <DialogDescription class="gallery-sr">
          Approved photographs, with the photographer, the source, and the
          licence of each. The arrow keys move between them.
        </DialogDescription>

        <div v-if="photo" class="gallery-stage">
          <button
            v-if="count > 1"
            type="button"
            class="gallery-step map-control map-icon"
            aria-label="Previous photograph"
            @click="go(-1)"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <div class="gallery-frame">
            <img
              :key="photo.src"
              class="gallery-image"
              :src="photo.src"
              :alt="photo.alt"
            />
          </div>
          <button
            v-if="count > 1"
            type="button"
            class="gallery-step map-control map-icon"
            aria-label="Next photograph"
            @click="go(1)"
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>

        <div v-if="photo" class="gallery-caption">
          <p v-if="photo.title" class="gallery-photo-title">
            {{ photo.title }}
          </p>
          <p class="gallery-credit">
            <span>Photo: {{ photo.photographer }}</span>
            <span class="gallery-dot" aria-hidden="true">·</span>
            <a
              v-if="photo.source.url"
              :href="photo.source.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ photo.source.name }}
            </a>
            <span v-else>{{ photo.source.name }}</span>
            <span class="gallery-dot" aria-hidden="true">·</span>
            <a
              v-if="photo.licence.url"
              :href="photo.licence.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ photo.licence.name }}
            </a>
            <span v-else>{{ photo.licence.name }}</span>
          </p>
        </div>

        <div v-if="count > 1" class="gallery-strip">
          <button
            v-for="(item, itemIndex) in photos"
            :key="item.src"
            type="button"
            class="gallery-thumb"
            :class="{ 'is-on': itemIndex === index }"
            :aria-label="`Photograph ${itemIndex + 1}`"
            :aria-current="itemIndex === index ? 'true' : undefined"
            @click="index = itemIndex"
          >
            <img :src="item.thumbnail ?? item.src" alt="" />
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.gallery-overlay {
  position: fixed;
  inset: 0;
  z-index: 1500;
  background: var(--background);
}

.gallery {
  position: fixed;
  inset: 0;
  z-index: 1501;
  display: flex;
  flex-direction: column;
  background: var(--background);
}

.gallery:focus-visible {
  outline: none;
}

.gallery-head {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  height: 60px;
  padding: 0 72px;
  border-bottom: 1px solid var(--border);
}

.gallery-count {
  position: absolute;
  top: 50%;
  left: 24px;
  margin: 0;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  color: var(--muted-foreground);
  transform: translateY(-50%);
}

.gallery-title {
  overflow: hidden;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gallery-close {
  position: absolute;
  top: 12px;
  right: 12px;
}

.gallery-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.gallery-stage {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 16px;
  min-height: 0;
  padding: 24px;
}

.gallery-frame {
  position: relative;
  flex: 1 1 auto;
  align-self: stretch;
  min-width: 0;
}

.gallery-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.gallery-step {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 50%;
}

.gallery-step svg {
  width: 20px;
  height: 20px;
}

.gallery-caption {
  flex: none;
  padding: 0 24px;
  text-align: center;
}

.gallery-photo-title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 500;
}

.gallery-credit {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted-foreground);
}

.gallery-dot {
  margin: 0 6px;
}

.gallery-credit a {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.gallery-strip {
  display: flex;
  flex: none;
  justify-content: safe center;
  gap: 8px;
  overflow-x: auto;
  padding: 16px 24px 20px;
  scrollbar-width: thin;
}

.gallery-thumb {
  flex: none;
  width: 64px;
  height: 48px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--muted, #eef0ee);
  opacity: 0.6;
}

.gallery-thumb.is-on {
  outline: 2px solid var(--foreground);
  outline-offset: 2px;
  opacity: 1;
}

.gallery-thumb:hover {
  opacity: 1;
}

.gallery-thumb:focus-visible {
  outline: 2px solid var(--foreground);
  outline-offset: 2px;
}

.gallery-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

@media (max-width: 720px) {
  .gallery-head {
    padding: 0 60px;
  }

  .gallery-count {
    left: 16px;
  }

  .gallery-stage {
    gap: 8px;
    padding: 16px 12px;
  }

  .gallery-step {
    width: 36px;
    height: 36px;
  }

  .gallery-caption {
    padding: 0 16px;
  }

  .gallery-strip {
    padding: 12px 16px 16px;
  }
}
</style>
