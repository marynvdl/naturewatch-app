import { formatPercent } from '@/places/display';
import { placesClient } from '@/places/api';

/**
 * The link review: one decision on each proposed `recognises` or `overlaps`
 * link, through `review_overlap`, and the places list's filter by kind of
 * proposed link.
 */

/** The places list's link review views: a kind of proposed link. */
export type OverlapReviewView = 'recognises' | 'overlaps';
/** A decision an admin gives a link. */
export type OverlapDecision = 'keep' | 'not_related' | 'same_place' | 'undo';

/** The filter's views, in the order they show. */
export const OVERLAP_VIEWS: { id: OverlapReviewView; label: string }[] = [
  { id: 'recognises', label: 'Recognitions' },
  { id: 'overlaps', label: 'Overlaps' },
];

/**
 * Give a link one decision.
 * @param linkId - `place_relationships.id`.
 * @param decision - Keep it, not related, same place, or back to review.
 * @param hidePlaceId - For same place: the place hidden from the map.
 * @returns Null when it was stored, or why it was not.
 */
export async function reviewOverlap(
  linkId: string,
  decision: OverlapDecision,
  hidePlaceId: string | null = null
): Promise<string | null> {
  const supabase = placesClient();
  if (!supabase) return 'The database is not configured.';
  const { error } = await supabase.rpc('review_overlap', {
    p_link_id: linkId,
    p_decision: decision,
    p_hide_place_id: hidePlaceId,
  });
  return error ? error.message : null;
}

/** A card's proposed links, while the places list is filtered by link review. */
export interface OverlapNote {
  /** How many proposed links the place has. */
  count: number;
  /** The other place of the link with the largest share, when it is known. */
  otherName: string | null;
  /** The share of this place inside that other place. */
  share: number | null;
}

export type OverlapNotesResult =
  | { status: 'ok'; notes: Record<string, OverlapNote> }
  | { status: 'unconfigured' }
  | { status: 'error' };

/**
 * Read the proposed links of up to 200 places. A place with none is left out.
 * @param placeIds - `places.id` values.
 * @param view - Count only proposed links of this kind. Both kinds when null.
 * @returns The notes by place, or why they could not be read.
 */
export async function loadOverlapNotes(
  placeIds: string[],
  view: OverlapReviewView | null = null
): Promise<OverlapNotesResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const { data, error } = await supabase.rpc('overlap_review_notes', {
    p_place_ids: placeIds.slice(0, 200),
    p_view: view,
  });
  if (error || !Array.isArray(data)) return { status: 'error' };
  const notes: Record<string, OverlapNote> = {};
  for (const row of data as {
    place_id: string;
    proposed_links: number;
    top_other_name: string | null;
    top_share: number | null;
  }[]) {
    notes[row.place_id] = {
      count: Number(row.proposed_links),
      otherName: row.top_other_name,
      share: row.top_share,
    };
  }
  return { status: 'ok', notes };
}

/**
 * A card's note: "3 proposed links · 62% inside Kafue".
 * @param note - The card's proposed links.
 * @returns The note.
 */
export function overlapCardNote(note: OverlapNote): string {
  const links = `${note.count.toLocaleString('en-GB')} proposed ${
    note.count === 1 ? 'link' : 'links'
  }`;
  if (note.share == null || !note.otherName) return links;
  return `${links} · ${formatPercent(note.share * 100)}% inside ${note.otherName}`;
}
