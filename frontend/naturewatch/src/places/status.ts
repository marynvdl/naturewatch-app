import { placesClient } from '@/places/api';

/** Reasons offered for withdrawing a place before any is in use. */
export const WITHDRAWAL_PRESETS = [
  'Already captured by other places',
  'Not a place',
  'Boundary unusable',
];

/** Reasons offered for flagging a place before any is in use. */
export const ATTENTION_PRESETS = [
  'Boundary looks wrong',
  'Details wrong',
  'Possible duplicate',
  'Missing photographs',
];

/** Notes are at most this long, as the database checks. */
export const STATUS_NOTE_MAX = 500;
/** Reasons are at most this long, as the database checks. */
export const STATUS_REASON_MAX = 80;

/** Which reason field: withdrawing, or needing attention. */
export type ReasonKind = 'withdrawal' | 'attention';

/**
 * The reasons to suggest: those in use, most used first, then the presets not
 * in use yet. Falls back to the presets when the reasons cannot be read.
 * @param kind - Which reason field.
 * @returns The suggestions.
 */
export async function loadStatusReasons(kind: ReasonKind): Promise<string[]> {
  const presets =
    kind === 'withdrawal' ? WITHDRAWAL_PRESETS : ATTENTION_PRESETS;
  const supabase = placesClient();
  if (!supabase) return [...presets];
  const { data, error } = await supabase.rpc('place_status_reasons', {
    p_kind: kind,
  });
  if (error || !Array.isArray(data)) return [...presets];
  const used = (data as { reason: string }[]).map(row => row.reason);
  const seen = new Set(used.map(reason => reason.toLowerCase()));
  return [
    ...used,
    ...presets.filter(reason => !seen.has(reason.toLowerCase())),
  ];
}

/** Whether a place is withdrawn, and whether it is flagged, with why. */
export interface PlaceStatus {
  withdrawn: boolean;
  /** Null for a place withdrawn before reasons were stored. */
  withdrawalReason: string | null;
  withdrawalNote: string | null;
  /** Null when the place is not flagged. */
  attentionReason: string | null;
  attentionNote: string | null;
}

export type PlaceStatusResult =
  | { status: 'ok'; placeStatus: PlaceStatus }
  | { status: 'unconfigured' }
  | { status: 'error'; message: string };

/**
 * Read whether a place is withdrawn or flagged. Admins only.
 * @param id - `places.id`.
 * @returns The place's status, or why it could not be read.
 */
export async function loadPlaceStatus(id: string): Promise<PlaceStatusResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const [place, flag] = await Promise.all([
    supabase
      .from('places')
      .select('publication_status, withdrawal_reason, withdrawal_note')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('place_attention')
      .select('reason, note')
      .eq('place_id', id)
      .maybeSingle(),
  ]);
  const error = place.error ?? flag.error;
  if (error) return { status: 'error', message: error.message };
  if (!place.data)
    return { status: 'error', message: 'The place could not be found.' };
  const row = place.data as {
    publication_status: string;
    withdrawal_reason: string | null;
    withdrawal_note: string | null;
  };
  const attention = flag.data as {
    reason: string;
    note: string | null;
  } | null;
  return {
    status: 'ok',
    placeStatus: {
      withdrawn: row.publication_status === 'withdrawn',
      withdrawalReason: row.withdrawal_reason,
      withdrawalNote: row.withdrawal_note,
      attentionReason: attention?.reason ?? null,
      attentionNote: attention?.note ?? null,
    },
  };
}

/** The result of a change: null when saved, or an error message. */
type SaveResult = Promise<string | null>;

/**
 * Withdraw a place with a reason, or restore it with a null reason.
 * @param id - `places.id`.
 * @param reason - Why, or null to restore the place.
 * @param note - An optional note.
 * @returns Null when saved, or an error message.
 */
export async function setPlaceWithdrawn(
  id: string,
  reason: string | null,
  note: string | null = null
): SaveResult {
  const supabase = placesClient();
  if (!supabase) return 'The place store is not configured.';
  const { error } = await supabase.rpc('set_place_publication', {
    p_place_id: id,
    p_status: reason ? 'withdrawn' : 'published',
    p_reason: reason,
    p_note: reason ? note : null,
  });
  return error ? error.message : null;
}

/**
 * Flag a place as needing attention, or clear the flag with a null reason.
 * @param id - `places.id`.
 * @param reason - Why, or null to clear.
 * @param note - An optional note.
 * @returns Null when saved, or an error message.
 */
export async function setPlaceAttention(
  id: string,
  reason: string | null,
  note: string | null = null
): SaveResult {
  const supabase = placesClient();
  if (!supabase) return 'The place store is not configured.';
  const { error } = await supabase.rpc('set_place_attention', {
    p_place_id: id,
    p_reason: reason,
    p_note: reason ? note : null,
  });
  return error ? error.message : null;
}

/** The admin lists of places: those that need attention, and those withdrawn. */
export type AdminPlaceListKind = 'attention' | 'withdrawn';

/** Places an admin list loads at once. */
export const ADMIN_LIST_PAGE = 20;

/** A place on an admin list. */
export interface AdminListedPlace {
  placeId: string;
  name: string;
  placeType: string;
  iso3: string | null;
  areaKm2: number | null;
  reason: string | null;
  note: string | null;
}

export type AdminPlaceListResult =
  | { status: 'ok'; places: AdminListedPlace[]; total: number }
  | { status: 'unconfigured' }
  | { status: 'error' };

/**
 * Places flagged for attention, or withdrawn, by name. Admins only.
 * @param kind - Which list.
 * @param limit - At most this many, up to 200.
 * @param offset - Skip this many.
 * @returns A page of the list and its total, or why it could not be read.
 */
export async function loadAdminPlaceList(
  kind: AdminPlaceListKind,
  limit: number,
  offset: number
): Promise<AdminPlaceListResult> {
  const supabase = placesClient();
  if (!supabase) return { status: 'unconfigured' };
  const { data, error } = await supabase.rpc('admin_place_list', {
    p_kind: kind,
    p_limit: limit,
    p_offset: offset,
  });
  if (error || !Array.isArray(data)) return { status: 'error' };
  const rows = data as {
    id: string;
    name: string;
    place_type_id: string;
    iso3: string | null;
    area_km2: number | null;
    reason: string | null;
    note: string | null;
    total_count: number | string;
  }[];
  return {
    status: 'ok',
    total: Number(rows[0]?.total_count ?? 0),
    places: rows.map(row => ({
      placeId: row.id,
      name: row.name,
      placeType: row.place_type_id,
      iso3: row.iso3,
      areaKm2: row.area_km2,
      reason: row.reason,
      note: row.note,
    })),
  };
}
