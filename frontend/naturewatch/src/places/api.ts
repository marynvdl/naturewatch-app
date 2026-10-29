import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  CROPLAND_METHOD_ID,
  CROPLAND_SPROUT_ID,
  buildPlaceFeatures,
  type FigureRange,
  type LngLatBounds,
  type PlaceBoundary,
  type PlaceFactRow,
  type PlaceFeatureCollection,
  type PlaceSort,
} from '@/places/display';

/** Cards the places list shows at once. */
export const PLACE_LIST_LIMIT = 50;

/** A card on the places list. */
export interface PlaceSummary {
  id: string;
  name: string;
  designation: string | null;
  iso3: string | null;
  area_km2: number | null;
  /** Stored cropland percent, or null when no fact is stored. */
  cropland_percent: number | null;
}

/** A protected area and its stored cropland figure, when one exists. */
export interface PlaceDetail {
  id: string;
  name: string;
  designation: string | null;
  iso3: string | null;
  areaKm2: number | null;
  siteId: string | null;
  releaseMonth: string;
  sourceName: string;
  croplandKm2: number | null;
  percent: number | null;
}

/** Result of loading the pilot list. */
export type PlaceListResult =
  | { status: 'ok'; places: PlaceSummary[] }
  | { status: 'unconfigured' }
  | { status: 'error' };

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

/** Result of loading the ids the map filter keeps. */
export type PlaceKeptIdsResult =
  | { status: 'ok'; ids: string[] }
  | { status: 'unconfigured' }
  | { status: 'error' };

type WindowRow = PlaceSummary & { total_count: number | string };

/** Result of opening one place. */
export type PlaceLoadResult =
  | { status: 'ok'; place: PlaceDetail }
  | { status: 'missing' }
  | { status: 'unconfigured' }
  | { status: 'error' };

/** Result of loading the shapes drawn on the map. */
export type PlaceMapResult =
  | { status: 'ok'; features: PlaceFeatureCollection; releaseMonth: string }
  | { status: 'unconfigured' }
  | { status: 'error' };

const PLACE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let client: SupabaseClient | null | undefined;

/**
 * Browser client for place attributes and facts.
 * Returns null when the URL or anon key is not set. The service-role key is never used.
 * @returns The shared client, or null.
 */
export function placesClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    client = null;
    return null;
  }
  client = createClient(url, key);
  return client;
}

/**
 * Arguments the list window RPC expects.
 * @param query - Search, sort, filters, and optional extent.
 * @returns Named arguments for `pilot_place_window`.
 */
function windowArgs(query: PlaceWindowQuery) {
  return {
    p_search: query.search.trim(),
    p_search_prefix: query.searchPrefix,
    p_sort: query.sort,
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
 * Pilot protected areas, ordered by name, with their stored cropland percent.
 * Used by `/places`. The map list uses `loadPilotPlaceWindow`.
 * @returns The list, or why it could not be loaded.
 */
export async function loadPilotPlaces(): Promise<PlaceListResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const { data, error } = await supabase
    .from('pilot_places')
    .select('id, name, designation, iso3, area_km2')
    .order('name');
  if (error || !data) return { status: 'error' };

  const { data: facts, error: factError } = await supabase
    .from('facts')
    .select('place_id, percent')
    .eq('sprout_id', CROPLAND_SPROUT_ID)
    .eq('method_id', CROPLAND_METHOD_ID);
  if (factError || !facts) return { status: 'error' };

  const percent = new Map(facts.map(fact => [fact.place_id, fact.percent]));
  return {
    status: 'ok',
    places: data.map(place => ({
      ...place,
      cropland_percent: percent.get(place.id) ?? null,
    })),
  };
}

/**
 * At most 50 pilot places for the current list query, plus how many match.
 * @param query - Search, sort, filters, and optional map extent.
 * @returns The window, or why it could not be loaded.
 */
export async function loadPilotPlaceWindow(
  query: PlaceWindowQuery
): Promise<PlaceWindowResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const { data, error } = await supabase.rpc('pilot_place_window', {
    ...windowArgs(query),
    p_limit: PLACE_LIST_LIMIT,
  });
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
    'pilot_place_window_count',
    windowArgs({ ...query, sort: 'size-desc' })
  );
  if (error || data === null) return { status: 'error' };
  return { status: 'ok', total: Number(data) };
}

/**
 * Size range and histogram counts for the filter charts.
 * @returns The stored distribution, or why it could not be loaded.
 */
export async function loadPilotPlaceFilterStats(): Promise<PlaceFilterStatsResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const { data, error } = await supabase.rpc('pilot_place_filter_stats');
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
 * Ids the size and cropland filter keeps on the map.
 * @param sizeMin - Lowest kept size, or null when that end is open.
 * @param sizeMax - Highest kept size, or null when that end is open.
 * @param cropland - Kept cropland percent.
 * @returns The ids, or why they could not be loaded.
 */
export async function loadPilotPlaceKeptIds(
  sizeMin: number | null,
  sizeMax: number | null,
  cropland: FigureRange
): Promise<PlaceKeptIdsResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const { data, error } = await supabase.rpc('pilot_place_kept_ids', {
    p_size_min: sizeMin,
    p_size_max: sizeMax,
    p_crop_min: cropland[0],
    p_crop_max: cropland[1],
  });
  if (error || !data) return { status: 'error' };
  return { status: 'ok', ids: data as string[] };
}

/**
 * One pilot place and its cropland fact for the 2024 sprout.
 * @param id - `places.id`.
 * @returns The place, or why it could not be opened.
 */
export async function loadPilotPlace(id: string): Promise<PlaceLoadResult> {
  if (!PLACE_ID.test(id)) return { status: 'missing' };
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };

  const { data: place, error } = await supabase
    .from('pilot_places')
    .select(
      'id, name, designation, iso3, area_km2, site_id, release_month, source_name'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) return { status: 'error' };
  if (!place) return { status: 'missing' };

  const { data: fact, error: factError } = await supabase
    .from('facts')
    .select('area_km2, percent')
    .eq('place_id', id)
    .eq('sprout_id', CROPLAND_SPROUT_ID)
    .eq('method_id', CROPLAND_METHOD_ID)
    .maybeSingle();
  if (factError) return { status: 'error' };

  return {
    status: 'ok',
    place: {
      id: place.id,
      name: place.name,
      designation: place.designation,
      iso3: place.iso3,
      areaKm2: place.area_km2,
      siteId: place.site_id,
      releaseMonth: place.release_month,
      sourceName: place.source_name,
      croplandKm2: fact?.area_km2 ?? null,
      percent: fact?.percent ?? null,
    },
  };
}

/**
 * Stored pilot boundaries and their cropland figures, for drawing on the map.
 * The app does not offer a file download.
 * @returns The feature collection, or why it could not be loaded.
 */
export async function loadPlaceMap(): Promise<PlaceMapResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };

  const { data: boundaries, error } = await supabase
    .from('pilot_place_map')
    .select('id, name, site_id, source_name, release_month, geom');
  if (error || !boundaries) return { status: 'error' };

  const { data: facts, error: factError } = await supabase
    .from('facts')
    .select('place_id, area_km2, percent')
    .eq('sprout_id', CROPLAND_SPROUT_ID)
    .eq('method_id', CROPLAND_METHOD_ID);
  if (factError || !facts) return { status: 'error' };

  const features = buildPlaceFeatures(
    boundaries as PlaceBoundary[],
    facts as PlaceFactRow[]
  );
  const releaseMonth = boundaries[0]?.release_month ?? '';
  return { status: 'ok', features, releaseMonth };
}
