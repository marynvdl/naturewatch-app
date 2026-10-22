import type MapLayer from '@/interfaces/MapLayerInterface';
import rawCatalog from './layers.json';
import { resolveCatalogImage } from './assets';
import type { Catalog, CatalogYearMeaning, InfoCard } from './types';

/** The layer catalog. Edit src/catalog/layers.json, not this file. */
export const catalog = rawCatalog as unknown as Catalog;

/**
 * Years shown on the timeline slider.
 * @param source - The catalog to read.
 * @returns First year from the catalog and last year of any published layer.
 */
export function getTimelineRange(source: Catalog): {
  min: number;
  max: number;
} {
  const publishedYears = source.layers
    .filter(layer => layer.status === 'published')
    .flatMap(layer => layer.years.available);
  return {
    min: source.timeline.minYear,
    max: Math.max(...publishedYears),
  };
}

/**
 * Year to request for a layer.
 * A missing later year falls back to the latest earlier year.
 * A static layer also stays on the map when every listed year is later, using its latest year.
 * @param available - Years the layer publishes.
 * @param selected - Year chosen on the timeline.
 * @param meaning - Catalog year meaning, when set.
 * @returns The year to use, or null when the layer should not be requested.
 */
export function resolveLayerYear(
  available: number[],
  selected: number,
  meaning?: CatalogYearMeaning
): number | null {
  if (available.includes(selected)) return selected;
  const earlier = available.filter(year => year < selected);
  if (earlier.length > 0) return Math.max(...earlier);
  if (meaning === 'static' && available.length > 0) {
    return Math.max(...available);
  }
  return null;
}

/**
 * Build the map layers the drawer and map use.
 * @param source - The catalog to read.
 * @returns One MapLayer per catalog layer, in catalog order. All start hidden at 100% opacity.
 */
export function buildMapLayers(source: Catalog): MapLayer[] {
  return source.layers.map(layer => {
    const { display, tiles, years } = layer;
    const mapLayer: MapLayer = {
      title: layer.title,
      button_type: display.buttonType,
      group: layer.group,
      url: tiles.url,
      years_available: [...years.available],
      type: tiles.type,
      visible: false,
      opacity: 100,
      active: layer.status === 'published',
    };
    if (display.icon) mapLayer.icon = display.icon;
    if (display.color) mapLayer.button_color = display.color;
    if (display.tooltip) mapLayer.tooltip = display.tooltip;
    if (years.meaning) mapLayer.year_meaning = years.meaning;
    if (display.images) {
      mapLayer.image_visible = resolveCatalogImage(display.images.visible);
      mapLayer.image_notvisible = resolveCatalogImage(display.images.hidden);
    }
    if (tiles.query) mapLayer.query_string = tiles.query;
    if (tiles.maxzoom !== undefined) mapLayer.max_zoom = tiles.maxzoom;
    if (tiles.resampling) mapLayer.resampling = tiles.resampling;
    if (tiles.colorClasses) mapLayer.color_classes = tiles.colorClasses;
    if (tiles.sourceLayer) mapLayer.sourceLayer = tiles.sourceLayer;
    if (tiles.circle) {
      mapLayer.circle_radius = tiles.circle.radius;
      mapLayer.layer_color_satellite = tiles.circle.colorSatellite;
      mapLayer.layer_color_streets = tiles.circle.colorStreets;
    }
    return mapLayer;
  });
}

/**
 * Build the entries of the About dialog.
 * @param source - The catalog to read.
 * @returns One card per layer. The subtitle lists the available years unless the layer is coming soon or overrides it.
 */
export function buildInfoCards(source: Catalog): InfoCard[] {
  return source.layers.map(layer => {
    let subtitle = layer.years.available.join(', ');
    if (layer.status === 'coming-soon') subtitle = 'Coming soon';
    if (layer.info?.subtitle) subtitle = layer.info.subtitle;
    const card: InfoCard = {
      title: layer.title,
      subtitle,
      content: layer.info?.content ?? '',
    };
    if (layer.display.icon) card.icon = layer.display.icon;
    const image = resolveCatalogImage(layer.info?.image);
    if (image) card.image = image;
    return card;
  });
}

/** Timeline range for the shipped catalog. */
export const timelineRange = getTimelineRange(catalog);
