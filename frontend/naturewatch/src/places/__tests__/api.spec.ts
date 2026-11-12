import { beforeEach, describe, expect, it, vi } from 'vitest';

const mergedId = '11111111-1111-1111-1111-111111111111';
const keptId = '22222222-2222-2222-2222-222222222222';

const kept = {
  id: keptId,
  name: 'Gobiin ikh',
  designation: 'Strictly Protected Area',
  iso3: 'MNG',
  area_km2: 63884.6,
  site_id: '798',
  release_month: '2026-10-01',
  source_name: 'World Database on Protected and Conserved Areas',
  citation: 'UNEP-WCMC and IUCN (2026)',
};

const croppedId = '44444444-4444-4444-4444-444444444444';
const cropped = { ...kept, id: croppedId, name: 'Tankwa Karoo', iso3: 'ZAF' };

// Rows by view and id. A merged place is not in place_summaries.
const rows: Record<string, Record<string, unknown>> = {
  place_summaries: { [keptId]: kept, [croppedId]: cropped },
};

// place_stats_preferred rows by place id.
const stats: Record<string, { stat_id: string; value: number }[]> = {
  [croppedId]: [
    { stat_id: 'crops_area', value: 12.5 },
    { stat_id: 'crops_percent', value: 0.9 },
  ],
};
const statFilters: [string, unknown][] = [];
const mergedInto: Record<string, string | null> = { [mergedId]: keptId };

const rpc = vi.fn(async (name: string, args: { p_id: string }) => {
  if (name !== 'place_merged_into') throw new Error(name);
  return { data: mergedInto[args.p_id] ?? null, error: null };
});

/**
 * A query builder that answers `.eq('id', value).maybeSingle()` from `rows`,
 * and a filtered `place_stats_preferred` read from `stats`.
 * @param table - The table or view name.
 * @returns The builder.
 */
function from(table: string) {
  let key: string | undefined;
  const builder = {
    select: () => builder,
    eq: (column: string, value: string) => {
      if (column === 'id' || column === 'place_id') key = value;
      if (table === 'place_stats_preferred') statFilters.push([column, value]);
      return builder;
    },
    in: (column: string, values: string[]) => {
      statFilters.push([column, values]);
      return Promise.resolve({
        data: (key && stats[key]) ?? [],
        error: null,
      });
    },
    maybeSingle: async () => ({
      data: (key && rows[table][key]) ?? null,
      error: null,
    }),
  };
  return builder;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from, rpc }),
}));

describe('loadPilotPlace', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test');
    rpc.mockClear();
    statFilters.length = 0;
  });

  it('opens a stored place without asking where it was merged', async () => {
    const { loadPilotPlace } = await import('@/places/api');
    const result = await loadPilotPlace(keptId);
    expect(result).toMatchObject({ status: 'ok', place: { id: keptId } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('opens the place a merged place was merged into', async () => {
    const { loadPilotPlace } = await import('@/places/api');
    const result = await loadPilotPlace(mergedId);
    expect(rpc).toHaveBeenCalledWith('place_merged_into', { p_id: mergedId });
    expect(result).toMatchObject({
      status: 'ok',
      place: { id: keptId, name: 'Gobiin ikh' },
    });
  });

  it('reads the 2024 cropland figures from place_stats_preferred', async () => {
    const { loadPilotPlace } = await import('@/places/api');
    const result = await loadPilotPlace(croppedId);
    expect(result).toMatchObject({
      status: 'ok',
      place: { id: croppedId, croplandKm2: 12.5, percent: 0.9 },
    });
    expect(statFilters).toEqual([
      ['place_id', croppedId],
      ['period_start', '2024-01-01'],
      ['stat_id', ['crops_area', 'crops_percent']],
    ]);
  });

  it('leaves the cropland figures empty when none are stored', async () => {
    const { loadPilotPlace } = await import('@/places/api');
    const result = await loadPilotPlace(keptId);
    expect(result).toMatchObject({
      status: 'ok',
      place: { croplandKm2: null, percent: null },
    });
  });

  it('says missing when the place is neither stored nor merged', async () => {
    const { loadPilotPlace } = await import('@/places/api');
    const result = await loadPilotPlace('33333333-3333-3333-3333-333333333333');
    expect(result).toEqual({ status: 'missing' });
  });
});
