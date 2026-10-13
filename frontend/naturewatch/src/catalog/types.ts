import type { MapLayerButtonType, MapLayerType } from '@/types/MapLayerType';

/** Shape of src/catalog/layers.json. The JSON schema (layers.schema.json) is the strict check. */
export type CatalogLayerStatus = 'published' | 'coming-soon';
export type CatalogYearMeaning =
  | 'annual'
  | 'cumulative'
  | 'snapshot'
  | 'static';

export interface CatalogLayer {
  id: string;
  title: string;
  status: CatalogLayerStatus;
  display: {
    buttonType: MapLayerButtonType;
    icon?: string;
    color?: string;
    images?: { visible: string; hidden: string };
  };
  tiles: {
    type: MapLayerType;
    url: string;
    query?: string;
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
