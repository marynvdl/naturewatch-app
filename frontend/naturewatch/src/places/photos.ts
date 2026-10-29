/** A named credit, linked when it has an address. */
export interface PhotoCredit {
  name: string;
  url?: string;
}

/** One approved photograph of a place. */
export interface PlacePhoto {
  /** Address of the full image. */
  src: string;
  /** Smaller copy for the thumbnail row. The full image is used without it. */
  thumbnail?: string;
  /** What the image shows, for people who cannot see it. */
  alt: string;
  title?: string;
  photographer: string;
  source: PhotoCredit;
  licence: PhotoCredit;
}

export const PHOTOS_NONE = 'Camouflaged for now';

/**
 * Step through a set, wrapping at either end.
 * @param index - The current position.
 * @param step - 1 for next, -1 for previous.
 * @param count - How many photographs are in the set.
 * @returns The new position.
 */
export function stepPhoto(index: number, step: number, count: number) {
  if (count < 1) return 0;
  return (index + step + count) % count;
}
