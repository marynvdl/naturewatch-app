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

// Rows by table and id. A merged place is not in protected_areas.
const rows: Record<string, Record<string, unknown>> = {
  protected_areas: { [keptId]: kept },
  facts: {},
};
const mergedInto: Record<string, string | null> = { [mergedId]: keptId };

const rpc = vi.fn(async (name: string, args: { p_id: string }) => {
  if (name !== 'place_merged_into') throw new Error(name);
  return { data: mergedInto[args.p_id] ?? null, error: null };
});

/**
 * A query builder that answers `.eq(column, value).maybeSingle()` from `rows`.
 * @param table - The table or view name.
 * @returns The builder.
 */
function from(table: string) {
  let key: string | undefined;
  const builder = {
    select: () => builder,
    eq: (column: string, value: string) => {
      if (column === 'id' || column === 'place_id') key = value;
      return builder;
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

  it('says missing when the place is neither stored nor merged', async () => {
    const { loadPilotPlace } = await import('@/places/api');
    const result = await loadPilotPlace('33333333-3333-3333-3333-333333333333');
    expect(result).toEqual({ status: 'missing' });
  });
});
