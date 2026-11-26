import type { Polygon } from 'geojson';
import { placesClient } from '@/places/api';
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
