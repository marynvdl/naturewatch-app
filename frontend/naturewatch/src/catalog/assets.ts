import allVisibleImg from '@/assets/all_visible.png';
import allNotVisibleImg from '@/assets/all_notvisible.png';
import riversVisibleImg from '@/assets/rivers_visible.png';
import riversNotVisibleImg from '@/assets/rivers_notvisible.png';
import fireLegendImg from '@/assets/fire_legend.png';

/**
 * Images that catalog records can refer to by key. JSON cannot import files,
 * so add new images here and use the key in layers.json.
 */
export const catalogImages: Record<string, string> = {
  all_visible: allVisibleImg,
  all_notvisible: allNotVisibleImg,
  rivers_visible: riversVisibleImg,
  rivers_notvisible: riversNotVisibleImg,
  fire_legend: fireLegendImg,
};

/**
 * Resolve an image key to its URL.
 * @param key - A key from layers.json.
 * @returns The image URL, or undefined for an unknown key.
 */
export function resolveCatalogImage(
  key: string | undefined
): string | undefined {
  return key ? catalogImages[key] : undefined;
}
