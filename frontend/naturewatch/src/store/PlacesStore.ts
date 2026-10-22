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

  return { visible, status, features, notice, load, toggle };
});

export default usePlacesStore;
