import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  CROPLAND_METHOD_ID,
  CROPLAND_SPROUT_ID,
  buildPlaceFeatures,
  type PlaceBoundary,
  type PlaceFactRow,
  type PlaceFeatureCollection,
} from '@/places/display';

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
 * Pilot protected areas, ordered by name, with their stored cropland percent.
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
