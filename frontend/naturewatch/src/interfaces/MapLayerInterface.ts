import type { MapLayerType, MapLayerButtonType } from '../types/MapLayerType';

/** Map Layer Interface */
export default interface MapLayer {
  /** Layer Name */
  title: string | '-';
  /** Button type */
  button_type: MapLayerButtonType;
  /** Layer source url */
  url: string;
  /** Layer type */
  type: MapLayerType;
  /** Layer visible on map */
  visible: boolean;
  /** Button Icon */
  icon?: string;
  /** Button is active */
  active?: boolean;
}
