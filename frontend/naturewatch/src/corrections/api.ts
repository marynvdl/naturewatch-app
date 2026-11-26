import type { MultiPolygon, Polygon } from 'geojson';
import { placesClient } from '@/places/api';
import { EXTENSIONS, fileSha256, uploadProblem } from '@/places/images';
import type { CatalogCorrectionAction } from '@/catalog/types';

/** A correction as the form sends it. */
export interface CorrectionInput {
  layerId: string;
  layerVersion: string | null;
  polygon: Polygon;
  years: number[];
  action: CatalogCorrectionAction;
  value: Record<string, number> | null;
  note: string | null;
}

/**
 * Store a correction as submitted.
 * @param input - The correction.
 * @returns The new id, or the error message.
 */
export async function submitCorrection(
  input: CorrectionInput
): Promise<{ id: string } | { error: string }> {
  const supabase = placesClient();
  if (!supabase) return { error: 'The place store is not configured.' };
  const { data, error } = await supabase.rpc('submit_correction', {
    p_layer_id: input.layerId,
    p_layer_version: input.layerVersion,
    p_geojson: input.polygon,
    p_years: input.years,
    p_action: input.action,
    p_value: input.value,
    p_note: input.note,
  });
  if (error) return { error: error.message };
  return { id: data as string };
}

/** The private Storage bucket for correction photos. */
export const CORRECTION_PHOTO_BUCKET = 'correction-photos';
/** The most photos a correction holds, as `set_correction_photos` allows. */
export const CORRECTION_PHOTO_MAX = 6;
/** How long a signed photo link works, in seconds. */
const SIGNED_URL_SECONDS = 3600;

export type CorrectionStatus = 'submitted' | 'approved' | 'rejected';

/** A stored correction, as the list and the outlines read it. */
export interface StoredCorrection {
  id: string;
  layerId: string;
  layerVersion: string | null;
  years: number[];
  action: CatalogCorrectionAction;
  value: Record<string, number> | null;
  note: string | null;
  photoPaths: string[];
  status: CorrectionStatus;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  geometry: MultiPolygon;
}

/** One page of corrections. */
export type CorrectionPage =
  | { status: 'ok'; corrections: StoredCorrection[]; total: number }
  | { status: 'error'; message: string };

interface CorrectionRow {
  id: string;
  layer_id: string;
  layer_version: string | null;
  years: number[];
  action: CatalogCorrectionAction;
  value: Record<string, number> | null;
  note: string | null;
  photo_paths: string[] | null;
  review_status: CorrectionStatus;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  geojson: MultiPolygon;
  total_count: number;
}

/**
 * Read corrections with any of the statuses, newest first.
 * @param statuses - The statuses to list.
 * @param limit - At most this many, up to 1000.
 * @param offset - Rows to skip.
 */
export async function loadCorrections(
  statuses: CorrectionStatus[],
  limit: number,
  offset = 0
): Promise<CorrectionPage> {
  const supabase = placesClient();
  if (!supabase)
    return { status: 'error', message: 'The place store is not configured.' };
  const { data, error } = await supabase.rpc('admin_correction_list', {
    p_statuses: statuses,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) return { status: 'error', message: error.message };
  const rows = (data ?? []) as CorrectionRow[];
  return {
    status: 'ok',
    total: rows.length ? Number(rows[0].total_count) : 0,
    corrections: rows.map(row => ({
      id: row.id,
      layerId: row.layer_id,
      layerVersion: row.layer_version,
      years: row.years,
      action: row.action,
      value: row.value,
      note: row.note,
      photoPaths: row.photo_paths ?? [],
      status: row.review_status,
      reviewNote: row.review_note,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
      geometry: row.geojson,
    })),
  };
}

/**
 * Approve or reject a correction, or set it back to submitted.
 * @param id - The correction.
 * @param status - The new status.
 * @param note - A review note, or null.
 * @returns Null when saved, or the error message.
 */
export async function reviewCorrection(
  id: string,
  status: CorrectionStatus,
  note: string | null
): Promise<string | null> {
  const supabase = placesClient();
  if (!supabase) return 'The place store is not configured.';
  const { error } = await supabase.rpc('review_correction', {
    p_id: id,
    p_status: status,
    p_note: note,
  });
  return error ? error.message : null;
}

/**
 * Replace a correction's photo paths.
 * @param id - The correction.
 * @param paths - Object paths under the correction's id.
 * @returns Null when saved, or the error message.
 */
export async function setCorrectionPhotos(
  id: string,
  paths: string[]
): Promise<string | null> {
  const supabase = placesClient();
  if (!supabase) return 'The place store is not configured.';
  const { error } = await supabase.rpc('set_correction_photos', {
    p_id: id,
    p_paths: paths,
  });
  return error ? error.message : null;
}

/**
 * Store a photo under the correction's id, named by its SHA-256. A file stored
 * before is kept as it is.
 * @param id - The correction.
 * @param file - A JPEG, PNG, or WebP file of at most 10 MB.
 * @returns The object path, or the error message.
 */
export async function uploadCorrectionPhoto(
  id: string,
  file: File
): Promise<{ path: string } | { error: string }> {
  const problem = uploadProblem(file);
  if (problem) return { error: problem };
  const supabase = placesClient();
  if (!supabase) return { error: 'The place store is not configured.' };
  let sha256: string;
  try {
    sha256 = await fileSha256(file);
  } catch {
    return { error: 'The file could not be read.' };
  }
  const path = `${id}/${sha256}.${EXTENSIONS[file.type]}`;
  const { error } = await supabase.storage
    .from(CORRECTION_PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  const stored =
    !error ||
    /exists|duplicate/i.test(error.message) ||
    (error as { statusCode?: string }).statusCode === '409';
  return stored ? { path } : { error: error.message };
}

/**
 * Delete stored photo objects. A failure leaves an unused object behind and is
 * not shown.
 * @param paths - Object paths.
 */
export async function removeCorrectionPhotoObjects(paths: string[]) {
  const supabase = placesClient();
  if (!supabase || paths.length === 0) return;
  await supabase.storage.from(CORRECTION_PHOTO_BUCKET).remove(paths);
}

/**
 * Signed links to stored photos.
 * @param paths - Object paths.
 * @returns A link for each path that could be signed.
 */
export async function photoUrls(
  paths: string[]
): Promise<Record<string, string>> {
  const supabase = placesClient();
  if (!supabase || paths.length === 0) return {};
  const { data } = await supabase.storage
    .from(CORRECTION_PHOTO_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS);
  const urls: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
  }
  return urls;
}
