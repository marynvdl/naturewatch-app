import { describe, expect, it } from 'vitest';
import type { StoredCorrection } from '@/corrections/api';
import { outlineFeatures } from '../outlines';

/**
 * A stored correction.
 * @param id - Its id.
 * @param status - Its review status.
 */
function stored(
  id: string,
  status: StoredCorrection['status']
): StoredCorrection {
  return {
    id,
    layerId: 'cropland',
    layerVersion: 'v3',
    years: [2024],
    action: 'remove',
    value: null,
    note: null,
    photoPaths: [],
    status,
    reviewNote: null,
    createdAt: '2026-11-26T10:00:00Z',
    reviewedAt: null,
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [31, -24],
            [31.1, -24],
            [31.1, -24.1],
            [31, -24],
          ],
        ],
      ],
    },
  };
}

describe('outlineFeatures', () => {
  it('marks the chosen correction', () => {
    const data = outlineFeatures(
      [stored('a', 'submitted'), stored('b', 'approved')],
      stored('b', 'approved')
    );
    expect(data.features.map(feature => feature.properties)).toEqual([
      { id: 'a', status: 'submitted', chosen: false },
      { id: 'b', status: 'approved', chosen: true },
    ]);
  });

  it('adds a chosen rejected correction', () => {
    const data = outlineFeatures(
      [stored('a', 'submitted')],
      stored('r', 'rejected')
    );
    expect(data.features).toHaveLength(2);
    expect(data.features[1].properties).toEqual({
      id: 'r',
      status: 'rejected',
      chosen: true,
    });
  });
});
