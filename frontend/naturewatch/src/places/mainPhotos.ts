/** Main photographs for place cards, read in batches and kept for the session. */
import { reactive } from 'vue';
import { loadMainPhotos } from '@/places/images';

/** Thumbnail address by place id. Null means the place has none. */
const photos = reactive(new Map<string, string | null>());
/** Ids asked for since the last read started. */
let pending = new Set<string>();
let scheduled = false;

/**
 * Read the main photographs of places not read yet, together, once the
 * current task ends.
 * @param ids - Place ids of the cards shown.
 */
export function requestMainPhotos(ids: string[]) {
  for (const id of ids) if (!photos.has(id)) pending.add(id);
  if (scheduled || pending.size === 0) return;
  scheduled = true;
  queueMicrotask(async () => {
    const batch = [...pending];
    pending = new Set();
    scheduled = false;
    for (const id of batch) photos.set(id, null);
    const found = await loadMainPhotos(batch);
    for (const [id, src] of found) photos.set(id, src);
  });
}

/**
 * The main photograph of a place, once read.
 * @param id - The place id.
 * @returns Its thumbnail address, or null.
 */
export function mainPhotoOf(id: string): string | null {
  return photos.get(id) ?? null;
}

/**
 * Read a place's main photograph again, after its photographs changed.
 * @param id - The place id.
 */
export function forgetMainPhoto(id: string) {
  photos.delete(id);
  requestMainPhotos([id]);
}
