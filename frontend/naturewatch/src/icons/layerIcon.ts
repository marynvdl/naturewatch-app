import type { Component } from 'vue';
import {
  Bridge,
  Building2,
  Droplets,
  Flame,
  Landmark,
  Road,
  Shovel,
  Square,
  TreePine,
  Wheat,
} from '@lucide/vue';

/**
 * Catalog layers still store Material icon names.
 * These are the Lucide drawings for those names.
 */
const layerIcons: Record<string, Component> = {
  'mdi-home-city': Landmark,
  'mdi-office-building': Building2,
  'mdi-tree': TreePine,
  'mdi-fire': Flame,
  'mdi-square-rounded': Square,
  'mdi-shovel': Shovel,
  'mdi-barley': Wheat,
  'mdi-water': Droplets,
  'mdi-bridge': Bridge,
  'mdi-road-variant': Road,
};

/** Lucide icon for a catalog Material name, when one is mapped. */
export function layerIcon(name?: string): Component | undefined {
  if (!name) return undefined;
  return layerIcons[name];
}
