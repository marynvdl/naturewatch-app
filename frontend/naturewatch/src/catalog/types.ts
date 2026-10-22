import type { MapLayerButtonType, MapLayerType } from '@/types/MapLayerType';

/** Shape of src/catalog/layers.json. The JSON schema (layers.schema.json) is the strict check. */
export type CatalogLayerStatus = 'published' | 'coming-soon';
export type CatalogYearMeaning =
  | 'annual'
  | 'cumulative'
  | 'snapshot'
  | 'static';

export interface CatalogGroup {
  id: string;
  title: string;
}

export interface CatalogLayer {
  id: string;
  title: string;
  /** Id of a catalog group. Controls which drawer section shows the layer. */
  group: string;
  status: CatalogLayerStatus;
  display: {
    buttonType: MapLayerButtonType;
    icon?: string;
    color?: string;
    /** Text shown when hovering the button, such as a fixed observation year. */
    tooltip?: string;
    images?: { visible: string; hidden: string };
  };
  tiles: {
    type: MapLayerType;
    url: string;
    query?: string;
    /** Highest zoom level the tiles exist for. Beyond it the map enlarges the last level. */
    maxzoom?: number;
    /** How raster pixels are drawn when enlarged. Use nearest for data pixels that should stay sharp. */
    resampling?: 'linear' | 'nearest';
    /** Class values the client colours. Unlisted classes stay transparent. */
    colorClasses?: { value: number; color: string }[];
    sourceLayer?: string;
    circle?: { radius: number; colorSatellite: string; colorStreets: string };
  };
  years: {
    available: number[];
    meaning?: CatalogYearMeaning;
    since?: number;
  };
  source?: { name: string; version?: string; url?: string };
  info?: { subtitle?: string; content?: string; image?: string };
}

export interface Catalog {
  schemaVersion: 1;
  timeline: { minYear: number };
  groups: CatalogGroup[];
  layers: CatalogLayer[];
}

/** One entry in the About dialog. */
export interface InfoCard {
  title: string;
  subtitle: string;
  icon?: string;
  content: string;
  image?: string;
}
