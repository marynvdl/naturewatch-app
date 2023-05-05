// BasemapInterface.ts
import type {
  BasemapSourceType,
  BasemapCustomType,
} from '../types/BasemapTypes';

/** Basemap Interface */
export default interface Basemap {
  /** Item Name */
  title: string | '-';
  /** Item type */
  source: BasemapSourceType;
  /** Item URL */
  url: string | '-';
  /** Layer type if source is custom */
  customType?: BasemapCustomType;
  /** Item Icon */
  icon?: string;
  /** Router Location */
}
