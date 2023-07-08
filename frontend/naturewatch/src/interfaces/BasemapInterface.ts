import type MapLayer from '@/interfaces/MapLayerInterface';

/** Drawer Menu Item Interface */
export default interface Basemap {
  /** Item Name */
  title: string | '-';
  /** Item URL */
  url: string | '-';
  /** Item Icon */
  icon?: string;
  /** Optional Map Layer */
  layer?: MapLayer
}
