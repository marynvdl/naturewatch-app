import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { loadPlaceRelease } from '@/places/api';
import {
  CROPLAND_FULL,
  PROTECTED_AREA_ATTRIBUTION,
  formatReleaseMonth,
  placeTileFilter,
  type FigureRange,
  type LngLatBounds,
  type SizeBounds,
} from '@/places/display';

const usePlacesStore = defineStore('places', () => {
  const visible = ref(false);
  /**
   * Boundaries draw from the tile archive whatever this says.
   * `unconfigured` means Supabase is not set, so names and profiles cannot load.
   * `error` means the tiles could not be read.
   */
  const status = ref<'idle' | 'loading' | 'ready' | 'unconfigured' | 'error'>(
    'idle'
  );
  const notice = ref('');
  const selectedId = ref<string | null>(null);
  const selectedFrom = ref<'list' | 'map' | null>(null);
  /** Applied size filter, in km². */
  const sizeKept = ref<SizeBounds>([null, null]);
  /** Applied cropland filter, in percent. */
  const croplandKept = ref<FigureRange>([...CROPLAND_FULL]);
  /** Current map view, west, south, east, north. */
  const viewBounds = ref<LngLatBounds | null>(null);
  const filtering = computed(
    () =>
      sizeKept.value[0] !== null ||
      sizeKept.value[1] !== null ||
      croplandKept.value[0] > CROPLAND_FULL[0] ||
      croplandKept.value[1] < CROPLAND_FULL[1]
  );
  /** Tile filter for the applied size and cropland ranges. */
  const tileFilter = computed(() =>
    placeTileFilter(sizeKept.value, croplandKept.value)
  );

  /**
   * Apply a filter to the list and the map.
   * @param size - Square kilometres.
   * @param cropland - Cropland percent.
   */
  function applyFilter(size: SizeBounds, cropland: FigureRange) {
    sizeKept.value = [...size];
    croplandKept.value = [...cropland];
  }

  /** Keep every place again. */
  function clearFilter() {
    applyFilter([null, null], CROPLAND_FULL);
  }

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
   * Read the release month for the notice once.
   * The boundaries themselves come from the tile archive.
   */
  async function load(): Promise<void> {
    if (status.value !== 'idle') return;
    status.value = 'loading';
    const result = await loadPlaceRelease();
    if (result.status === 'unconfigured') {
      status.value = 'unconfigured';
      notice.value = PROTECTED_AREA_ATTRIBUTION;
      return;
    }
    const month = result.status === 'ok' ? result.releaseMonth : null;
    notice.value = month
      ? `Protected areas: WDPCA, ${formatReleaseMonth(month)}. ${PROTECTED_AREA_ATTRIBUTION}`
      : PROTECTED_AREA_ATTRIBUTION;
    if (status.value === 'loading') status.value = 'ready';
  }

  /** Show or hide the boundaries on the map. */
  function toggle(): void {
    visible.value = !visible.value;
    if (visible.value) void load();
  }

  return {
    visible,
    status,
    notice,
    selectedId,
    selectedFrom,
    sizeKept,
    croplandKept,
    viewBounds,
    filtering,
    tileFilter,
    applyFilter,
    clearFilter,
    load,
    toggle,
    selectPlace,
    clearSelection,
  };
});

export default usePlacesStore;
