import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import {
  loadKeptPlaceIds,
  loadPlaceRelease,
  loadWithdrawnPlaceIds,
  type EcoregionName,
} from '@/places/api';
import {
  CROPLAND_FULL,
  ECOREGION_TYPE,
  PROTECTED_AREA_ATTRIBUTION,
  formatReleaseMonth,
  isSizeOnlyType,
  placeTileFilter,
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
  /**
   * Stored place types the list shows and the map draws: `conservation_area`
   * and the recognition button types chosen, or `ecoregion` alone. Empty when
   * none is.
   */
  const listTypes = ref<string[]>([]);
  /** Withdrawn places, which the map hides until the tiles are rebuilt. */
  const withdrawnIds = ref<string[]>([]);

  /** Read the withdrawn places again, after one is withdrawn or restored. */
  async function loadWithdrawn(): Promise<void> {
    const result = await loadWithdrawnPlaceIds();
    if (result.status === 'ok') withdrawnIds.value = result.ids;
  }
  /**
   * Conservation areas a profile's Related tab lists. The map draws them
   * while the tab is open. Null otherwise.
   */
  const shownAreaIds = ref<string[] | null>(null);
  /** The place whose card the pointer or focus is on, outlined on the map. */
  const hoveredId = ref<string | null>(null);

  /**
   * Outline a place while its card is hovered.
   * @param id - The place.
   * @param on - Whether the pointer entered or left the card.
   */
  function hoverPlace(id: string, on: boolean) {
    if (on) hoveredId.value = id;
    else if (hoveredId.value === id) hoveredId.value = null;
  }
  /** Whether a recognition type or ecoregions are listed, so the tools are size only. */
  const sizeOnly = computed(() =>
    listTypes.value.some(type => isSizeOnlyType(type))
  );
  /** Applied size filter, in km². */
  const sizeKept = ref<SizeBounds>([null, null]);
  /** Applied Ecoregion filter, kept across place types. */
  const ecoregionsKept = ref<EcoregionName[]>([]);
  /**
   * The chosen ecoregions while they apply: to Conservation areas and the
   * recognition types, not to Ecoregions or to a search with no type.
   */
  const ecoregionIds = computed(() =>
    listTypes.value.length && !listTypes.value.includes(ECOREGION_TYPE)
      ? ecoregionsKept.value.map(ecoregion => ecoregion.id)
      : []
  );
  /**
   * Places of the listed types linked to a chosen ecoregion, which the map
   * keeps. Null while no ecoregion applies.
   */
  const ecoregionPlaceIds = ref<string[] | null>(null);
  let keptRequest = 0;

  watch(
    () => `${listTypes.value.join(',')}|${ecoregionIds.value.join(',')}`,
    async () => {
      const request = ++keptRequest;
      if (!ecoregionIds.value.length) {
        ecoregionPlaceIds.value = null;
        return;
      }
      const result = await loadKeptPlaceIds({
        placeTypes: [...listTypes.value],
        sizeMin: null,
        sizeMax: null,
        cropMin: CROPLAND_FULL[0],
        cropMax: CROPLAND_FULL[1],
        ecoregionIds: [...ecoregionIds.value],
      });
      if (request !== keptRequest || result.status !== 'ok') return;
      ecoregionPlaceIds.value = result.ids;
    }
  );
  /** Current map view, west, south, east, north. */
  const viewBounds = ref<LngLatBounds | null>(null);
  const filtering = computed(
    () =>
      sizeKept.value[0] !== null ||
      sizeKept.value[1] !== null ||
      ecoregionIds.value.length > 0
  );
  /** Tile filter for the applied size range. */
  const tileFilter = computed(() => placeTileFilter(sizeKept.value));

  /**
   * Apply a filter to the list and the map.
   * @param size - Square kilometres.
   * @param ecoregions - Chosen ecoregions. Unchanged when left out.
   */
  function applyFilter(
    size: SizeBounds,
    ecoregions: EcoregionName[] = ecoregionsKept.value
  ) {
    sizeKept.value = [...size];
    ecoregionsKept.value = [...ecoregions];
  }

  /** Keep every place again. */
  function clearFilter() {
    applyFilter([null, null], []);
  }

  /**
   * Select a place, or clear it when that place is already selected.
   * @param id - The stored place id.
   * @param source - Where the click happened. The list is the default.
   */
  function selectPlace(id: string, source: 'list' | 'map' = 'list') {
    hoveredId.value = null;
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
    hoveredId.value = null;
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
    void loadWithdrawn();
    const result = await loadPlaceRelease();
    if (result.status === 'unconfigured') {
      status.value = 'unconfigured';
      notice.value = PROTECTED_AREA_ATTRIBUTION;
      return;
    }
    const month = result.status === 'ok' ? result.releaseMonth : null;
    notice.value = month
      ? `Conservation areas: WDPCA, ${formatReleaseMonth(month)}. ${PROTECTED_AREA_ATTRIBUTION}`
      : PROTECTED_AREA_ATTRIBUTION;
    if (status.value === 'loading') status.value = 'ready';
  }

  /**
   * The admin list the Places panel shows in place of a place type: the photo
   * queue, the places that need attention, or the withdrawn places. Admins only.
   */
  const adminList = ref<'photos' | 'attention' | 'withdrawn' | null>(null);
  /** Whether the Places panel lists the photo queue. */
  const photoQueueOpen = computed({
    get: () => adminList.value === 'photos',
    set: (open: boolean) => {
      if (open) adminList.value = 'photos';
      else if (adminList.value === 'photos') adminList.value = null;
    },
  });
  /** Goes up after a place is withdrawn, restored, flagged, or cleared, so the lists read again. */
  const adminListVersion = ref(0);
  /** The queue's places as listed, in order. */
  const photoQueueIds = ref<string[]>([]);
  /** Where the place opened from the queue was listed, so Next place still works once it leaves. */
  const photoQueueIndex = ref(0);
  /** Goes up after a photograph is reviewed, so the queue reads its counts again. */
  const photoQueueVersion = ref(0);
  /** The profile tab to open the next selected place on. Cleared once used. */
  const startTab = ref<'photos' | 'status' | null>(null);

  /** The place after the open one in the queue, or null at its end. */
  const nextInPhotoQueue = computed<string | null>(() => {
    if (!photoQueueOpen.value) return null;
    const ids = photoQueueIds.value;
    const at = selectedId.value ? ids.indexOf(selectedId.value) : -1;
    return ids[at >= 0 ? at + 1 : photoQueueIndex.value] ?? null;
  });

  /**
   * Open a place from the photo queue on its Photos tab.
   * @param id - The place id.
   */
  function openFromPhotoQueue(id: string) {
    const index = photoQueueIds.value.indexOf(id);
    if (index >= 0) photoQueueIndex.value = index;
    if (selectedId.value === id) return;
    hoveredId.value = null;
    startTab.value = 'photos';
    selectedId.value = id;
    selectedFrom.value = 'list';
  }

  /**
   * Open a place from the attention or withdrawn list on its Status tab.
   * @param id - The place id.
   */
  function openFromAdminList(id: string) {
    if (selectedId.value === id) return;
    hoveredId.value = null;
    startTab.value = 'status';
    selectedId.value = id;
    selectedFrom.value = 'list';
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
    listTypes,
    withdrawnIds,
    loadWithdrawn,
    shownAreaIds,
    hoveredId,
    hoverPlace,
    sizeOnly,
    sizeKept,
    ecoregionsKept,
    ecoregionIds,
    ecoregionPlaceIds,
    viewBounds,
    filtering,
    tileFilter,
    applyFilter,
    clearFilter,
    load,
    toggle,
    selectPlace,
    clearSelection,
    adminList,
    adminListVersion,
    openFromAdminList,
    photoQueueOpen,
    photoQueueIds,
    photoQueueVersion,
    startTab,
    nextInPhotoQueue,
    openFromPhotoQueue,
  };
});

export default usePlacesStore;
