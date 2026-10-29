<script setup lang="ts">
import { ref } from 'vue';
import { Info, X } from '@lucide/vue';
import { buildInfoCards, catalog } from '@/catalog';
import LayerIcon from '@/components/LayerIcon.vue';

/** Entries come from src/catalog/layers.json */
const cardData = buildInfoCards(catalog);
const dialog = ref<HTMLDialogElement | null>(null);

/** Open the about dialog. */
function open() {
  dialog.value?.showModal();
}

/** Close the about dialog. */
function close() {
  dialog.value?.close();
}
</script>

<template>
  <button
    type="button"
    class="info-trigger"
    title="More info"
    aria-label="More info"
    @click="open"
  >
    <Info :size="16" />
  </button>
  <dialog ref="dialog" class="info-dialog" aria-labelledby="about-title">
    <header class="info-header">
      <div>
        <h2 id="about-title">About Nature Watch</h2>
        <p>
          We're all about presenting clear and accurate data layers of how we
          interact with the Earth from space. Found a better or more recent
          layer or have feedback? Send us an email at top.map4835@fastmail.com
        </p>
      </div>
      <button
        type="button"
        class="info-close"
        aria-label="Close"
        @click="close"
      >
        <X :size="18" />
      </button>
    </header>
    <div class="info-body">
      <template v-for="card in cardData" :key="card.title">
        <details v-if="card.content" class="info-card">
          <summary>
            <LayerIcon :name="card.icon" />
            <span>
              <span class="info-title">{{ card.title }}</span>
              <span class="info-subtitle">{{ card.subtitle }}</span>
            </span>
          </summary>
          <div class="info-content">
            <!-- eslint-disable vue/no-v-html -->
            <div v-html="card.content" />
            <!--eslint-enable-->
            <img
              v-if="card.image"
              :src="card.image"
              alt=""
              class="card-image"
            />
          </div>
        </details>
        <div v-else class="info-card info-card-static">
          <LayerIcon :name="card.icon" />
          <span>
            <span class="info-title">{{ card.title }}</span>
            <span class="info-subtitle">{{ card.subtitle }}</span>
          </span>
        </div>
      </template>
    </div>
  </dialog>
</template>

<style scoped>
.info-trigger {
  width: 31px;
  height: 31px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #f8f9f9;
  color: #24312c;
  box-shadow: none;
  cursor: pointer;
}

.info-dialog {
  width: min(960px, calc(100vw - 32px));
  max-height: min(80vh, 900px);
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: #f8f9f9;
  color: #3a3935;
}

.info-dialog::backdrop {
  background: rgba(36, 49, 44, 0.28);
}

.info-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px 20px 12px;
}

.info-header h2 {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 500;
}

.info-header p {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  color: #64748b;
}

.info-close {
  display: grid;
  width: 36px;
  height: 36px;
  flex: none;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.info-body {
  max-height: 60vh;
  overflow-y: auto;
  padding: 0 12px 16px;
}

.info-card {
  border-top: 1px solid var(--border);
}

.info-card summary,
.info-card-static {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 8px;
  cursor: pointer;
}

.info-card-static {
  cursor: default;
}

.info-title,
.info-subtitle {
  display: block;
}

.info-title {
  font-size: 16px;
}

.info-subtitle {
  font-size: 13px;
  color: #64748b;
}

.info-content {
  padding: 0 8px 16px 36px;
  font-size: 14px;
  line-height: 1.45;
}

.card-image {
  max-width: 350px;
  padding-top: 12px;
}
</style>
