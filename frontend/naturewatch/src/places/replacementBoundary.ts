import turfArea from '@turf/area';
import type { Geometry, MultiPolygon, Polygon, Position } from 'geojson';
import { placesClient } from '@/places/api';

/**
 * A replacement boundary: a GeoJSON file read in the browser, or the current
 * boundary edited on the map, stored as a proposed version through
 * `submit_boundary`, then approved or discarded.
 */

/** The largest file read. */
export const BOUNDARY_FILE_MAX_BYTES = 10 * 1024 * 1024;
/** The most points a shape can have, as `submit_boundary` allows. */
export const BOUNDARY_POINTS_MAX = 100_000;
/** The most points a boundary can have to be edited on the map. */
export const EDIT_POINTS_MAX = 5000;

/** A shape read from a file, ready to submit. */
export interface BoundaryShape {
  shape: MultiPolygon;
  points: number;
  areaKm2: number;
}

export type BoundaryFileResult =
  | ({ ok: true } & BoundaryShape)
  | { ok: false; message: string };

/** A place's proposed boundary. */
export interface ProposedBoundary {
  boundaryId: string;
  areaKm2: number;
  points: number;
  sourceUrl: string | null;
  submittedBy: string | null;
  createdAt: string;
  /** The boundary it was edited from on the map, or null for an upload. */
  derivedFrom: string | null;
  shape: MultiPolygon;
}

/** A place's current boundary, with its shape when it can be edited. */
export interface CurrentBoundary {
  boundaryId: string;
  points: number;
  /** Null when it has more than `EDIT_POINTS_MAX` points. */
  shape: MultiPolygon | null;
}

export type CurrentBoundaryResult =
  | { status: 'ok'; current: CurrentBoundary | null }
  | { status: 'unconfigured' }
  | { status: 'error' };

export type ProposedBoundaryResult =
  | { status: 'ok'; proposed: ProposedBoundary | null }
  | { status: 'unconfigured' }
  | { status: 'error' };

const NOT_POLYGON = 'The file must hold a polygon or a multipolygon.';

/**
 * The polygons of a GeoJSON value, or why it has none that can be used.
 * @param value - Parsed GeoJSON: a geometry, a Feature, or a FeatureCollection.
 * @returns Each polygon's rings, or a message.
 */
function polygonsOf(value: unknown): Position[][][] | string {
  if (!value || typeof value !== 'object') return NOT_POLYGON;
  const item = value as {
    type?: unknown;
    geometry?: unknown;
    features?: unknown;
    coordinates?: unknown;
  };
  if (item.type === 'FeatureCollection') {
    if (!Array.isArray(item.features) || item.features.length === 0)
      return 'The file has no features.';
    const all: Position[][][] = [];
    for (const feature of item.features) {
      const polygons = polygonsOf(feature);
      if (typeof polygons === 'string') return polygons;
      all.push(...polygons);
    }
    return all;
  }
  if (item.type === 'Feature') return polygonsOf(item.geometry);
  if (!Array.isArray(item.coordinates)) return NOT_POLYGON;
  if (item.type === 'Polygon') return [item.coordinates as Position[][]];
  if (item.type === 'MultiPolygon') return item.coordinates as Position[][][];
  return NOT_POLYGON;
}

/**
 * Whether a `crs` member, if any, names longitude and latitude.
 * @param value - Parsed GeoJSON.
 */
function inLongitudeLatitude(value: unknown): boolean {
  const crs = (value as { crs?: { properties?: { name?: unknown } } }).crs;
  if (crs === undefined || crs === null) return true;
  const name = String(crs.properties?.name ?? '');
  return /CRS84$|EPSG::?4326$/.test(name);
}

/**
 * Read a boundary from GeoJSON text: a Polygon, a MultiPolygon, a Feature, or
 * a FeatureCollection of polygonal features, made one MultiPolygon. Heights
 * are dropped.
 * @param text - The file's text.
 * @returns The shape with its point count and area, or why it was refused.
 */
export function parseBoundary(text: string): BoundaryFileResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, message: 'The file is not GeoJSON.' };
  }
  if (!inLongitudeLatitude(value))
    return {
      ok: false,
      message: 'The file must be in longitude and latitude (WGS 84).',
    };
  const polygons = polygonsOf(value);
  if (typeof polygons === 'string') return { ok: false, message: polygons };
  if (polygons.length === 0)
    return { ok: false, message: 'The shape is empty.' };

  return checkPolygons(polygons);
}

/**
 * Check a shape's polygons and make them one MultiPolygon, without heights.
 * @param polygons - Each polygon's rings.
 * @returns The shape with its point count and area, or why it was refused.
 */
function checkPolygons(polygons: Position[][][]): BoundaryFileResult {
  if (polygons.length === 0)
    return { ok: false, message: 'The shape is empty.' };
  let points = 0;
  const coordinates: Position[][][] = [];
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length === 0)
      return { ok: false, message: 'The shape is empty.' };
    const rings: Position[][] = [];
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4)
        return {
          ok: false,
          message: 'Each ring of the shape needs at least four points.',
        };
      const flat: Position[] = [];
      for (const point of ring) {
        const [x, y] = Array.isArray(point) ? point : [];
        if (typeof x !== 'number' || typeof y !== 'number')
          return { ok: false, message: 'The file is not GeoJSON.' };
        if (x < -180 || x > 180 || y < -90 || y > 90)
          return {
            ok: false,
            message: 'The file must be in longitude and latitude (WGS 84).',
          };
        flat.push([x, y]);
      }
      points += flat.length;
      rings.push(flat);
    }
    coordinates.push(rings);
  }
  if (points > BOUNDARY_POINTS_MAX)
    return {
      ok: false,
      message: `The shape has ${points.toLocaleString('en-GB')} points. At most ${BOUNDARY_POINTS_MAX.toLocaleString('en-GB')} can be uploaded.`,
    };
  const shape: MultiPolygon = { type: 'MultiPolygon', coordinates };
  return { ok: true, shape, points, areaKm2: turfArea(shape) / 1e6 };
}

/**
 * Check a shape edited on the map, as an uploaded one is checked.
 * @param shape - The edited Polygon or MultiPolygon.
 * @returns The shape with its point count and area, or why it was refused.
 */
export function checkEditedShape(
  shape: Polygon | MultiPolygon
): BoundaryFileResult {
  return checkPolygons(
    shape.type === 'Polygon' ? [shape.coordinates] : shape.coordinates
  );
}

/**
 * Read a boundary from a GeoJSON file.
 * @param file - The chosen file.
 * @returns The shape, or why it was refused.
 */
export async function readBoundaryFile(
  file: File
): Promise<BoundaryFileResult> {
  if (file.size > BOUNDARY_FILE_MAX_BYTES)
    return { ok: false, message: 'The file is larger than 10 MB.' };
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, message: 'The file could not be read.' };
  }
  return parseBoundary(text);
}

/**
 * Store a shape as the place's proposed boundary. Admins only.
 * @param placeId - `places.id`.
 * @param shape - The shape.
 * @param sourceUrl - Where it comes from, or null.
 * @param derivedFrom - The current boundary it was edited from, or null for an upload.
 * @returns Null when it was stored, or why it was not.
 */
export async function submitBoundary(
  placeId: string,
  shape: MultiPolygon,
  sourceUrl: string | null,
  derivedFrom: string | null = null
): Promise<string | null> {
  const supabase = placesClient();
  if (!supabase) return 'The database is not configured.';
  const { error } = await supabase.rpc('submit_boundary', {
    p_place_id: placeId,
    p_geojson: shape,
    p_source_url: sourceUrl,
    p_derived_from_boundary_id: derivedFrom,
  });
  return error ? error.message : null;
}

/**
 * Run one of the proposed boundary decisions.
 * @param rpc - The function.
 * @param boundaryId - `place_boundaries.id`.
 * @returns Null when it was stored, or why it was not.
 */
async function decide(
  rpc: 'approve_boundary' | 'reject_boundary',
  boundaryId: string
): Promise<string | null> {
  const supabase = placesClient();
  if (!supabase) return 'The database is not configured.';
  const { error } = await supabase.rpc(rpc, { p_boundary_id: boundaryId });
  return error ? error.message : null;
}

/**
 * Make a proposed boundary current. Admins only.
 * @param boundaryId - `place_boundaries.id`.
 * @returns Null when it was stored, or why it was not.
 */
export function approveBoundary(boundaryId: string): Promise<string | null> {
  return decide('approve_boundary', boundaryId);
}

/**
 * Discard a proposed boundary. Admins only.
 * @param boundaryId - `place_boundaries.id`.
 * @returns Null when it was stored, or why it was not.
 */
export function rejectBoundary(boundaryId: string): Promise<string | null> {
  return decide('reject_boundary', boundaryId);
}

/**
 * Read a place's proposed boundary, with its shape. Admins only.
 * @param placeId - `places.id`.
 * @returns The proposed boundary, null when there is none, or why it could not be read.
 */
export async function loadProposedBoundary(
  placeId: string
): Promise<ProposedBoundaryResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const { data, error } = await supabase.rpc('proposed_boundary', {
    p_place_id: placeId,
  });
  if (error || !Array.isArray(data)) return { status: 'error' };
  const row = data[0];
  if (!row) return { status: 'ok', proposed: null };
  return {
    status: 'ok',
    proposed: {
      boundaryId: row.boundary_id,
      areaKm2: row.area_km2,
      points: row.points,
      sourceUrl: row.source_url,
      submittedBy: row.submitted_by,
      createdAt: row.created_at,
      derivedFrom: row.derived_from_boundary_id ?? null,
      shape: row.shape as Geometry as MultiPolygon,
    },
  };
}

/**
 * Read a place's current boundary, with its shape when it has at most
 * `EDIT_POINTS_MAX` points. Admins only.
 * @param placeId - `places.id`.
 * @returns The current boundary, null when there is none, or why it could not be read.
 */
export async function loadCurrentBoundary(
  placeId: string
): Promise<CurrentBoundaryResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const { data, error } = await supabase.rpc('current_boundary_shape', {
    p_place_id: placeId,
  });
  if (error || !Array.isArray(data)) return { status: 'error' };
  const row = data[0];
  if (!row) return { status: 'ok', current: null };
  return {
    status: 'ok',
    current: {
      boundaryId: row.boundary_id,
      points: row.points,
      shape: (row.shape as MultiPolygon | null) ?? null,
    },
  };
}
