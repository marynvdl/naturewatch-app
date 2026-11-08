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
  resolveLayerYear,
} from '../index';
import {
  classRasterPaint,
  sharePaintColor,
  shareRasterPaint,
} from '../rasterColor';
import { isPmtilesUrl } from '../rasterSource';
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

  it('gives every raster layer a tile URL with z, x and y, or one PMTiles archive', () => {
    catalog.layers
      .filter(layer => layer.tiles.type === 'raster')
      .forEach(layer => {
        const full = layer.tiles.url + (layer.tiles.query ?? '');
        if (isPmtilesUrl(full)) return;
        expect(full, layer.id).toContain('{z}');
        expect(full, layer.id).toContain('{x}');
        expect(full, layer.id).toContain('{y}');
        if (full.includes('nature-watch-tiles')) {
          expect(full, layer.id).toContain('?v=1');
        }
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
      groups: [{ id: 'threats', title: 'Threats' }],
      layers: [
        {
          id: 'a',
          title: 'A',
          group: 'threats',
          status: 'published',
          display: { buttonType: 'small' },
          tiles: { type: 'raster', url: 'https://example.com/{z}/{x}/{y}.png' },
          years: { available: [2015, 2020] },
        },
        {
          id: 'b',
          title: 'B',
          group: 'threats',
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

  it('passes the tile zoom limit and resampling on to the map layer', () => {
    const fire = catalog.layers.find(layer => layer.id === 'fire');
    expect(fire?.tiles.maxzoom).toBe(9);
    const layers = buildMapLayers(catalog);
    const fireLayer = layers.find(layer => layer.title === fire?.title);
    expect(fireLayer?.max_zoom).toBe(9);
    expect(fireLayer?.resampling).toBe('nearest');
    // Layers that do not set them keep the Mapbox defaults
    const treeloss = layers.find(layer => layer.title === 'Treeloss');
    expect(treeloss?.max_zoom).toBeUndefined();
    expect(treeloss?.resampling).toBeUndefined();
  });

  it('rejects an impossible zoom limit or resampling mode', () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);
    const broken = JSON.parse(JSON.stringify(rawCatalog));
    broken.layers[0].tiles.maxzoom = 40;
    broken.layers[1].tiles.resampling = 'cubic';
    expect(validate(broken)).toBe(false);
  });

  it('puts existing layers under Pressures and tree height under Environment', () => {
    expect(catalog.groups.map(group => group.title)).toEqual([
      'Pressures',
      'Environment',
    ]);
    const threats = catalog.layers
      .filter(layer => layer.group === 'threats')
      .map(layer => layer.id);
    const interest = catalog.layers
      .filter(layer => layer.group === 'interest')
      .map(layer => layer.id);
    expect(threats).toEqual([
      'all',
      'built',
      'treeloss',
      'fire',
      'bare',
      'mines',
      'cropland',
      'rivers',
      'dams',
    ]);
    expect(interest).toEqual(['tree-height']);
    catalog.layers.forEach(layer => {
      expect(catalog.groups.map(group => group.id)).toContain(layer.group);
    });
  });

  it('keeps 2020 tree height visible for earlier and later timeline years', () => {
    const height = catalog.layers.find(layer => layer.id === 'tree-height');
    expect(height?.status).toBe('published');
    expect(height?.years).toEqual({ available: [2020], meaning: 'static' });
    expect(height?.tiles.url).toBe(
      'https://tiles.globalforestwatch.org/umd_tree_cover_height_2020/v2022/tch_3/{z}/{x}/{y}.png'
    );
    expect(height?.display.icon).toBe('mdi-tree');
    expect(height?.display.tooltip).toBe('2020');
    expect(resolveLayerYear([2020], 2016, 'static')).toBe(2020);
    expect(resolveLayerYear([2020], 2020, 'static')).toBe(2020);
    expect(resolveLayerYear([2020], 2025, 'static')).toBe(2020);
    // A non-static layer still stays off when every year is later
    expect(resolveLayerYear([2023], 2016, 'snapshot')).toBeNull();
    // Later years still fall back to the latest earlier year
    expect(resolveLayerYear([2015, 2019], 2025, 'snapshot')).toBe(2019);
    // Dams already list the early years, so static does not change that match
    expect(
      resolveLayerYear(
        [2016, 2017, 2018, 2019, 2020, 2021, 2022],
        2018,
        'static'
      )
    ).toBe(2018);

    const layers = buildMapLayers(catalog);
    const heightLayer = layers.find(layer => layer.title === 'Tree height');
    expect(heightLayer?.group).toBe('interest');
    expect(heightLayer?.tooltip).toBe('2020');
    expect(heightLayer?.year_meaning).toBe('static');
    expect(heightLayer?.active).toBe(true);
    const cards = buildInfoCards(catalog);
    const card = cards.find(entry => entry.title === 'Tree height');
    expect(card?.subtitle).toBe('2020');
    expect(card?.content).toContain('3 m');
    expect(card?.content).toContain('30 m');
    expect(card?.content).toContain('v2022');
    expect(card?.content).toContain('CC BY 4.0');
  });

  it('paints cropland share tiles graded below zoom 11 and solid from it', () => {
    const layer = catalog.layers.find(entry => entry.id === 'cropland');
    expect(layer?.title).toBe('Crops');
    expect(layer?.status).toBe('published');
    expect(layer?.years).toEqual({ available: [2024], meaning: 'snapshot' });
    expect(layer?.tiles).toMatchObject({
      url: 'https://storage.googleapis.com/nature-watch-tiles/cropland/2024/v3/cropland.pmtiles',
      maxzoom: 11,
      tileSize: 512,
      resampling: 'nearest',
      sharePaint: {
        color: '#e59139',
        colorSatellite: '#f49a3c',
        steps: 7,
        solidZoom: 11,
      },
    });
    expect(layer?.tiles.colorClasses).toBeUndefined();
    expect(
      sharePaintColor(
        layer?.tiles.sharePaint ?? { color: '', steps: 1, solidZoom: 0 },
        false
      )
    ).toBe('#e59139');
    expect(
      sharePaintColor(
        layer?.tiles.sharePaint ?? { color: '', steps: 1, solidZoom: 0 },
        true
      )
    ).toBe('#f49a3c');
    expect(resolveLayerYear([2024], 2024, 'snapshot')).toBe(2024);
    expect(resolveLayerYear([2024], 2025, 'snapshot')).toBe(2024);
    expect(resolveLayerYear([2024], 2016, 'snapshot')).toBeNull();

    const paint = shareRasterPaint(
      layer?.tiles.sharePaint ?? {
        color: '#e59139',
        steps: 7,
        solidZoom: 11,
      }
    );
    expect(paint.solidZoom).toBe(11);
    expect(paint.graded['raster-color-mix']).toEqual([255, 0, 0, 0]);
    expect(paint.graded['raster-color-range']).toEqual([0, 255]);
    expect(paint.graded['raster-fade-duration']).toBe(0);
    expect(paint.graded['raster-color']).toEqual([
      'interpolate',
      ['linear'],
      ['raster-value'],
      0,
      'rgba(229,145,57,0)',
      5,
      'rgba(229,145,57,0.30714285714285716)',
      21,
      'rgba(229,145,57,0.41428571428571426)',
      47,
      'rgba(229,145,57,0.5214285714285714)',
      83,
      'rgba(229,145,57,0.6285714285714286)',
      130,
      'rgba(229,145,57,0.7357142857142858)',
      187,
      'rgba(229,145,57,0.8428571428571427)',
      255,
      'rgba(229,145,57,0.95)',
    ]);
    expect(paint.solid['raster-color']).toEqual([
      'step',
      ['raster-value'],
      'rgba(229,145,57,0)',
      128,
      'rgba(229,145,57,1)',
    ]);

    const mapLayer = buildMapLayers(catalog).find(
      entry => entry.title === 'Crops'
    );
    expect(mapLayer?.share_paint).toEqual({
      color: '#e59139',
      colorSatellite: '#f49a3c',
      steps: 7,
      solidZoom: 11,
    });
    expect(mapLayer?.tile_size).toBe(512);
    expect(mapLayer?.max_zoom).toBe(11);
    expect(mapLayer?.resampling).toBe('nearest');
    expect(mapLayer?.tooltip).toBe('2024');
    const card = buildInfoCards(catalog).find(entry => entry.title === 'Crops');
    expect(card?.content).toContain('Faint orange');
    expect(card?.content).toContain('From zoom 11');
  });

  it('still colours class-value tiles through classRasterPaint', () => {
    const paint = classRasterPaint([{ value: 1, color: '#e59139' }]);
    expect(paint['raster-color-mix']).toEqual([255, 0, 0, 0]);
    expect(paint['raster-fade-duration']).toBe(0);
    expect(paint['raster-color-range']).toEqual([0, 1]);
    expect(paint['raster-color']).toEqual([
      'step',
      ['raster-value'],
      'rgba(0,0,0,0)',
      0.5,
      '#e59139',
    ]);
  });

  it('only enables published layers', () => {
    const layers = buildMapLayers(catalog);
    catalog.layers.forEach((layer, index) => {
      expect(layers[index].active, layer.id).toBe(layer.status === 'published');
    });
  });
});
