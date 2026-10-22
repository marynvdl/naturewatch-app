import type { CatalogYearMeaning } from '@/catalog/types';
import type { MapLayerType, MapLayerButtonType } from '../types/MapLayerType';

/** Map Layer Interface */
export default interface MapLayer {
  /** Layer Name */
  title: string | '-';
  /** Button type */
  button_type: MapLayerButtonType;
  /** Drawer group id. Basemap layers omit this. */
  group?: string;
  /** Text shown when hovering the layer button */
  tooltip?: string;
  /** Layer source url */
  url: string;
  /** Years for which layer is available */
  years_available: number[];
  /** How a listed year relates to the timeline. static stays visible for earlier years. */
  year_meaning?: CatalogYearMeaning;
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
  /** Highest zoom level the tiles exist for; the map enlarges that level beyond it */
  max_zoom?: number;
  /** How raster pixels are drawn when enlarged */
  resampling?: 'linear' | 'nearest';
  /** Class values the client colours. Unlisted classes stay transparent. */
  color_classes?: { value: number; color: string }[];
}
