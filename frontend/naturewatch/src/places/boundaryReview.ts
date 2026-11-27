import { placesClient } from '@/places/api';

/**
 * The polygon review queue: current boundaries whose Stats eligibility is
 * pending or excluded, their QC findings, and the admin's decisions.
 */

/** The longest eligibility reason `set_stats_eligibility` keeps. */
export const ELIGIBILITY_REASON_MAX = 1000;
/** Boundaries the list loads at once. */
export const BOUNDARY_LIST_PAGE = 20;

export type QcStatus = 'unchecked' | 'passed' | 'flagged' | 'accepted';
export type StatsEligibility = 'pending' | 'eligible' | 'excluded';
/** The two views of the list. */
export type BoundaryListView = 'pending' | 'excluded';

/** A boundary on the review list. */
export interface ListedBoundary {
  placeId: string;
  name: string;
  placeType: string;
  iso3: string | null;
  areaKm2: number | null;
  boundaryId: string;
  qcStatus: QcStatus;
  reason: string | null;
  /** The checks whose latest finding is `warn` or `fail`. */
  warnings: string[];
  vertexCount: number | null;
}

export type BoundaryListResult =
  | { status: 'ok'; boundaries: ListedBoundary[]; total: number }
  | { status: 'unconfigured' }
  | { status: 'error' };

/**
 * One page of the review list, by place name. Admins only.
 * @param view - Pending or excluded boundaries.
 * @param limit - At most this many, up to 200.
 * @param offset - Skip this many.
 * @returns The page and the total, or why it could not be read.
 */
export async function loadBoundaryList(
  view: BoundaryListView,
  limit: number,
  offset: number
): Promise<BoundaryListResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const { data, error } = await supabase.rpc('admin_boundary_list', {
    p_eligibility: view,
    p_limit: limit,
    p_offset: offset,
  });
  if (error || !Array.isArray(data)) return { status: 'error' };
  const rows = data as {
    place_id: string;
    name: string;
    place_type_id: string;
    iso3: string | null;
    area_km2: number | null;
    boundary_id: string;
    qc_status: QcStatus;
    stats_eligibility_reason: string | null;
    warnings: string[] | null;
    vertex_count: number | null;
    total_count: number | string;
  }[];
  return {
    status: 'ok',
    total: Number(rows[0]?.total_count ?? 0),
    boundaries: rows.map(row => ({
      placeId: row.place_id,
      name: row.name,
      placeType: row.place_type_id,
      iso3: row.iso3,
      areaKm2: row.area_km2,
      boundaryId: row.boundary_id,
      qcStatus: row.qc_status,
      reason: row.stats_eligibility_reason,
      warnings: row.warnings ?? [],
      vertexCount: row.vertex_count,
    })),
  };
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
  reason: string | null;
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
      reason: boundary.stats_eligibility_reason,
      setBy: boundary.stats_eligibility_set_by,
      setAt: boundary.stats_eligibility_set_at,
      findings: [...latest.values()].sort(
        (a, b) => rank(a.checkId) - rank(b.checkId)
      ),
    },
  };
}

/**
 * Accept the warnings of a flagged boundary. Admins only.
 * @param boundaryId - `place_boundaries.id`.
 * @returns An error message, or null.
 */
export async function acceptBoundaryQc(
  boundaryId: string
): Promise<string | null> {
  const supabase = placesClient();
  if (!supabase) return 'The database is not configured.';
  const { error } = await supabase.rpc('accept_boundary_qc', {
    p_boundary_id: boundaryId,
  });
  return error ? error.message : null;
}

/**
 * Set a boundary's Stats eligibility. Admins only.
 * @param boundaryId - `place_boundaries.id`.
 * @param eligibility - The new eligibility.
 * @param reason - Why, or null.
 * @returns An error message, or null.
 */
export async function setStatsEligibility(
  boundaryId: string,
  eligibility: StatsEligibility,
  reason: string | null
): Promise<string | null> {
  const supabase = placesClient();
  if (!supabase) return 'The database is not configured.';
  const { error } = await supabase.rpc('set_stats_eligibility', {
    p_boundary_id: boundaryId,
    p_eligibility: eligibility,
    p_reason: reason,
  });
  return error ? error.message : null;
}

/** What each check is called. */
export const CHECK_LABELS: Record<string, string> = {
  geometry_valid: 'Invalid shape',
  small_components: 'Small parts',
  holes: 'Tiny holes',
  vertex_count: 'Over the vertex cap',
};

const count = (value: unknown) =>
  typeof value === 'number' ? value.toLocaleString('en-GB') : '?';

/**
 * A finding as one line, such as "Small parts: 412 of 600 parts under 0.01 km²".
 * @param finding - The finding.
 * @returns The text.
 */
export function findingText(finding: BoundaryFinding): string {
  const d = finding.details;
  switch (finding.checkId) {
    case 'geometry_valid':
      return finding.outcome === 'pass'
        ? 'Shape: valid'
        : `Shape: invalid${typeof d.reason === 'string' ? `, ${d.reason}` : ''}`;
    case 'small_components':
      return `Small parts: ${count(d.small_parts)} of ${count(d.parts)} parts under ${d.part_km2} km²`;
    case 'holes':
      return `Tiny holes: ${count(d.tiny_holes)} of ${count(d.holes)} holes under ${d.hole_km2} km²`;
    case 'vertex_count':
      return `Vertices: ${count(finding.measuredValue)}${
        finding.outcome === 'pass'
          ? ''
          : `, over the cap of ${count(finding.thresholdUsed)}`
      }`;
    default:
      return `${finding.checkId}: ${finding.outcome}`;
  }
}

/**
 * A list card's note: the warnings and the vertex count, or the reason on Excluded.
 * @param boundary - The listed boundary.
 * @param view - The list's view.
 * @returns The note.
 */
export function listNote(
  boundary: ListedBoundary,
  view: BoundaryListView
): string {
  if (view === 'excluded' && boundary.reason) return boundary.reason;
  const parts = boundary.warnings
    .filter(id => id !== 'vertex_count')
    .map(id => CHECK_LABELS[id] ?? id);
  if (boundary.vertexCount !== null)
    parts.push(`${count(boundary.vertexCount)} vertices`);
  return parts.join(' · ');
}
