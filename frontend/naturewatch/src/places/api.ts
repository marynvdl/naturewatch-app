import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseClient } from '@/plugins/supabase';
import {
  type FigureRange,
  type LngLatBounds,
  type PlaceSort,
} from '@/places/display';

/** Cards the places list shows at once. */
export const PLACE_LIST_LIMIT = 50;

/**
 * Published conservation-area boundaries. Each feature carries `id` (`places.id`),
 * `area_km2`, and `cropland_percent` when a figure is stored.
 */
export const PLACE_TILES_URL =
  'https://storage.googleapis.com/nature-watch-tiles/places/protected-areas/v1/places.pmtiles';

/** Vector layer inside the places archive. */
export const PLACE_TILE_LAYER = 'places';

/**
 * Published recognition boundaries. Each feature carries `id` (`places.id`),
 * `area_km2`, and `place_type_id`.
 */
export const RECOGNITION_TILES_URL =
  'https://storage.googleapis.com/nature-watch-tiles/places/recognitions/v1/recognitions.pmtiles';

/** Vector layer inside the recognitions archive. */
export const RECOGNITION_TILE_LAYER = 'recognitions';

/** Place type of the conservation areas: the default list and the release notice. */
export const PLACE_TYPE = 'conservation_area';

/** Period of the cropland figures the profile shows. */
export const CROPLAND_PERIOD_START = '2024-01-01';

const PLACE_COLUMNS =
  'id, name, place_type_id, designation, iso3, area_km2, site_id, release_month, source_name, citation, tagline, description, source_place_name, source_designation, source_iso3';

/** A card on the places list. */
export interface PlaceSummary {
  id: string;
  name: string;
  designation: string | null;
  iso3: string | null;
  area_km2: number | null;
  /** Stored cropland percent, or null when none is stored. */
  cropland_percent: number | null;
  /** `place_types.id`. Set by the search across every type. */
  place_type_id?: string;
}

/** A published place and its stored cropland figures, when they exist. */
export interface PlaceDetail {
  id: string;
  name: string;
  /** `place_types.id`, such as `conservation_area` or `ramsar_site`. */
  placeTypeId: string;
  designation: string | null;
  iso3: string | null;
  areaKm2: number | null;
  siteId: string | null;
  releaseMonth: string;
  sourceName: string;
  /** The release citation, shown as the profile's source line. */
  citation: string;
  croplandKm2: number | null;
  percent: number | null;
  /** Curated one-line fact, or null. */
  tagline: string | null;
  /** Curated plain-text description, or null. */
  description: string | null;
  /** What the source says, shown beside a curated value in edit mode. */
  source: PlaceSourceValues;
}

/** The source values that curated values override. */
export interface PlaceSourceValues {
  name: string;
  designation: string | null;
  /** Country codes joined by `;`, as in `iso3`. */
  iso3: string | null;
}

/** Fields an admin curates. Null resets a field to the source value. */
export interface PlaceCuration {
  display_name: string | null;
  tagline: string | null;
  description: string | null;
  designation: string | null;
  iso3: string[] | null;
}

/** Result of saving curated values. `curation` is null once every field is reset. */
export type CuratePlaceResult =
  | { status: 'ok'; curation: PlaceCuration | null }
  | { status: 'unconfigured' }
  | { status: 'error'; message: string };

/** Search, sort, filters, and optional map view for the list window. */
export interface PlaceWindowQuery {
  search: string;
  searchPrefix: boolean;
  sort: PlaceSort;
  sizeMin: number | null;
  sizeMax: number | null;
  cropMin: number;
  cropMax: number;
  extent: LngLatBounds | null;
  /** Skip this many matching rows. Used to load the next 50. */
  offset?: number;
  /** Stored place type to list. Conservation areas when left out. */
  placeType?: string;
}

/** Result of loading the capped list. */
export type PlaceWindowResult =
  | { status: 'ok'; places: PlaceSummary[]; total: number }
  | { status: 'unconfigured' }
  | { status: 'error' };

/** Result of counting matches for the filter dialog. */
export type PlaceCountResult =
  | { status: 'ok'; total: number }
  | { status: 'unconfigured' }
  | { status: 'error' };

/** Stored size range and histogram counts for the filter charts. */
export interface PlaceFilterStats {
  placeCount: number;
  sizeFull: FigureRange;
  sizeBins: number[];
  croplandBins: number[];
}

/** Result of loading the filter charts. */
export type PlaceFilterStatsResult =
  | { status: 'ok'; stats: PlaceFilterStats }
  | { status: 'unconfigured' }
  | { status: 'error' };

/** Result of finding where one place sits in the list. */
export type PlaceRankResult =
  | { status: 'ok'; rank: number | null }
  | { status: 'unconfigured' }
  | { status: 'error' };

type WindowRow = PlaceSummary & { total_count: number | string };

/** Result of opening one place. */
export type PlaceLoadResult =
  | { status: 'ok'; place: PlaceDetail }
  | { status: 'missing' }
  | { status: 'unconfigured' }
  | { status: 'error' };

/** A recognition of a place, shown as a badge on its profile. */
export interface PlaceRecognition {
  id: string;
  name: string;
  placeTypeId: string;
}

/** Result of reading a place's confirmed recognitions. */
export type PlaceRecognitionsResult =
  | { status: 'ok'; recognitions: PlaceRecognition[] }
  | { status: 'unconfigured' }
  | { status: 'error' };

/** Result of looking up the extent of one place. */
export type PlaceBoundsResult =
  | { status: 'ok'; bounds: LngLatBounds }
  | { status: 'missing' }
  | { status: 'unconfigured' }
  | { status: 'error' };

/** Result of reading the WDPCA release month for the map notice. */
export type PlaceReleaseResult =
  | { status: 'ok'; releaseMonth: string | null }
  | { status: 'unconfigured' }
  | { status: 'error' };

const PLACE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Browser client for place attributes and stats.
 * @returns The shared client, or null when Supabase is not configured.
 */
export function placesClient(): SupabaseClient | null {
  return supabaseClient();
}

/**
 * Arguments shared by the list window and the filter count.
 * @param query - Search, filters, and optional extent.
 * @returns Named arguments for the `place_matched` filters.
 */
function matchedArgs(query: Omit<PlaceWindowQuery, 'sort' | 'offset'>) {
  return {
    p_place_type: query.placeType ?? PLACE_TYPE,
    p_search: query.search.trim(),
    p_search_prefix: query.searchPrefix,
    p_size_min: query.sizeMin,
    p_size_max: query.sizeMax,
    p_crop_min: query.cropMin,
    p_crop_max: query.cropMax,
    p_west: query.extent?.[0] ?? null,
    p_south: query.extent?.[1] ?? null,
    p_east: query.extent?.[2] ?? null,
    p_north: query.extent?.[3] ?? null,
  };
}

/**
 * At most 50 stored places for `/places`, ordered by name.
 * Search is part of the query. The page receives at most 50 rows.
 * @param search - Text the name must contain.
 * @returns The window, or why it could not be loaded.
 */
export async function loadPilotPlaces(search = ''): Promise<PlaceWindowResult> {
  return loadPilotPlaceWindow({
    search,
    searchPrefix: false,
    sort: 'name',
    sizeMin: null,
    sizeMax: null,
    cropMin: 0,
    cropMax: 100,
    extent: null,
  });
}

/**
 * At most 50 pilot places for the current list query, plus how many match.
 * @param query - Search, sort, filters, and optional map extent.
 * @param signal - Cancels the request when a newer one replaces it.
 * @returns The window, or why it could not be loaded.
 */
export async function loadPilotPlaceWindow(
  query: PlaceWindowQuery,
  signal?: AbortSignal
): Promise<PlaceWindowResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const call = supabase.rpc('place_window', {
    ...matchedArgs(query),
    p_sort: query.sort,
    p_limit: PLACE_LIST_LIMIT,
    ...(query.offset ? { p_offset: query.offset } : {}),
  });
  const { data, error } = await (signal ? call.abortSignal(signal) : call);
  if (error || !data) return { status: 'error' };
  const rows = data as WindowRow[];
  const total = Number(rows[0]?.total_count ?? 0);
  return {
    status: 'ok',
    total,
    places: rows.map(row => ({
      id: row.id,
      name: row.name,
      designation: row.designation,
      iso3: row.iso3,
      area_km2: row.area_km2,
      cropland_percent: row.cropland_percent,
    })),
  };
}

/**
 * At most 50 listed places of every type whose names start with the search,
 * plus how many match. Used while no place type is selected. The size filter
 * applies. Cropland and the map view do not, as they are not shared by every
 * type; a cropland order falls back to largest first.
 * @param query - Search, sort, size filter, and offset.
 * @param signal - Cancels the request when a newer one replaces it.
 * @returns The window, or why it could not be loaded.
 */
export async function loadPlaceSearchWindow(
  query: PlaceWindowQuery,
  signal?: AbortSignal
): Promise<PlaceWindowResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const prefix = query.search.trim().replace(/[\\%_]/g, match => `\\${match}`);
  // Quoted, so a comma or bracket in the search does not split the `or` filter.
  const pattern = `"${`${prefix}%`.replace(/["\\]/g, match => `\\${match}`)}"`;
  let call = supabase
    .from('listed_places')
    .select('id, name, designation, iso3, area_km2, place_type_id', {
      count: 'exact',
    })
    .or(`name.ilike.${pattern},source_place_name.ilike.${pattern}`);
  if (query.sizeMin !== null) call = call.gte('area_km2', query.sizeMin);
  if (query.sizeMax !== null) call = call.lte('area_km2', query.sizeMax);
  if (query.sort === 'name') call = call.order('name');
  else
    call = call
      .order('area_km2', {
        ascending: query.sort === 'size-asc',
        nullsFirst: false,
      })
      .order('name');
  const offset = query.offset ?? 0;
  call = call.range(offset, offset + PLACE_LIST_LIMIT - 1);
  const { data, error, count } = await (signal
    ? call.abortSignal(signal)
    : call);
  if (error || !data) return { status: 'error' };
  return {
    status: 'ok',
    total: count ?? data.length,
    places: (
      data as (Omit<PlaceSummary, 'cropland_percent'> & {
        place_type_id: string;
      })[]
    ).map(row => ({ ...row, cropland_percent: null })),
  };
}

/**
 * Where one place sits in the list for the current query.
 * @param query - Search, sort, filters, and optional map extent.
 * @param id - `places.id`.
 * @param signal - Cancels the request when a newer one replaces it.
 * @returns The zero-based position, null when the place is not in the list, or why it could not be found.
 */
export async function loadPilotPlaceRank(
  query: Omit<PlaceWindowQuery, 'offset'>,
  id: string,
  signal?: AbortSignal
): Promise<PlaceRankResult> {
  if (!PLACE_ID.test(id)) return { status: 'ok', rank: null };
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const call = supabase.rpc('place_rank', {
    ...matchedArgs(query),
    p_sort: query.sort,
    p_id: id,
  });
  const { data, error } = await (signal ? call.abortSignal(signal) : call);
  if (error) return { status: 'error' };
  return { status: 'ok', rank: data === null ? null : Number(data) };
}

/**
 * How many stored places match the list query.
 * @param query - Search, filters, and optional map extent.
 * @returns The count, or why it could not be loaded.
 */
export async function loadPilotPlaceWindowCount(
  query: Omit<PlaceWindowQuery, 'sort'>
): Promise<PlaceCountResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const { data, error } = await supabase.rpc(
    'place_window_count',
    matchedArgs(query)
  );
  if (error || data === null) return { status: 'error' };
  return { status: 'ok', total: Number(data) };
}

/**
 * Size range and histogram counts for the filter charts.
 * @param placeType - Stored place type. Conservation areas when left out.
 * @returns The stored distribution, or why it could not be loaded.
 */
export async function loadPilotPlaceFilterStats(
  placeType: string = PLACE_TYPE
): Promise<PlaceFilterStatsResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const { data, error } = await supabase.rpc('place_filter_stats', {
    p_place_type: placeType,
  });
  if (error || !data?.[0]) return { status: 'error' };
  const row = data[0] as {
    place_count: number | string;
    size_min: number | null;
    size_max: number | null;
    size_bins: number[];
    cropland_bins: number[];
  };
  const sizeMin = row.size_min;
  const sizeMax = row.size_max;
  return {
    status: 'ok',
    stats: {
      placeCount: Number(row.place_count),
      sizeFull:
        sizeMin != null && sizeMax != null ? [sizeMin, sizeMax] : [1, 1],
      sizeBins: row.size_bins ?? [],
      croplandBins: row.cropland_bins ?? [],
    },
  };
}

/**
 * One published place and its preferred 2024 cropland figures. A place that was
 * merged into another opens the place it was merged into, whose id differs.
 * @param id - `places.id`.
 * @returns The place, or why it could not be opened.
 */
export async function loadPilotPlace(id: string): Promise<PlaceLoadResult> {
  if (!PLACE_ID.test(id)) return { status: 'missing' };
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };

  let { data: place, error } = await supabase
    .from('place_summaries')
    .select(PLACE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) return { status: 'error' };
  if (!place) {
    const { data: keptId, error: mergedError } = await supabase.rpc(
      'place_merged_into',
      { p_id: id }
    );
    if (mergedError) return { status: 'error' };
    if (typeof keptId !== 'string' || keptId === id)
      return { status: 'missing' };
    ({ data: place, error } = await supabase
      .from('place_summaries')
      .select(PLACE_COLUMNS)
      .eq('id', keptId)
      .maybeSingle());
    if (error) return { status: 'error' };
    if (!place) return { status: 'missing' };
  }

  const { data: stats, error: statsError } = await supabase
    .from('place_stats_preferred')
    .select('stat_id, value')
    .eq('place_id', place.id)
    .eq('period_start', CROPLAND_PERIOD_START)
    .in('stat_id', ['crops_area', 'crops_percent']);
  if (statsError) return { status: 'error' };
  const value = (statId: string): number | null =>
    (stats as { stat_id: string; value: number }[] | null)?.find(
      row => row.stat_id === statId
    )?.value ?? null;

  return {
    status: 'ok',
    place: {
      id: place.id,
      name: place.name,
      placeTypeId: place.place_type_id,
      designation: place.designation,
      iso3: place.iso3,
      areaKm2: place.area_km2,
      siteId: place.site_id,
      releaseMonth: place.release_month,
      sourceName: place.source_name,
      citation: place.citation,
      croplandKm2: value('crops_area'),
      percent: value('crops_percent'),
      tagline: place.tagline,
      description: place.description,
      source: {
        name: place.source_place_name,
        designation: place.source_designation,
        iso3: place.source_iso3,
      },
    },
  };
}

/**
 * Set or reset curated fields of one place. Admins only: the database checks the role.
 * @param id - `places.id`.
 * @param values - Only the fields to change. Null or blank resets a field.
 * @returns The stored curated values, or why they could not be saved.
 */
export async function curatePlace(
  id: string,
  values: Partial<PlaceCuration>
): Promise<CuratePlaceResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const { data, error } = await supabase.rpc('curate_place', {
    p_place_id: id,
    p_values: values,
  });
  if (error) return { status: 'error', message: error.message };
  const row = (Array.isArray(data) ? data[0] : data) as
    | (PlaceCuration & { place_id: string | null })
    | null;
  if (!row || !row.place_id) return { status: 'ok', curation: null };
  return {
    status: 'ok',
    curation: {
      display_name: row.display_name,
      tagline: row.tagline,
      description: row.description,
      designation: row.designation,
      iso3: row.iso3,
    },
  };
}

let designations: Promise<string[]> | null = null;

/**
 * Designations published places show, most used first, for edit mode to suggest.
 * Read once. A failed read is tried again next time.
 * @returns The designations, or an empty list when they could not be read.
 */
export function loadDesignations(): Promise<string[]> {
  if (designations) return designations;
  const supabase = placesClient();
  if (!supabase) return Promise.resolve([]);
  const read = (async () => {
    const { data, error } = await supabase.rpc('place_designations');
    if (error || !Array.isArray(data)) {
      designations = null;
      return [];
    }
    return (data as { designation: string }[]).map(row => row.designation);
  })();
  designations = read;
  return read;
}

/**
 * The curated values stored for one place, for edit mode.
 * @param id - `places.id`.
 * @returns The values, null when none are stored, or why they could not be read.
 */
export async function loadPlaceCuration(
  id: string
): Promise<CuratePlaceResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const { data, error } = await supabase
    .from('place_curations')
    .select('display_name, tagline, description, designation, iso3')
    .eq('place_id', id)
    .maybeSingle();
  if (error) return { status: 'error', message: error.message };
  return { status: 'ok', curation: (data as PlaceCuration | null) ?? null };
}

/**
 * The place as shown once curated values are applied over its source values.
 * @param place - The place as loaded.
 * @param curation - The stored curated values, or null when none are set.
 * @returns The place with its shown values replaced.
 */
export function applyCuration(
  place: PlaceDetail,
  curation: PlaceCuration | null
): PlaceDetail {
  return {
    ...place,
    name: curation?.display_name ?? place.source.name,
    designation: curation?.designation ?? place.source.designation,
    iso3: curation?.iso3?.join(';') ?? place.source.iso3,
    tagline: curation?.tagline ?? null,
    description: curation?.description ?? null,
  };
}

/** Badge order: the three with their own buttons, then the regional ones. */
const RECOGNITION_ORDER = [
  'world_heritage_site',
  'ramsar_site',
  'biosphere_reserve',
  'natura_2000_site',
  'emerald_site',
  'other_recognition',
];

/**
 * The published recognitions with a confirmed, unretired `recognises` link
 * to a place, ordered by type and then name. A recognition itself has none.
 * @param id - `places.id` of the recognised place.
 * @returns The recognitions, or why they could not be read.
 */
export async function loadPlaceRecognitions(
  id: string
): Promise<PlaceRecognitionsResult> {
  if (!PLACE_ID.test(id)) return { status: 'ok', recognitions: [] };
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const { data: links, error } = await supabase
    .from('place_relationships')
    .select('subject_place_id')
    .eq('object_place_id', id)
    .eq('relationship_type_id', 'recognises')
    .eq('status', 'confirmed')
    .is('retired_at', null);
  if (error) return { status: 'error' };
  const ids = [
    ...new Set(
      ((links as { subject_place_id: string }[] | null) ?? []).map(
        link => link.subject_place_id
      )
    ),
  ];
  if (ids.length === 0) return { status: 'ok', recognitions: [] };
  const { data: rows, error: rowsError } = await supabase
    .from('place_summaries')
    .select('id, name, place_type_id')
    .in('id', ids);
  if (rowsError) return { status: 'error' };
  const rank = (type: string) => {
    const index = RECOGNITION_ORDER.indexOf(type);
    return index === -1 ? RECOGNITION_ORDER.length : index;
  };
  const recognitions = (
    (rows as { id: string; name: string; place_type_id: string }[] | null) ?? []
  )
    .map(row => ({
      id: row.id,
      name: row.name,
      placeTypeId: row.place_type_id,
    }))
    .sort(
      (a, b) =>
        rank(a.placeTypeId) - rank(b.placeTypeId) ||
        a.name.localeCompare(b.name)
    );
  return { status: 'ok', recognitions };
}

/** Ids per `place_summaries` read, so the request address stays short. */
const LINKED_CHUNK = 150;

/** Rows per `place_relationships` read, the API's row limit. */
const LINK_PAGE = 1000;

/** Status of a link. `retired` is a link whose `retired_at` is set. */
export type LinkStatus = 'proposed' | 'confirmed' | 'rejected' | 'retired';

/** One way to link this place to another, read from this place's side. */
export interface LinkChoice {
  /** `place_relationship_types.id`. */
  typeId: string;
  /** This place is the subject. */
  outward: boolean;
  label: string;
}

/**
 * The link types an admin adds, from this place's side. The labels are
 * `label` and `inverse_label` in `place_relationship_types`.
 */
export const LINK_CHOICES: LinkChoice[] = [
  { typeId: 'recognises', outward: true, label: 'Recognises' },
  { typeId: 'recognises', outward: false, label: 'Recognised by' },
  { typeId: 'overlaps', outward: true, label: 'Overlaps' },
  { typeId: 'located_in', outward: true, label: 'Located in' },
  { typeId: 'located_in', outward: false, label: 'Contains' },
  { typeId: 'part_of', outward: true, label: 'Part of' },
  { typeId: 'part_of', outward: false, label: 'Has part' },
];

/**
 * How a link reads from this place's side.
 * @param typeId - `place_relationship_types.id`.
 * @param outward - This place is the subject.
 * @returns The label, such as `Contains`.
 */
export function linkLabel(typeId: string, outward: boolean): string {
  const choice =
    LINK_CHOICES.find(
      item =>
        item.typeId === typeId &&
        (item.outward === outward || item.typeId === 'overlaps')
    ) ?? null;
  return choice?.label ?? typeId;
}

/** A link between this place and another, from this place's side. */
export interface PlaceLink {
  id: string;
  typeId: string;
  /** This place is the subject. */
  outward: boolean;
  otherId: string;
  /** Null when the other place is not published. */
  otherName: string | null;
  otherTypeId: string | null;
  /** The other place's countries joined by `;`, for its card. */
  otherIso3: string | null;
  /** The other place's area, for its card. */
  otherAreaKm2: number | null;
  origin: 'manual' | 'imported' | 'derived';
  status: LinkStatus;
  /** Derived links: the share of this place inside the other. */
  coverage: number | null;
}

/** Result of reading a place's links. */
export type PlaceLinksResult =
  | { status: 'ok'; links: PlaceLink[] }
  | { status: 'unconfigured' }
  | { status: 'error' };

/** Result of setting a link's status. */
export type SetLinkResult =
  | { status: 'ok' }
  | { status: 'unconfigured' }
  | { status: 'error'; message: string };

/** Result of the place search in the add-link form. */
export type PlaceSearchResult =
  | { status: 'ok'; places: PlaceSummary[] }
  | { status: 'unconfigured' }
  | { status: 'error' };

interface LinkRow {
  id: string;
  subject_place_id: string;
  relationship_type_id: string;
  object_place_id: string;
  origin: PlaceLink['origin'];
  status: Exclude<LinkStatus, 'retired'>;
  subject_coverage: number | null;
  object_coverage: number | null;
  retired_at: string | null;
}

/**
 * Every link the reader may see with the place as subject or object. A visitor
 * sees confirmed links only. An admin sees every link, retired ones too.
 * @param id - `places.id`.
 * @param confirmedOnly - Only active confirmed links, for view mode.
 * @returns The links ordered by the other place's name, or why they could not be read.
 */
export async function loadPlaceLinks(
  id: string,
  confirmedOnly = false
): Promise<PlaceLinksResult> {
  if (!PLACE_ID.test(id)) return { status: 'ok', links: [] };
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const rows: LinkRow[] = [];
  for (const side of ['subject_place_id', 'object_place_id'] as const) {
    for (let from = 0; ; from += LINK_PAGE) {
      let call = supabase
        .from('place_relationships')
        .select(
          'id, subject_place_id, relationship_type_id, object_place_id, origin, status, subject_coverage, object_coverage, retired_at'
        )
        .eq(side, id);
      if (confirmedOnly)
        call = call.eq('status', 'confirmed').is('retired_at', null);
      const { data, error } = await call
        .order('id')
        .range(from, from + LINK_PAGE - 1);
      if (error) return { status: 'error' };
      const page = (data as LinkRow[] | null) ?? [];
      rows.push(...page);
      if (page.length < LINK_PAGE) break;
    }
  }
  const links = rows.map(row => {
    const outward = row.subject_place_id === id;
    return {
      id: row.id,
      typeId: row.relationship_type_id,
      outward,
      otherId: outward ? row.object_place_id : row.subject_place_id,
      otherName: null as string | null,
      otherTypeId: null as string | null,
      otherIso3: null as string | null,
      otherAreaKm2: null as number | null,
      origin: row.origin,
      status: (row.retired_at ? 'retired' : row.status) as LinkStatus,
      coverage: outward ? row.subject_coverage : row.object_coverage,
    };
  });
  const ids = [...new Set(links.map(link => link.otherId))];
  const chunks: string[][] = [];
  for (let start = 0; start < ids.length; start += LINKED_CHUNK)
    chunks.push(ids.slice(start, start + LINKED_CHUNK));
  const reads = await Promise.all(
    chunks.map(chunk =>
      supabase
        .from('place_summaries')
        .select('id, name, place_type_id, iso3, area_km2')
        .in('id', chunk)
    )
  );
  if (reads.some(read => read.error)) return { status: 'error' };
  const names = new Map(
    reads
      .flatMap(
        read =>
          (read.data as {
            id: string;
            name: string;
            place_type_id: string;
            iso3: string | null;
            area_km2: number | null;
          }[]) ?? []
      )
      .map(row => [row.id, row])
  );
  for (const link of links) {
    const other = names.get(link.otherId);
    link.otherName = other?.name ?? null;
    link.otherTypeId = other?.place_type_id ?? null;
    link.otherIso3 = other?.iso3 ?? null;
    link.otherAreaKm2 = other?.area_km2 ?? null;
  }
  links.sort((a, b) =>
    (a.otherName ?? '\uffff').localeCompare(b.otherName ?? '\uffff')
  );
  return { status: 'ok', links };
}

/**
 * Every active confirmed link to a published place, for the Related tab,
 * largest place first. One UNESCO-MAB site has over a thousand.
 * @param id - `places.id`.
 * @returns The links with the other place's card values, or why they could not be read.
 */
export async function loadRelatedPlaces(id: string): Promise<PlaceLinksResult> {
  const read = await loadPlaceLinks(id, true);
  if (read.status !== 'ok') return read;
  return {
    status: 'ok',
    links: read.links
      .filter(link => link.otherName !== null)
      .sort(
        (a, b) =>
          (b.otherAreaKm2 ?? -1) - (a.otherAreaKm2 ?? -1) ||
          (a.otherName ?? '').localeCompare(b.otherName ?? '')
      ),
  };
}

/**
 * Confirm, reject, or retire a link, or add a manual one. Admins only: the
 * database checks the role.
 * @param subjectId - `places.id` of the subject.
 * @param typeId - `place_relationship_types.id`.
 * @param objectId - `places.id` of the object.
 * @param status - The new status.
 * @returns Whether it was saved, or the database's message.
 */
export async function setPlaceRelationship(
  subjectId: string,
  typeId: string,
  objectId: string,
  status: LinkStatus
): Promise<SetLinkResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const { error } = await supabase.rpc('set_place_relationship', {
    p_subject_place_id: subjectId,
    p_relationship_type_id: typeId,
    p_object_place_id: objectId,
    p_status: status,
  });
  if (error) return { status: 'error', message: error.message };
  return { status: 'ok' };
}

/** Places the add-link search offers at once. */
export const PLACE_SEARCH_LIMIT = 8;

/**
 * Published places of any type whose shown or source name contains the text,
 * largest first.
 * @param text - What was typed.
 * @param signal - Cancels the request when a newer one replaces it.
 * @returns Up to `PLACE_SEARCH_LIMIT` places, or why they could not be read.
 */
export async function searchPlaces(
  text: string,
  signal?: AbortSignal
): Promise<PlaceSearchResult> {
  const needle = text.trim();
  if (!needle) return { status: 'ok', places: [] };
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const escaped = needle.replace(/[\\%_]/g, match => `\\${match}`);
  // Quoted, so a comma or bracket in the search does not split the `or` filter.
  const pattern = `"${`%${escaped}%`.replace(/["\\]/g, match => `\\${match}`)}"`;
  const call = supabase
    .from('place_summaries')
    .select('id, name, designation, iso3, area_km2, place_type_id')
    .or(`name.ilike.${pattern},source_place_name.ilike.${pattern}`)
    .order('area_km2', { ascending: false, nullsFirst: false })
    .order('name')
    .limit(PLACE_SEARCH_LIMIT);
  const { data, error } = await (signal ? call.abortSignal(signal) : call);
  if (error || !data) return { status: 'error' };
  return {
    status: 'ok',
    places: (data as Omit<PlaceSummary, 'cropland_percent'>[]).map(row => ({
      ...row,
      cropland_percent: null,
    })),
  };
}

/**
 * West, south, east, north of one place, so the map can move to it.
 * The boundary itself comes from the tiles. The shape is never downloaded.
 * @param id - `places.id`.
 * @returns The extent, or why it could not be found.
 */
export async function loadPlaceBounds(id: string): Promise<PlaceBoundsResult> {
  if (!PLACE_ID.test(id)) return { status: 'missing' };
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const { data, error } = await supabase.rpc('place_bounds', { p_id: id });
  if (error || !data) return { status: 'error' };
  const row = (
    data as {
      west: number;
      south: number;
      east: number;
      north: number;
    }[]
  )[0];
  if (!row) return { status: 'missing' };
  return {
    status: 'ok',
    bounds: [row.west, row.south, row.east, row.north],
  };
}

/**
 * WDPCA release month of the stored conservation areas, for the map notice.
 * @returns The month, or why it could not be read.
 */
export async function loadPlaceRelease(): Promise<PlaceReleaseResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const { data, error } = await supabase
    .from('place_summaries')
    .select('release_month')
    .eq('place_type_id', PLACE_TYPE)
    .limit(1)
    .maybeSingle();
  if (error) return { status: 'error' };
  return { status: 'ok', releaseMonth: data?.release_month ?? null };
}
