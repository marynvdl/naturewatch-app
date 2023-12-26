import type { MapLayerType, MapLayerButtonType } from '../types/MapLayerType';

/** Map Layer Interface */
export default interface MapLayer {
  /** Layer Name */
  title: string | '-';
  /** Button type */
  button_type: MapLayerButtonType;
  /** Layer source url */
  url: string;
  /** Years for which layer is available */
  years_available: number[];
  /** Layer type: one of raster, line, point */
  type: MapLayerType;
  /** Source layer from Mapbox */
  sourceLayer?: string;
  /** Layer hex color for satellite */
  layer_color_satellite?: string;
  /** Layer hex color for streets */
  layer_color_streets?: string;
  /** Circle radius if point layer */
  circle_radius?: number;
  /** Layer visible on map */
  visible: boolean;
  /** Layer opacity on map */
  opacity: number;
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
  /** Optional query string */
  query_string?: string;
}
