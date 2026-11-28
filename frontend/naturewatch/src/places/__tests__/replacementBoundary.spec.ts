import { describe, expect, it } from 'vitest';
import {
  BOUNDARY_FILE_MAX_BYTES,
  checkEditedShape,
  parseBoundary,
  readBoundaryFile,
} from '@/places/replacementBoundary';

const RING = [
  [30, -20],
  [30.1, -20],
  [30.1, -19.9],
  [30, -19.9],
  [30, -20],
];
const POLYGON = { type: 'Polygon', coordinates: [RING] };
const SHIFTED = {
  type: 'Polygon',
  coordinates: [RING.map(([x, y]) => [x + 1, y])],
};

/**
 * Parse a value as GeoJSON text.
 * @param value - The GeoJSON.
 */
function parse(value: unknown) {
  return parseBoundary(JSON.stringify(value));
}

/**
 * The message of a refused value.
 * @param value - The GeoJSON.
 */
function refusal(value: unknown): string {
  const result = parse(value);
  if (result.ok) throw new Error('expected a refusal');
  return result.message;
}

describe('parseBoundary', () => {
  it('takes a Polygon as a MultiPolygon, with its points and area', () => {
    const result = parse(POLYGON);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shape).toEqual({
      type: 'MultiPolygon',
      coordinates: [[RING]],
    });
    expect(result.points).toBe(5);
    // About 11 km by 10.5 km near 20° south.
    expect(result.areaKm2).toBeGreaterThan(100);
    expect(result.areaKm2).toBeLessThan(130);
  });

  it('takes a MultiPolygon, a Feature, and a FeatureCollection', () => {
    const multi = parse({ type: 'MultiPolygon', coordinates: [[RING]] });
    const feature = parse({
      type: 'Feature',
      properties: {},
      geometry: POLYGON,
    });
    const collection = parse({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: POLYGON },
        { type: 'Feature', properties: {}, geometry: SHIFTED },
      ],
    });
    expect(multi.ok && multi.points).toBe(5);
    expect(feature.ok && feature.points).toBe(5);
    expect(collection.ok && collection.shape.coordinates.length).toBe(2);
    expect(collection.ok && collection.points).toBe(10);
  });

  it('drops heights', () => {
    const result = parse({
      type: 'Polygon',
      coordinates: [RING.map(([x, y]) => [x, y, 12])],
    });
    expect(result.ok && result.shape.coordinates[0][0][0]).toEqual([30, -20]);
  });

  it('takes a CRS84 crs member', () => {
    const result = parse({
      ...POLYGON,
      crs: {
        type: 'name',
        properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
      },
    });
    expect(result.ok).toBe(true);
  });

  it('refuses what it cannot use, in plain words', () => {
    expect(parseBoundary('not json').ok).toBe(false);
    expect(refusal({ type: 'Point', coordinates: [30, -20] })).toBe(
      'The file must hold a polygon or a multipolygon.'
    );
    expect(
      refusal({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: POLYGON },
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: RING },
          },
        ],
      })
    ).toBe('The file must hold a polygon or a multipolygon.');
    expect(refusal({ type: 'FeatureCollection', features: [] })).toBe(
      'The file has no features.'
    );
    expect(refusal({ type: 'MultiPolygon', coordinates: [] })).toBe(
      'The shape is empty.'
    );
    expect(refusal({ type: 'Polygon', coordinates: [RING.slice(0, 3)] })).toBe(
      'Each ring of the shape needs at least four points.'
    );
    expect(
      refusal({
        type: 'Polygon',
        coordinates: [RING.map(([x, y]) => [x * 10000, y * 10000])],
      })
    ).toBe('The file must be in longitude and latitude (WGS 84).');
    expect(
      refusal({
        ...POLYGON,
        crs: {
          type: 'name',
          properties: { name: 'urn:ogc:def:crs:EPSG::32735' },
        },
      })
    ).toBe('The file must be in longitude and latitude (WGS 84).');
  });

  it('refuses more than 100,000 points', () => {
    const ring = Array.from({ length: 100_001 }, (_, i) => [
      30 + i * 1e-6,
      -20,
    ]);
    ring.push([30, -20]);
    expect(refusal({ type: 'Polygon', coordinates: [ring] })).toBe(
      'The shape has 100,002 points. At most 100,000 can be uploaded.'
    );
  });
});

describe('readBoundaryFile', () => {
  it('refuses a file over 10 MB without reading it', async () => {
    const file = {
      size: BOUNDARY_FILE_MAX_BYTES + 1,
      text: () => Promise.reject(new Error('read')),
    } as unknown as File;
    expect(await readBoundaryFile(file)).toEqual({
      ok: false,
      message: 'The file is larger than 10 MB.',
    });
  });

  it('reads a file', async () => {
    const file = {
      size: 100,
      text: () => Promise.resolve(JSON.stringify(POLYGON)),
    } as unknown as File;
    const result = await readBoundaryFile(file);
    expect(result.ok && result.points).toBe(5);
  });
});

describe('checkEditedShape', () => {
  it('takes an edited Polygon or MultiPolygon', () => {
    const polygon = checkEditedShape({ type: 'Polygon', coordinates: [RING] });
    const multi = checkEditedShape({
      type: 'MultiPolygon',
      coordinates: [[RING]],
    });
    expect(polygon.ok && polygon.points).toBe(5);
    expect(multi.ok && multi.shape).toEqual({
      type: 'MultiPolygon',
      coordinates: [[RING]],
    });
  });

  it('refuses a ring of fewer than four points, as an upload', () => {
    const result = checkEditedShape({
      type: 'Polygon',
      coordinates: [RING.slice(0, 3)],
    });
    expect(result).toEqual({
      ok: false,
      message: 'Each ring of the shape needs at least four points.',
    });
  });
});
