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
  /** Button icon if small button */
  icon?: string;
  /** Button image if big button and layer visible*/
  image_visible?: string;
  /** Button image if big button and layer not visible*/
  image_notvisible?: string;
  /** Button color when selected */
  button_color?: string;
  /** Button is active */
  active?: boolean;
}
