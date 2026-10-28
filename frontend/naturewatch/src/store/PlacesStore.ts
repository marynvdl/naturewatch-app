import { defineStore } from 'pinia';
import { ref } from 'vue';
import { loadPlaceMap } from '@/places/api';
import {
  PROTECTED_AREA_ATTRIBUTION,
  formatReleaseMonth,
  type PlaceFeatureCollection,
} from '@/places/display';

const usePlacesStore = defineStore('places', () => {
  const visible = ref(false);
  const status = ref<'idle' | 'loading' | 'ready' | 'unconfigured' | 'error'>(
    'idle'
  );
  const features = ref<PlaceFeatureCollection | null>(null);
  const notice = ref('');
  const selectedId = ref<string | null>(null);
  const selectedFrom = ref<'list' | 'map' | null>(null);

  /**
   * Select a place, or clear it when that place is already selected.
   * @param id - The stored place id.
   * @param source - Where the click happened. The list is the default.
   */
  function selectPlace(id: string, source: 'list' | 'map' = 'list') {
    if (selectedId.value === id) {
      selectedId.value = null;
      selectedFrom.value = null;
      return;
    }
    selectedId.value = id;
    selectedFrom.value = source;
  }

  /** Close the place column. */
  function clearSelection() {
    selectedId.value = null;
    selectedFrom.value = null;
  }

  /**
   * Load the map shapes once.
   * Later toggles reuse the collection already in memory.
   */
  async function load(): Promise<void> {
    if (features.value || status.value === 'loading') return;
    status.value = 'loading';
    const result = await loadPlaceMap();
    if (result.status !== 'ok') {
      status.value = result.status;
      return;
    }
    features.value = result.features;
    notice.value = result.releaseMonth
      ? `Protected areas: WDPCA, ${formatReleaseMonth(result.releaseMonth)}. ${PROTECTED_AREA_ATTRIBUTION}`
      : PROTECTED_AREA_ATTRIBUTION;
    status.value = 'ready';
  }

  /** Show or hide the boundaries on the map. */
  function toggle(): void {
    visible.value = !visible.value;
    if (visible.value) void load();
  }

  return {
    visible,
    status,
    features,
    notice,
    selectedId,
    selectedFrom,
    load,
    toggle,
    selectPlace,
    clearSelection,
  };
});

export default usePlacesStore;
