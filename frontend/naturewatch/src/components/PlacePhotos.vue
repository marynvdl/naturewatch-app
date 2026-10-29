<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Image, Images } from '@lucide/vue';
import PlacePhotoGallery from '@/components/PlacePhotoGallery.vue';
import { PHOTOS_NONE, type PlacePhoto } from '@/places/photos';

const props = withDefaults(
  defineProps<{
    /** Approved photographs. The first is the main image. */
    photos?: PlacePhoto[];
    placeName?: string;
  }>(),
  { photos: () => [], placeName: undefined }
);

const open = ref(false);
const index = ref(0);
const opener = ref<HTMLButtonElement | null>(null);

const main = computed(() => props.photos[0] ?? null);
const openLabel = computed(() => {
  if (!main.value) return '';
  const count = props.photos.length;
  const set = count === 1 ? 'the photograph' : `all ${count} photographs`;
  return `View ${set}. ${main.value.alt}`;
});

watch(
  () => props.photos,
  () => {
    open.value = false;
    index.value = 0;
  }
);

watch(open, async isOpen => {
  if (isOpen) return;
  await nextTick();
  opener.value?.focus();
});

/** Open the gallery on the main image. */
function show() {
  index.value = 0;
  open.value = true;
}
</script>

<template>
  <div class="place-photos">
    <button
      v-if="main"
      ref="opener"
      type="button"
      class="place-photo"
      aria-haspopup="dialog"
      :aria-label="openLabel"
      @click="show"
    >
      <img class="place-photo-image" :src="main.src" alt="" />
      <span class="place-photo-credit" aria-hidden="true">
        Photo: {{ main.photographer }} · {{ main.licence.name }}
      </span>
      <span
        v-if="photos.length > 1"
        class="place-photo-count"
        aria-hidden="true"
      >
        <Images :size="14" />
        {{ photos.length }}
      </span>
    </button>
    <div v-else class="place-photo-empty">
      <Image class="place-photo-icon" :stroke-width="1.25" aria-hidden="true" />
      <p class="place-photo-none">{{ PHOTOS_NONE }}</p>
    </div>
    <PlacePhotoGallery
      v-if="main"
      v-model:open="open"
      v-model:index="index"
      :photos="photos"
      :place-name="placeName"
    />
  </div>
</template>

<style scoped>
.place-photos {
  flex: none;
  height: 200px;
}

.place-photo,
.place-photo-empty {
  position: relative;
  width: 100%;
  height: 100%;
}

.place-photo {
  display: block;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  background: #dfe3df;
  color: #fff;
  font: inherit;
}

.place-photo:focus-visible {
  outline: 2px solid var(--foreground);
  outline-offset: -4px;
}

.place-photo-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 240ms ease;
}

.place-photo:hover .place-photo-image {
  transform: scale(1.02);
}

.place-photo-credit {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  overflow: hidden;
  padding: 24px 72px 10px var(--map-panel-padding);
  background: linear-gradient(transparent, rgba(16, 19, 16, 0.55));
  font-size: 11px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.place-photo-count {
  position: absolute;
  right: 12px;
  bottom: 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--background);
  color: var(--foreground);
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.place-photo-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: linear-gradient(150deg, #eef0ee, #dfe3df);
  color: #a3aba6;
}

.place-photo-icon {
  width: 40px;
  height: 40px;
}

.place-photo-none {
  margin: 0;
  font-size: 12px;
  color: #6f7873;
}

@media (max-width: 720px) {
  .place-photos {
    height: 120px;
  }

  .place-photo-empty {
    gap: 6px;
  }

  .place-photo-icon {
    width: 32px;
    height: 32px;
  }

  .place-photo-credit {
    padding-left: 16px;
  }
}
</style>
