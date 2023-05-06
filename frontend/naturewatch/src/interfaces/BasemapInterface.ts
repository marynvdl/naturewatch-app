/** Drawer Menu Item Interface */
export default interface Basemap {
  /** Item Name */
  title: string | '-';
  /** Item URL */
  url: string | '-';
  /** Item Icon */
  icon?: string;
  /** Router Location */
}
