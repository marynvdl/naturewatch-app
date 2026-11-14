/** Photographs of places: reads for the profile, and the admin writes. */
import { placesClient } from '@/places/api';
import {
  COMMONS_DISPLAY_WIDTH,
  COMMONS_THUMB_WIDTH,
  IMAGE_LICENCES,
  IMAGE_TYPES,
  commonsFileUrl,
  licenceShortName,
} from '@/places/commons';
import type { PlacePhoto } from '@/places/photos';

/** The Storage bucket uploads go to. */
export const IMAGE_BUCKET = 'place-images';
/** Largest upload, as the bucket allows. */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/** A park at least this share inside a recognition can use its photographs. */
export const RECOGNITION_IMAGE_COVERAGE = 0.75;
/** A recognition offers at most this many photographs of its conservation areas. */
export const AREA_IMAGE_LIMIT = 10;
/** Place ids per read, to keep the request address short. */
const ID_CHUNK = 150;
/** Link rows per read. */
const LINK_PAGE = 1000;

const PLACE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const LINK_COLUMNS =
  'place_id, image_id, status, is_primary, gallery_position, caption, alt_text, suggested_by_pipeline, suggestion_score, created_at, ' +
  'image:images(storage_path, external_url, source_id, source_record_id, source_url, creator_name, width, height, image_status, ' +
  'licence:licences(id, title, url), source:sources(title))';

export type PlaceImageStatus =
  | 'suggested'
  | 'approved'
  | 'rejected'
  | 'withdrawn';

/** One photograph linked to a place. */
export interface PlaceImage {
  placeId: string;
  imageId: string;
  status: PlaceImageStatus;
  isPrimary: boolean;
  position: number | null;
  caption: string | null;
  altText: string;
  suggestedByPipeline: string | null;
  createdAt: string;
  src: string;
  thumbnail: string;
  creator: string;
  sourceId: string;
  sourceTitle: string;
  sourceUrl: string | null;
  licenceId: string;
  licenceTitle: string;
  licenceUrl: string;
}

/** Photographs of one related place. */
export interface ImageGroup {
  placeId: string;
  name: string;
  images: PlaceImage[];
}

export interface ImageLicence {
  id: string;
  title: string;
}

/** A photograph to store. Exactly one of `storage_path` and `external_url`. */
export interface NewPlaceImage {
  storage_path?: string;
  external_url?: string;
  source_id: 'wikimedia-commons' | 'sooty-earth-contributors';
  source_record_id?: string;
  source_url?: string;
  creator_name: string;
  licence_id: string;
  sha256?: string;
  width?: number;
  height?: number;
  caption?: string;
  alt_text: string;
}

/** What `set_place_image` changes. */
export interface PlaceImageValues {
  status?: 'approved' | 'rejected';
  caption?: string | null;
  alt_text?: string;
  is_primary?: boolean;
}

export type PlaceImagesResult =
  | { status: 'ok'; images: PlaceImage[] }
  | { status: 'unconfigured' }
  | { status: 'error' };

export type BorrowedImagesResult =
  | {
      status: 'ok';
      /** From the recognitions this place lies inside. */
      fromRecognitions: ImageGroup[];
      /** From the conservation areas inside this place, at most AREA_IMAGE_LIMIT. */
      fromAreas: ImageGroup[];
      /** How many photographs the conservation areas could offer in all. */
      areasTotal: number;
    }
  | { status: 'unconfigured' }
  | { status: 'error' };

export type ImageLicencesResult =
  | { status: 'ok'; licences: ImageLicence[] }
  | { status: 'unconfigured' }
  | { status: 'error' };

export type ImageWriteResult =
  | { status: 'ok' }
  | { status: 'unconfigured' }
  | { status: 'error'; message: string };

export type UploadResult =
  | {
      status: 'ok';
      storagePath: string;
      sha256: string;
      width: number;
      height: number;
    }
  | { status: 'unconfigured' }
  | { status: 'error'; message: string };

interface LinkRow {
  place_id: string;
  image_id: string;
  status: PlaceImageStatus;
  is_primary: boolean;
  gallery_position: number | null;
  caption: string | null;
  alt_text: string;
  suggested_by_pipeline: string | null;
  created_at: string;
  image: {
    storage_path: string | null;
    external_url: string | null;
    source_id: string;
    source_record_id: string | null;
    source_url: string | null;
    creator_name: string;
    image_status: string;
    licence: { id: string; title: string; url: string } | null;
    source: { title: string } | null;
  } | null;
}

/**
 * Main photograph first, then the gallery order, then the oldest.
 * @param a - One photograph.
 * @param b - Another.
 * @returns A sort order.
 */
export function byGallery(a: PlaceImage, b: PlaceImage): number {
  if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
  return (a.position ?? Infinity) - (b.position ?? Infinity);
}

/**
 * The profile's photograph for one approved link.
 * @param image - The link and its image.
 * @returns What `PlacePhotos` shows.
 */
export function toPlacePhoto(image: PlaceImage): PlacePhoto {
  return {
    src: image.src,
    thumbnail: image.thumbnail,
    alt: image.altText,
    title: image.caption ?? undefined,
    photographer: image.creator,
    source: {
      name: image.sourceTitle,
      url: image.sourceUrl ?? undefined,
    },
    licence: {
      name: licenceShortName(image.licenceId),
      url: image.licenceUrl,
    },
  };
}

/**
 * The approved photographs of a place, as the profile shows them.
 * @param images - Every link the reader can see.
 * @returns Main first, then in gallery order.
 */
export function approvedPhotos(images: PlaceImage[]): PlacePhoto[] {
  return images
    .filter(image => image.status === 'approved')
    .sort(byGallery)
    .map(toPlacePhoto);
}

/** Turn a row into a photograph, or null when its image is hidden or removed. */
function fromRow(row: LinkRow): PlaceImage | null {
  const image = row.image;
  if (!image || image.image_status !== 'active' || !image.licence) return null;
  const supabase = placesClient();
  let src = image.external_url ?? '';
  let thumbnail = src;
  if (image.storage_path && supabase) {
    src = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(image.storage_path)
      .data.publicUrl;
    thumbnail = src;
  } else if (
    image.source_id === 'wikimedia-commons' &&
    image.source_record_id
  ) {
    src = commonsFileUrl(image.source_record_id, COMMONS_DISPLAY_WIDTH);
    thumbnail = commonsFileUrl(image.source_record_id, COMMONS_THUMB_WIDTH);
  }
  return {
    placeId: row.place_id,
    imageId: row.image_id,
    status: row.status,
    isPrimary: row.is_primary,
    position: row.gallery_position,
    caption: row.caption,
    altText: row.alt_text,
    suggestedByPipeline: row.suggested_by_pipeline,
    createdAt: row.created_at,
    src,
    thumbnail,
    creator: image.creator_name,
    sourceId: image.source_id,
    sourceTitle: image.source?.title ?? image.source_id,
    sourceUrl: image.source_url,
    licenceId: image.licence.id,
    licenceTitle: image.licence.title,
    licenceUrl: image.licence.url,
  };
}

/** Read photograph links, oldest first, in chunks of place ids. */
async function readLinks(
  placeIds: string[],
  approvedOnly: boolean
): Promise<PlaceImage[] | null> {
  const supabase = placesClient();
  if (!supabase) return null;
  const chunks: string[][] = [];
  for (let start = 0; start < placeIds.length; start += ID_CHUNK)
    chunks.push(placeIds.slice(start, start + ID_CHUNK));
  const reads = await Promise.all(
    chunks.map(chunk => {
      let call = supabase
        .from('place_images')
        .select(LINK_COLUMNS)
        .in('place_id', chunk);
      if (approvedOnly) call = call.eq('status', 'approved');
      return call.order('created_at');
    })
  );
  if (reads.some(read => read.error)) return null;
  return reads
    .flatMap(read => (read.data as unknown as LinkRow[] | null) ?? [])
    .map(fromRow)
    .filter((image): image is PlaceImage => image !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Every photograph linked to a place that the reader can see. A visitor sees
 * the approved ones, and an admin sees all.
 * @param id - The place id.
 * @returns The photographs, main first, then in gallery order.
 */
export async function loadPlaceImages(id: string): Promise<PlaceImagesResult> {
  if (!PLACE_ID.test(id)) return { status: 'ok', images: [] };
  if (!placesClient()) return { status: 'unconfigured' };
  const images = await readLinks([id], false);
  if (!images) return { status: 'error' };
  return { status: 'ok', images: images.sort(byGallery) };
}

/**
 * The main photograph of each place, for place cards: the one marked main,
 * or else the first in the gallery.
 * @param ids - Place ids.
 * @returns Thumbnail addresses by place id. Places without one are left out.
 */
export async function loadMainPhotos(
  ids: string[]
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter(id => PLACE_ID.test(id)))];
  const main = new Map<string, string>();
  if (wanted.length === 0) return main;
  const images = await readLinks(wanted, true);
  for (const image of (images ?? []).sort(byGallery))
    if (!main.has(image.placeId)) main.set(image.placeId, image.thumbnail);
  return main;
}

/** Ids of the places on the other end of confirmed recognises links. */
async function recognisedIds(
  id: string,
  side: 'subject_place_id' | 'object_place_id'
): Promise<string[] | null> {
  const supabase = placesClient();
  if (!supabase) return null;
  const other =
    side === 'object_place_id' ? 'subject_place_id' : 'object_place_id';
  const ids: string[] = [];
  for (let from = 0; ; from += LINK_PAGE) {
    const { data, error } = await supabase
      .from('place_relationships')
      .select(other)
      .eq(side, id)
      .eq('relationship_type_id', 'recognises')
      .eq('status', 'confirmed')
      .is('retired_at', null)
      .gte('object_coverage', RECOGNITION_IMAGE_COVERAGE)
      .order('id')
      .range(from, from + LINK_PAGE - 1);
    if (error) return null;
    const page = (data as Record<string, string>[] | null) ?? [];
    ids.push(...page.map(row => row[other]));
    if (page.length < LINK_PAGE) break;
  }
  return [...new Set(ids)];
}

/**
 * Group photographs by the place they belong to, named, by name.
 * @param images - Photographs of other places, in the order to keep.
 * @returns One group per place.
 */
async function groupByPlace(
  images: PlaceImage[]
): Promise<ImageGroup[] | null> {
  const supabase = placesClient();
  if (!supabase) return null;
  const ids = [...new Set(images.map(image => image.placeId))];
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('place_summaries')
    .select('id, name')
    .in('id', ids);
  if (error) return null;
  const nameOf = new Map(
    ((data as { id: string; name: string }[] | null) ?? []).map(row => [
      row.id,
      row.name,
    ])
  );
  const groups = new Map<string, ImageGroup>();
  for (const image of images) {
    const group = groups.get(image.placeId) ?? {
      placeId: image.placeId,
      name: nameOf.get(image.placeId) ?? 'Unpublished place',
      images: [],
    };
    group.images.push(image);
    groups.set(image.placeId, group);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Approved photographs of related places that this place can use too, leaving
 * out those already linked to it. A conservation area can use those of the
 * recognitions it lies at least 75% inside. A recognition can use those of the
 * conservation areas at least 75% inside it, the first `AREA_IMAGE_LIMIT`
 * added.
 * @param id - The place id.
 * @returns The photographs, grouped by the place they come from.
 */
export async function loadBorrowedImages(
  id: string
): Promise<BorrowedImagesResult> {
  const none = { fromRecognitions: [], fromAreas: [], areasTotal: 0 };
  if (!PLACE_ID.test(id)) return { status: 'ok', ...none };
  if (!placesClient()) return { status: 'unconfigured' };
  const [recognitionIds, areaIds, own] = await Promise.all([
    recognisedIds(id, 'object_place_id'),
    recognisedIds(id, 'subject_place_id'),
    readLinks([id], false),
  ]);
  if (!recognitionIds || !areaIds || !own) return { status: 'error' };
  const [recognitionImages, areaImages] = await Promise.all([
    recognitionIds.length ? readLinks(recognitionIds, true) : [],
    areaIds.length ? readLinks(areaIds, true) : [],
  ]);
  if (!recognitionImages || !areaImages) return { status: 'error' };
  const seen = new Set(own.map(image => image.imageId));
  /** Drop photographs already linked here, or listed once already. */
  const fresh = (image: PlaceImage) => {
    if (seen.has(image.imageId)) return false;
    seen.add(image.imageId);
    return true;
  };
  const fromRecognitions = recognitionImages.sort(byGallery).filter(fresh);
  const fromAreas = areaImages.filter(fresh);
  const [recognitionGroups, areaGroups] = await Promise.all([
    groupByPlace(fromRecognitions),
    groupByPlace(fromAreas.slice(0, AREA_IMAGE_LIMIT)),
  ]);
  if (!recognitionGroups || !areaGroups) return { status: 'error' };
  return {
    status: 'ok',
    fromRecognitions: recognitionGroups,
    fromAreas: areaGroups,
    areasTotal: fromAreas.length,
  };
}

/**
 * The licences a photograph can be stored under, with their titles.
 * @returns The licences, in the order of `IMAGE_LICENCES`.
 */
export async function loadImageLicences(): Promise<ImageLicencesResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const { data, error } = await supabase
    .from('licences')
    .select('id, title')
    .in('id', [...IMAGE_LICENCES]);
  if (error) return { status: 'error' };
  const rank = (id: string) =>
    (IMAGE_LICENCES as readonly string[]).indexOf(id);
  return {
    status: 'ok',
    licences: ((data as ImageLicence[] | null) ?? []).sort(
      (a, b) => rank(a.id) - rank(b.id)
    ),
  };
}

/**
 * The hex SHA-256 of a file.
 * @param file - The file.
 * @returns 64 lowercase hex characters.
 */
export async function fileSha256(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    await file.arrayBuffer()
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Width and height of an image file, read by the browser. */
async function imageSize(
  file: Blob
): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/**
 * Check an upload before it is read.
 * @param file - The chosen file.
 * @returns An error to show, or null when it can be uploaded.
 */
export function uploadProblem(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type))
    return 'Only JPEG, PNG, and WebP photographs can be uploaded.';
  if (file.size > IMAGE_MAX_BYTES) return 'A photograph can be at most 10 MB.';
  return null;
}

/**
 * Store a file in the bucket, named by its SHA-256. A file stored before is
 * kept as it is.
 * @param file - A JPEG, PNG, or WebP file of at most 10 MB.
 * @returns The object path, hash, and size, or an error to show.
 */
export async function uploadPlaceImage(file: File): Promise<UploadResult> {
  const problem = uploadProblem(file);
  if (problem) return { status: 'error', message: problem };
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  let sha256: string;
  let size: { width: number; height: number };
  try {
    [sha256, size] = await Promise.all([fileSha256(file), imageSize(file)]);
  } catch {
    return {
      status: 'error',
      message: 'The file could not be read as an image.',
    };
  }
  const storagePath = `uploads/${sha256}.${EXTENSIONS[file.type]}`;
  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  const stored =
    !error ||
    /exists|duplicate/i.test(error.message) ||
    (error as { statusCode?: string }).statusCode === '409';
  if (!stored) return { status: 'error', message: error.message };
  return { status: 'ok', storagePath, sha256, ...size };
}

/** Call an admin RPC and report its error. */
async function write(
  name: string,
  args: Record<string, unknown>
): Promise<ImageWriteResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const { error } = await supabase.rpc(name, args);
  if (error) return { status: 'error', message: error.message };
  return { status: 'ok' };
}

/**
 * Store a photograph, or reuse the stored copy, and link it as approved.
 * @param placeId - The place.
 * @param image - The image and its link's text.
 */
export function addPlaceImage(placeId: string, image: NewPlaceImage) {
  return write('add_place_image', { p_place_id: placeId, p_image: image });
}

/**
 * Link a stored photograph, such as a recognition's, to the place.
 * @param placeId - The place.
 * @param imageId - The stored image.
 */
export function linkPlaceImage(placeId: string, imageId: string) {
  return write('link_place_image', {
    p_place_id: placeId,
    p_image_id: imageId,
  });
}

/**
 * Approve, reject, or make main, or change the caption or alt text.
 * @param placeId - The place.
 * @param imageId - The image.
 * @param values - The fields to change.
 */
export function setPlaceImage(
  placeId: string,
  imageId: string,
  values: PlaceImageValues
) {
  return write('set_place_image', {
    p_place_id: placeId,
    p_image_id: imageId,
    p_values: values,
  });
}

/**
 * Set the gallery order.
 * @param placeId - The place.
 * @param imageIds - Every approved photograph of the place, in order.
 */
export function orderPlaceImages(placeId: string, imageIds: string[]) {
  return write('order_place_images', {
    p_place_id: placeId,
    p_image_ids: imageIds,
  });
}
