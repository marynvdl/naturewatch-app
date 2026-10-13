import { describe, expect, it } from 'vitest';
import { Ajv } from 'ajv';
import schema from '../layers.schema.json';
import rawCatalog from '../layers.json';
import { catalogImages } from '../assets';
import {
  buildInfoCards,
  buildMapLayers,
  catalog,
  getTimelineRange,
} from '../index';
import type { Catalog } from '../types';

describe('layer catalog', () => {
  it('follows the JSON schema', () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);
    const valid = validate(rawCatalog);
    // Show readable errors when a catalog edit is wrong
    expect(validate.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });

  it('has unique layer ids and titles', () => {
    const ids = catalog.layers.map(layer => layer.id);
    const titles = catalog.layers.map(layer => layer.title);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('lists years in ascending order', () => {
    catalog.layers.forEach(layer => {
      const sorted = [...layer.years.available].sort((a, b) => a - b);
      expect(layer.years.available, layer.id).toEqual(sorted);
    });
  });

  it('gives every raster layer a tile URL with z, x and y', () => {
    catalog.layers
      .filter(layer => layer.tiles.type === 'raster')
      .forEach(layer => {
        const full = layer.tiles.url + (layer.tiles.query ?? '');
        expect(full, layer.id).toContain('{z}');
        expect(full, layer.id).toContain('{x}');
        expect(full, layer.id).toContain('{y}');
      });
  });

  it('keeps the declared source version in step with the tile URL', () => {
    catalog.layers
      .filter(layer => layer.source?.version)
      .forEach(layer => {
        expect(layer.tiles.url, layer.id).toContain(
          `/${layer.source?.version}/`
        );
      });
  });

  it('only refers to images registered in assets.ts', () => {
    catalog.layers.forEach(layer => {
      const keys = [
        layer.display.images?.visible,
        layer.display.images?.hidden,
        layer.info?.image,
      ].filter((key): key is string => !!key);
      keys.forEach(key => {
        expect(Object.keys(catalogImages), `${layer.id}: ${key}`).toContain(
          key
        );
      });
    });
  });

  it('rejects a misspelled field or a bad status', () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);
    const broken = JSON.parse(JSON.stringify(rawCatalog));
    broken.layers[0].yeras = { available: [2020] };
    broken.layers[1].status = 'live';
    expect(validate(broken)).toBe(false);
    const messages = (validate.errors ?? []).map(error => error.message);
    expect(messages).toContain('must NOT have additional properties');
    expect(messages).toContain('must be equal to one of the allowed values');
  });

  it('derives the timeline range from published layers only', () => {
    const custom: Catalog = {
      schemaVersion: 1,
      timeline: { minYear: 2010 },
      layers: [
        {
          id: 'a',
          title: 'A',
          status: 'published',
          display: { buttonType: 'small' },
          tiles: { type: 'raster', url: 'https://example.com/{z}/{x}/{y}.png' },
          years: { available: [2015, 2020] },
        },
        {
          id: 'b',
          title: 'B',
          status: 'coming-soon',
          display: { buttonType: 'small' },
          tiles: { type: 'raster', url: 'https://example.com/{z}/{x}/{y}.png' },
          years: { available: [2030] },
        },
      ],
    };
    expect(getTimelineRange(custom)).toEqual({ min: 2010, max: 2020 });
  });

  it('builds one map layer and one info card per catalog layer, hidden by default', () => {
    const layers = buildMapLayers(catalog);
    const cards = buildInfoCards(catalog);
    expect(layers.map(layer => layer.title)).toEqual(
      catalog.layers.map(layer => layer.title)
    );
    expect(cards.map(card => card.title)).toEqual(
      catalog.layers.map(layer => layer.title)
    );
    layers.forEach(layer => {
      expect(layer.visible).toBe(false);
      expect(layer.opacity).toBe(100);
    });
  });

  it('only enables published layers', () => {
    const layers = buildMapLayers(catalog);
    catalog.layers.forEach((layer, index) => {
      expect(layers[index].active, layer.id).toBe(layer.status === 'published');
    });
  });
});
