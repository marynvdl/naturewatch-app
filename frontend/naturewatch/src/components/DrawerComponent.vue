<script setup lang="ts">
import { catalog } from '@/catalog';
import useMapLayerStore from '@/store/MapLayerStore';
import useTimelineStore from '@/store/TimelineStore';
import { computed, onMounted, ref } from 'vue';
import { Info, Settings } from '@lucide/vue';
import LayerIcon from '@/components/LayerIcon.vue';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';

const mapLayerStore = useMapLayerStore();
const timelineStore = useTimelineStore();

const mapLayers = computed(() => mapLayerStore.MapLayers);
const layerGroups = computed(() =>
  catalog.groups
    .map(group => ({
      id: group.id,
      title: group.title,
      layers: mapLayers.value.filter(
        layer => layer.group === group.id && layer.active
      ),
    }))
    .filter(group => group.layers.length > 0)
);

const toggleLayerVisibility = mapLayerStore.toggleLayerVisibility;
const visibleMapLayers = computed(() => mapLayerStore.getVisibleLayers());
const toggleTimelineVisibility = timelineStore.toggleTimelineVisibility;

const infoByTitle = new Map(
  catalog.layers.map(layer => [layer.title, layer.info])
);
const infoTitle = ref<string | null>(null);
const layerPanel = ref<HTMLElement | null>(null);
const settingsSideOffset = ref(8);

/** Keep the settings card to the left of the layers panel, clear of the buttons. */
function placeSettingsBesidePanel() {
  const panel = layerPanel.value;
  if (!panel) return;
  const padRight = parseFloat(getComputedStyle(panel).paddingRight) || 0;
  settingsSideOffset.value = Math.round(panel.offsetWidth - padRight - 20 + 8);
}

onMounted(placeSettingsBesidePanel);

/** Show or hide the description inside the open settings panel. */
function toggleInfo(title: string) {
  infoTitle.value = infoTitle.value === title ? null : title;
}

/** Close the description when its settings panel closes. */
function onSettings(title: string, open: boolean) {
  if (open) placeSettingsBesidePanel();
  if (!open && infoTitle.value === title) infoTitle.value = null;
}

/** Turn a layer on or off, and show the timeline only while one is on. */
function handleButtonClick(title: string) {
  toggleLayerVisibility(title);
  toggleTimelineVisibility(visibleMapLayers.value.length > 0);
}

/**
 * Years the catalog lists for a layer.
 * A continuous run is written as a span.
 */
function yearsCovered(years: number[]): string {
  if (years.length === 0) return 'None published';
  const sorted = [...years].sort((a, b) => a - b);
  if (sorted.length === 1) return String(sorted[0]);
  const contiguous = sorted.every(
    (year, index) => index === 0 || year === sorted[index - 1] + 1
  );
  if (contiguous) return `${sorted[0]}–${sorted[sorted.length - 1]}`;
  return sorted.join(', ');
}

/** Keep the map opacity in step with the settings slider. */
function onOpacity(title: string, value: unknown) {
  if (!Array.isArray(value)) return;
  const next = value[0];
  if (typeof next !== 'number') return;
  mapLayerStore.updateLayerOpacity(title, next);
}
</script>

<template>
  <div class="layer-column nw">
    <div ref="layerPanel" class="layer-panel map-panel">
      <h2 class="panel-heading">Landscape</h2>
      <div class="layer-list">
        <template v-for="group in layerGroups" :key="group.id">
          <h3 class="group-label map-section">{{ group.title }}</h3>
          <template v-for="item in group.layers" :key="item.title">
            <button
              type="button"
              class="layer-button map-control"
              :class="{ 'is-on': item.visible }"
              :style="{ '--layer': item.button_color }"
              :aria-pressed="item.visible"
              @click="handleButtonClick(item.title)"
            >
              <LayerIcon :name="item.icon" :size="16" />
              <span>{{ item.title }}</span>
            </button>
            <div class="settings-slot">
              <Popover
                v-if="item.visible"
                @update:open="open => onSettings(item.title, open)"
              >
                <PopoverTrigger as-child>
                  <button
                    type="button"
                    class="layer-settings"
                    :aria-label="`Settings for ${item.title}`"
                  >
                    <Settings />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="left"
                  align="start"
                  :avoid-collisions="false"
                  :side-offset="settingsSideOffset"
                  class="layer-popover nw:z-[1200] nw:max-h-[70vh] nw:gap-3 nw:overflow-y-auto nw:shadow-none"
                >
                  <div
                    class="nw:flex nw:items-center nw:justify-between nw:gap-2"
                  >
                    <p class="nw:text-sm nw:font-medium">{{ item.title }}</p>
                    <button
                      v-if="
                        infoByTitle.get(item.title)?.content ||
                        infoByTitle.get(item.title)?.subtitle
                      "
                      type="button"
                      class="layer-info-button"
                      :aria-expanded="infoTitle === item.title"
                      :aria-label="`About ${item.title}`"
                      @click="toggleInfo(item.title)"
                    >
                      <Info />
                    </button>
                  </div>
                  <div class="nw:flex nw:flex-col nw:gap-2">
                    <div class="nw:flex nw:items-center nw:justify-between">
                      <p class="nw:text-xs nw:text-muted-foreground">Opacity</p>
                      <p class="nw:text-xs nw:text-muted-foreground">
                        {{ item.opacity }}%
                      </p>
                    </div>
                    <Slider
                      :model-value="[item.opacity]"
                      :min="0"
                      :max="100"
                      :step="5"
                      :aria-label="`${item.title} opacity`"
                      @update:model-value="
                        value => onOpacity(item.title, value)
                      "
                    />
                  </div>
                  <div class="nw:flex nw:flex-col nw:gap-1">
                    <p class="nw:text-xs nw:text-muted-foreground">Years</p>
                    <p class="nw:text-sm">
                      {{ yearsCovered(item.years_available) }}
                    </p>
                  </div>
                  <div
                    v-if="infoTitle === item.title"
                    class="nw:flex nw:flex-col nw:gap-1"
                  >
                    <p
                      v-if="infoByTitle.get(item.title)?.subtitle"
                      class="nw:text-sm nw:text-muted-foreground"
                    >
                      {{ infoByTitle.get(item.title)?.subtitle }}
                    </p>
                    <!-- Catalog copy. The info field is authored HTML, same as the About dialog. -->
                    <!-- eslint-disable vue/no-v-html -->
                    <div
                      v-if="infoByTitle.get(item.title)?.content"
                      class="layer-info nw:text-xs nw:leading-relaxed nw:text-muted-foreground"
                      v-html="infoByTitle.get(item.title)?.content"
                    />
                    <!-- eslint-enable vue/no-v-html -->
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layer-column {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.layer-panel {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  width: max-content;
}

.layer-panel .panel-heading {
  padding-right: 40px;
}

.layer-list {
  display: grid;
  grid-template-columns: max-content 20px;
  column-gap: 6px;
  row-gap: 8px;
  align-items: center;
}

.group-label {
  grid-column: 1 / -1;
  margin: 8px 0 2px;
}

.layer-button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: max-content;
  min-width: 100%;
  text-align: left;
}

.settings-slot {
  width: 20px;
  height: 20px;
}

.layer-settings {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: #f8f9f9;
  color: #3a3935;
  box-shadow: none;
}

.layer-settings :deep(svg) {
  width: 12px;
  height: 12px;
}

.layer-info-button {
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: #f8f9f9;
  color: #3a3935;
}

.layer-info-button svg {
  width: 12px;
  height: 12px;
}

.layer-info-button[aria-expanded='true'] {
  background: var(--on);
}

.layer-info :deep(a) {
  color: inherit;
  text-decoration: underline;
}

.layer-info :deep(p) {
  margin: 0.5rem 0 0;
}

.layer-info :deep(ul) {
  margin: 0.5rem 0 0;
  padding-left: 1.1rem;
}
</style>
