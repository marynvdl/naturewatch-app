import { placesClient } from '@/places/api';

/**
 * The boundary review: a verdict on each current boundary, in plain words, and
 * the places list's filter by review view. The database keeps its own names:
 * `qc_status` and `stats_eligibility`.
 */

/** The longest note `review_boundary` keeps. */
export const REVIEW_NOTE_MAX = 1000;

export type QcStatus =
  | 'unchecked'
  | 'passed'
  | 'flagged'
  | 'accepted'
  | 'rejected';
export type StatsEligibility = 'pending' | 'eligible' | 'excluded';
/** The places list's boundary review views. */
export type BoundaryReviewView = 'to_review' | 'needs_fixing' | 'left_out';
/** A verdict an admin gives a boundary. */
export type BoundaryVerdict = 'count' | 'fix' | 'leave_out' | 'undo';

/** The filter's views, in the order they show. */
export const REVIEW_VIEWS: { id: BoundaryReviewView; label: string }[] = [
  { id: 'to_review', label: 'To review' },
  { id: 'needs_fixing', label: 'Needs fixing' },
  { id: 'left_out', label: 'Left out' },
];

/** The verdict a boundary has now, in plain words. */
export type VerdictState = 'not_reviewed' | 'counted' | 'fix' | 'left_out';

/**
 * The verdict a boundary has now.
 * @param qc - `qc_status`.
 * @param eligibility - `stats_eligibility`.
 * @returns The verdict.
 */
export function verdictState(
  qc: QcStatus,
  eligibility: StatsEligibility
): VerdictState {
  if (eligibility === 'excluded') return 'left_out';
  if (qc === 'rejected') return 'fix';
  if (eligibility === 'eligible') return 'counted';
  return 'not_reviewed';
}

/** Which review view a boundary is in. */
export function reviewViewOf(
  qc: QcStatus,
  eligibility: StatsEligibility
): BoundaryReviewView | null {
  const state = verdictState(qc, eligibility);
  if (state === 'left_out') return 'left_out';
  if (state === 'fix') return 'needs_fixing';
  if (state === 'not_reviewed') return 'to_review';
  return null;
}

/** The latest finding of one check. */
export interface BoundaryFinding {
  checkId: string;
  outcome: 'pass' | 'warn' | 'fail';
  measuredValue: number | null;
  thresholdUsed: number | null;
  details: Record<string, unknown>;
  checkedAt: string;
}

/** A place's current boundary, as the review reads it. */
export interface BoundaryReview {
  boundaryId: string;
  qcStatus: QcStatus;
  eligibility: StatsEligibility;
  note: string | null;
  setBy: string | null;
  setAt: string | null;
  findings: BoundaryFinding[];
}

export type BoundaryReviewResult =
  | { status: 'ok'; review: BoundaryReview | null }
  | { status: 'unconfigured' }
  | { status: 'error' };

/** The order findings are shown in. */
const CHECK_ORDER = [
  'geometry_valid',
  'small_components',
  'holes',
  'vertex_count',
];

/**
 * Read a place's current boundary and the latest finding of each check.
 * Admins only.
 * @param placeId - `places.id`.
 * @returns The review, null when the place has no current boundary, or why it could not be read.
 */
export async function loadBoundaryReview(
  placeId: string
): Promise<BoundaryReviewResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const { data: boundary, error } = await supabase
    .from('place_boundaries')
    .select(
      'id, qc_status, stats_eligibility, stats_eligibility_reason, stats_eligibility_set_by, stats_eligibility_set_at'
    )
    .eq('place_id', placeId)
    .eq('is_current', true)
    .maybeSingle();
  if (error) return { status: 'error' };
  if (!boundary) return { status: 'ok', review: null };
  const { data: checks, error: checksError } = await supabase
    .from('boundary_checks')
    .select(
      'check_id, outcome, measured_value, threshold_used, details, checked_at'
    )
    .eq('boundary_id', boundary.id)
    .order('checked_at', { ascending: false });
  if (checksError || !Array.isArray(checks)) return { status: 'error' };
  const latest = new Map<string, BoundaryFinding>();
  for (const row of checks) {
    if (latest.has(row.check_id)) continue;
    latest.set(row.check_id, {
      checkId: row.check_id,
      outcome: row.outcome,
      measuredValue: row.measured_value,
      thresholdUsed: row.threshold_used,
      details: (row.details ?? {}) as Record<string, unknown>,
      checkedAt: row.checked_at,
    });
  }
  const rank = (id: string) => {
    const index = CHECK_ORDER.indexOf(id);
    return index < 0 ? CHECK_ORDER.length : index;
  };
  return {
    status: 'ok',
    review: {
      boundaryId: boundary.id,
      qcStatus: boundary.qc_status,
      eligibility: boundary.stats_eligibility,
      note: boundary.stats_eligibility_reason,
      setBy: boundary.stats_eligibility_set_by,
      setAt: boundary.stats_eligibility_set_at,
      findings: [...latest.values()].sort(
        (a, b) => rank(a.checkId) - rank(b.checkId)
      ),
    },
  };
}

/**
 * Give a boundary a verdict. Admins only.
 * @param boundaryId - `place_boundaries.id`.
 * @param verdict - Count it, needs fixing, leave out, or back to review.
 * @param note - Why, or null.
 * @returns An error message, or null.
 */
export async function reviewBoundary(
  boundaryId: string,
  verdict: BoundaryVerdict,
  note: string | null
): Promise<string | null> {
  const supabase = placesClient();
  if (!supabase) return 'The database is not configured.';
  const { error } = await supabase.rpc('review_boundary', {
    p_boundary_id: boundaryId,
    p_verdict: verdict,
    p_note: note,
  });
  return error ? error.message : null;
}

/** A card's review, while the places list is filtered by review. */
export interface BoundaryNote {
  qcStatus: QcStatus;
  eligibility: StatsEligibility;
  note: string | null;
  warnings: string[];
  vertexCount: number | null;
  vertexCap: number | null;
}

export type BoundaryNotesResult =
  | { status: 'ok'; notes: Record<string, BoundaryNote> }
  | { status: 'unconfigured' }
  | { status: 'error' };

/**
 * Read the reviews of the listed places, at most 200. Admins only.
 * @param placeIds - `places.id` of the cards.
 * @returns The reviews by place id, or why they could not be read.
 */
export async function loadBoundaryNotes(
  placeIds: string[]
): Promise<BoundaryNotesResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const { data, error } = await supabase.rpc('boundary_review_notes', {
    p_place_ids: placeIds.slice(0, 200),
  });
  if (error || !Array.isArray(data)) return { status: 'error' };
  const notes: Record<string, BoundaryNote> = {};
  for (const row of data as {
    place_id: string;
    qc_status: QcStatus;
    stats_eligibility: StatsEligibility;
    stats_eligibility_reason: string | null;
    warnings: string[] | null;
    vertex_count: number | null;
    vertex_cap: number | null;
  }[]) {
    notes[row.place_id] = {
      qcStatus: row.qc_status,
      eligibility: row.stats_eligibility,
      note: row.stats_eligibility_reason,
      warnings: row.warnings ?? [],
      vertexCount: row.vertex_count,
      vertexCap: row.vertex_cap,
    };
  }
  return { status: 'ok', notes };
}

/** What each check that warns is called, on a card. */
const WARNING_LABELS: Record<string, string> = {
  geometry_valid: 'Shape not valid',
  small_components: 'Many tiny pieces',
  holes: 'Many tiny holes',
};

const count = (value: unknown) =>
  typeof value === 'number' ? value.toLocaleString('en-GB') : '?';

/**
 * A finding as one line, such as "Many tiny pieces: 82 of 129 under 0.01 km²".
 * @param finding - The finding.
 * @returns The text.
 */
export function findingText(finding: BoundaryFinding): string {
  const d = finding.details;
  const warns = finding.outcome !== 'pass';
  switch (finding.checkId) {
    case 'geometry_valid':
      return warns
        ? `Shape not valid${typeof d.reason === 'string' && d.reason ? `: ${d.reason}` : ''}`
        : 'Shape is valid';
    case 'small_components':
      return warns
        ? `Many tiny pieces: ${count(d.small_parts)} of ${count(d.parts)} under ${d.part_km2} km²`
        : `${count(d.parts)} ${d.parts === 1 ? 'piece' : 'pieces'}`;
    case 'holes':
      return warns
        ? `Many tiny holes: ${count(d.tiny_holes)} of ${count(d.holes)} under ${d.hole_km2} km²`
        : d.holes
          ? `${count(d.holes)} ${d.holes === 1 ? 'hole' : 'holes'}`
          : 'No holes';
    case 'vertex_count':
      return `${count(finding.measuredValue)} points`;
    default:
      return `${finding.checkId}: ${finding.outcome}`;
  }
}

/**
 * Whether a finding counts against the shape. The point count is about cost,
 * not shape, so it never does.
 * @param finding - The finding.
 */
export function warnsOnShape(finding: BoundaryFinding): boolean {
  return finding.checkId !== 'vertex_count' && finding.outcome !== 'pass';
}

/**
 * A card's note: the shape warnings and the points, or the note when left out
 * or needing fixing.
 * @param note - The card's review.
 * @returns The note.
 */
export function cardNote(note: BoundaryNote): string {
  const state = verdictState(note.qcStatus, note.eligibility);
  if ((state === 'left_out' || state === 'fix') && note.note) return note.note;
  const parts = note.warnings
    .filter(id => id !== 'vertex_count')
    .map(id => WARNING_LABELS[id] ?? id);
  if (note.vertexCount !== null)
    parts.push(`${count(note.vertexCount)} points`);
  return parts.join(' · ');
}

/**
 * One line on whether the place is counted in Stats, and why.
 * @param hidden - Whether the place is hidden from the map.
 * @param review - Its current boundary's review, or null when it has none.
 * @returns The line.
 */
export function statsLine(
  hidden: boolean,
  review: BoundaryReview | null
): string {
  if (hidden) return 'Not counted in Stats: hidden from map.';
  if (!review) return 'Not counted in Stats: no boundary.';
  const state = verdictState(review.qcStatus, review.eligibility);
  if (state === 'left_out')
    return `Not counted in Stats: left out.${review.note ? ` ${review.note}` : ''}`;
  if (state === 'fix') return 'Not counted in Stats: the shape needs fixing.';
  if (state === 'not_reviewed')
    return 'Not counted in Stats yet: not reviewed.';
  const points = review.findings.find(f => f.checkId === 'vertex_count');
  if (points && points.outcome !== 'pass')
    return `Counted in Stats, in a separate run: over ${count(points.thresholdUsed)} points.`;
  return 'Counted in Stats.';
}
