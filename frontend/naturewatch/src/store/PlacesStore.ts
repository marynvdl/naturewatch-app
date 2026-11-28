import { defineStore } from 'pinia';
import type { BoundaryReviewView } from '@/places/boundaryReview';
import type { OverlapReviewView } from '@/places/overlapReview';
import type { MultiPolygon } from 'geojson';
import { computed, ref, shallowRef, watch } from 'vue';
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

/** A set of conservation areas drawn on the map and shown as a chip. */
export interface MapSet {
  id: string;
  label: string;
  /** Where the set comes from. Today only a profile's Related tab. */
  kind: 'related';
  /** The place the set belongs to. Its chip opens it. */
  ownerId: string;
  /** That place's name, shortened to initials on the chip. */
  ownerName: string;
  placeIds: string[];
  /** A pinned set stays while other places are opened. */
  pinned: boolean;
}

/** A place opened before the open one. */
export interface HistoryEntry {
  id: string;
  name: string;
  /** The profile tab it was on. */
  tab: string;
}

/** Places the back button can step through. */
const HISTORY_LIMIT = 20;

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
   * Stored place types the list shows and the map draws: any of
   * `conservation_area`, `ecoregion`, and the recognition button types.
   * Empty when none is.
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
   * Sets of conservation areas drawn on the map, each shown as a chip. Today
   * the only kind is a profile's Related set. At most one is temporary: it
   * goes when a place outside it is opened. A pinned set stays until removed.
   */
  const mapSets = ref<MapSet[]>([]);
  /**
   * Every conservation area the map sets hold, which the map draws whatever
   * the list and the filter show. Null while there is no set.
   */
  const shownAreaIds = computed<string[] | null>(() => {
    const ids = new Set(mapSets.value.flatMap(set => set.placeIds));
    return ids.size ? [...ids] : null;
  });
  /** The temporary set, if there is one. */
  const temporarySet = computed(
    () => mapSets.value.find(set => !set.pinned) ?? null
  );

  /**
   * The open Related tab lists these conservation areas, or none. The first
   * creates or replaces the temporary set. None removes the temporary set only
   * when the place that made it reports it, so opening one of its places keeps it.
   * @param ownerId - The place whose Related tab it is.
   * @param name - That place's name, for the chip.
   * @param ids - The conservation areas, or null.
   */
  function showRelated(ownerId: string, name: string, ids: string[] | null) {
    const temporary = temporarySet.value;
    if (!ids) {
      if (temporary?.ownerId === ownerId) removeSet(temporary.id);
      return;
    }
    const kept = mapSets.value.filter(
      set => set.pinned || set.ownerId !== ownerId
    );
    // A pinned set of the same place already draws them.
    if (kept.some(set => set.ownerId === ownerId)) {
      mapSets.value = kept;
      return;
    }
    mapSets.value = [
      ...kept.filter(set => set.pinned),
      {
        id: `related:${ownerId}`,
        label: `Related to ${name}`,
        kind: 'related',
        ownerId,
        ownerName: name,
        placeIds: [...ids],
        pinned: false,
      },
    ];
  }

  /**
   * Keep a set on the map while other places are opened.
   * @param id - The set.
   */
  function pinSet(id: string) {
    mapSets.value = mapSets.value.map(set =>
      set.id === id ? { ...set, pinned: true } : set
    );
  }

  /**
   * Stop keeping a pinned set, so it goes like a temporary one. Any other
   * temporary set is removed, as there is at most one.
   * @param id - The set.
   */
  function unpinSet(id: string) {
    mapSets.value = mapSets.value
      .filter(set => set.pinned || set.id === id)
      .map(set => (set.id === id ? { ...set, pinned: false } : set));
  }

  /**
   * Take a set off the map.
   * @param id - The set.
   */
  function removeSet(id: string) {
    mapSets.value = mapSets.value.filter(set => set.id !== id);
  }

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

  /**
   * The name shown beside the pointer after it rests on a place on the map,
   * where it rests, in pixels from the map's corner. Null otherwise.
   */
  const mapTip = ref<{ name: string; x: number; y: number } | null>(null);
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
   * Applied photo filter: only places with suggested photographs. Admins in
   * Edit mode only.
   */
  const photoSuggestions = ref(false);
  /**
   * Applied boundary review filter: only places whose boundary is in this
   * review view. Admins in Edit mode only. Null while off.
   */
  const boundaryReview = ref<BoundaryReviewView | null>(null);
  /**
   * Applied link review filter: only places with a proposed link of this
   * kind. Admins in Edit mode only. Null while off.
   */
  const overlapReview = ref<OverlapReviewView | null>(null);
  /**
   * Places of the listed types linked to a chosen ecoregion, or with suggested
   * photographs while the photo filter is on, which the map keeps. Null while
   * neither applies.
   */
  const keptPlaceIds = ref<string[] | null>(null);
  let keptRequest = 0;

  watch(
    () =>
      `${listTypes.value.join(',')}|${ecoregionIds.value.join(',')}|${photoSuggestions.value}|${boundaryReview.value}|${overlapReview.value}`,
    async () => {
      const request = ++keptRequest;
      if (
        !ecoregionIds.value.length &&
        !photoSuggestions.value &&
        !boundaryReview.value &&
        !overlapReview.value
      ) {
        keptPlaceIds.value = null;
        return;
      }
      const result = await loadKeptPlaceIds({
        placeTypes: [...listTypes.value],
        sizeMin: null,
        sizeMax: null,
        cropMin: CROPLAND_FULL[0],
        cropMax: CROPLAND_FULL[1],
        ecoregionIds: [...ecoregionIds.value],
        photoSuggestions: photoSuggestions.value,
        boundaryReview: boundaryReview.value,
        overlapReview: overlapReview.value,
      });
      if (request !== keptRequest || result.status !== 'ok') return;
      keptPlaceIds.value = result.ids;
    }
  );
  /** Current map view, west, south, east, north. */
  const viewBounds = ref<LngLatBounds | null>(null);
  const filtering = computed(
    () =>
      sizeKept.value[0] !== null ||
      sizeKept.value[1] !== null ||
      ecoregionIds.value.length > 0 ||
      photoSuggestions.value ||
      boundaryReview.value !== null ||
      overlapReview.value !== null
  );
  /** Tile filter for the applied size range. */
  const tileFilter = computed(() => placeTileFilter(sizeKept.value));

  /**
   * Apply a filter to the list and the map.
   * @param size - Square kilometres.
   * @param ecoregions - Chosen ecoregions. Unchanged when left out.
   * @param photos - Whether only places with suggested photographs are kept.
   *   Unchanged when left out.
   * @param review - The boundary review view to keep, or null. Unchanged when
   *   left out.
   * @param links - The kind of proposed link to keep, or null. Unchanged when
   *   left out.
   */
  function applyFilter(
    size: SizeBounds,
    ecoregions: EcoregionName[] = ecoregionsKept.value,
    photos: boolean = photoSuggestions.value,
    review: BoundaryReviewView | null = boundaryReview.value,
    links: OverlapReviewView | null = overlapReview.value
  ) {
    sizeKept.value = [...size];
    ecoregionsKept.value = [...ecoregions];
    photoSuggestions.value = photos;
    boundaryReview.value = review;
    overlapReview.value = links;
  }

  /** Keep every place again. */
  function clearFilter() {
    applyFilter([null, null], [], false, null, null);
  }

  /** Whether the list is limited to the current map view. On at the start. */
  const listInView = ref(true);
  /** Counts the requests to fit the map to the places the filter keeps. */
  const fitRequest = ref(0);

  /** Ask the map to fit the places the filter keeps, after it is applied. */
  function fitToKept() {
    fitRequest.value += 1;
  }

  /** The open profile tab. It is kept when another place opens. */
  const profileTab = ref<string>('overview');
  /** The open place's name, once its profile has read it. */
  const selectedName = ref('');
  /** The places opened before the open one, oldest first. */
  const history = ref<HistoryEntry[]>([]);

  /**
   * Show a place, noting the open one in the history.
   * @param id - The place.
   * @param source - Where it was chosen.
   * @param tab - The tab to open it on. The open tab is kept when left out.
   */
  function open(id: string, source: 'list' | 'map', tab?: string) {
    hoveredId.value = null;
    const temporary = temporarySet.value;
    const inSet = !!temporary?.placeIds.includes(id);
    if (temporary && !inSet && temporary.ownerId !== id)
      removeSet(temporary.id);
    if (selectedId.value)
      history.value = [
        ...history.value,
        {
          id: selectedId.value,
          name: selectedName.value,
          tab: profileTab.value,
        },
      ].slice(-HISTORY_LIMIT);
    // Opening one of the drawn Related places drills down, on Overview.
    profileTab.value = tab ?? (inSet ? 'overview' : profileTab.value);
    selectedName.value = '';
    selectedId.value = id;
    selectedFrom.value = source;
  }

  /**
   * Select a place, or clear it when that place is already selected.
   * @param id - The stored place id.
   * @param source - Where the click happened. The list is the default.
   */
  function selectPlace(id: string, source: 'list' | 'map' = 'list') {
    if (selectedId.value === id) {
      clearSelection();
      return;
    }
    open(id, source);
  }

  /**
   * Open the place whose set a chip shows, on its Related tab.
   * @param id - The set.
   */
  function openSetOwner(id: string) {
    const set = mapSets.value.find(item => item.id === id);
    if (!set || selectedId.value === set.ownerId) return;
    open(set.ownerId, 'list', 'related');
  }

  /**
   * Step back to an earlier place, on the tab it was on.
   * @param index - Its place in the history. The last one is the default.
   */
  function goBack(index = history.value.length - 1) {
    const entry = history.value[index];
    if (!entry) return;
    hoveredId.value = null;
    const temporary = temporarySet.value;
    if (
      temporary &&
      temporary.ownerId !== entry.id &&
      !temporary.placeIds.includes(entry.id)
    )
      removeSet(temporary.id);
    history.value = history.value.slice(0, index);
    profileTab.value = entry.tab;
    selectedName.value = entry.name;
    selectedId.value = entry.id;
    selectedFrom.value = 'list';
  }

  /** Close the place column. Pinned sets stay on the map. */
  function clearSelection() {
    hoveredId.value = null;
    selectedId.value = null;
    selectedFrom.value = null;
    selectedName.value = '';
    history.value = [];
    mapSets.value = mapSets.value.filter(set => set.pinned);
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
   * The admin list the Places panel shows in place of a place type: the
   * places that need attention, the withdrawn places, or the corrections.
   * Admins only.
   */
  const adminList = ref<'attention' | 'withdrawn' | 'corrections' | null>(null);
  /**
   * Goes up after a place is hidden, shown, flagged, or cleared, or a boundary
   * is reviewed, so the lists read again.
   */
  const adminListVersion = ref(0);
  /**
   * The uploaded or proposed boundary on the Status tab, which the map
   * outlines. Null while there is none.
   */
  const boundaryPreview = ref<MultiPolygon | null>(null);
  /**
   * The boundary to edit on the map, set to start an edit and null to end it.
   * The map's draw tool writes each change to `boundaryEdited`.
   */
  const boundaryEdit = shallowRef<MultiPolygon | null>(null);
  /** The boundary as edited so far, or null when no edit is open. */
  const boundaryEdited = shallowRef<MultiPolygon | null>(null);
  /** Raised to delete the points selected in the edit. */
  const boundaryEditTrash = ref(0);
  /** The places list's cards while the photo filter is on, in order. */
  const photoListIds = ref<string[]>([]);
  /** Where the place opened from that list was, so Next place still works once it leaves. */
  const photoListIndex = ref(0);
  /** Goes up after a photograph is reviewed, so the list reads its counts again. */
  const photoCountsVersion = ref(0);

  /** The card after the open place while the photo filter is on, or null at the end. */
  const nextPhotoPlace = computed<string | null>(() => {
    if (!photoSuggestions.value) return null;
    const ids = photoListIds.value;
    const at = selectedId.value ? ids.indexOf(selectedId.value) : -1;
    return ids[at >= 0 ? at + 1 : photoListIndex.value] ?? null;
  });

  /**
   * Open a place on its Photos tab, from the list while the photo filter is on.
   * @param id - The place id.
   */
  function openWithPhotos(id: string) {
    const index = photoListIds.value.indexOf(id);
    if (index >= 0) photoListIndex.value = index;
    if (selectedId.value === id) return;
    open(id, 'list', 'photos');
  }

  /**
   * Open a place on its Related tab, from the places list while the link
   * review filter is on.
   * @param id - The place id.
   */
  function openForLinkReview(id: string) {
    if (selectedId.value === id) return;
    open(id, 'list', 'related');
  }

  /**
   * Open a place on its Status tab: from the follow-up or hidden list, or from
   * the places list while the boundary review filter is on.
   * @param id - The place id.
   */
  function openFromAdminList(id: string) {
    if (selectedId.value === id) return;
    open(id, 'list', 'status');
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
    mapSets,
    shownAreaIds,
    temporarySet,
    showRelated,
    pinSet,
    unpinSet,
    removeSet,
    hoveredId,
    mapTip,
    hoverPlace,
    sizeOnly,
    sizeKept,
    ecoregionsKept,
    ecoregionIds,
    keptPlaceIds,
    photoSuggestions,
    boundaryReview,
    overlapReview,
    viewBounds,
    filtering,
    tileFilter,
    applyFilter,
    clearFilter,
    listInView,
    fitRequest,
    fitToKept,
    load,
    toggle,
    profileTab,
    selectedName,
    history,
    selectPlace,
    openSetOwner,
    goBack,
    clearSelection,
    adminList,
    adminListVersion,
    boundaryPreview,
    boundaryEdit,
    boundaryEdited,
    boundaryEditTrash,
    openFromAdminList,
    openForLinkReview,
    photoListIds,
    photoCountsVersion,
    nextPhotoPlace,
    openWithPhotos,
  };
});

export default usePlacesStore;
