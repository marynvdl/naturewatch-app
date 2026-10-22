import type { ExpressionSpecification } from 'mapbox-gl';

/** One class value and the colour the map should paint it. */
export interface ClassColor {
  value: number;
  color: string;
}

/** Mapbox raster paint for class-value tiles. */
export interface ClassRasterPaint {
  'raster-color': ExpressionSpecification;
  'raster-color-mix': [number, number, number, number];
  'raster-color-range': [number, number];
}

/**
 * Paint that colours class-value tiles.
 * The PNG stores the class as an 8-bit gray value, so gray 1 is 1/255 in the texture.
 * Multiplying the red channel by 255 turns that back into the class number.
 * A class that is not listed stays transparent. Class 0 is the step's base colour.
 * @param classes - Class values to colour.
 * @returns Mapbox raster paint for those classes.
 */
export function classRasterPaint(classes: ClassColor[]): ClassRasterPaint {
  const sorted = [...classes].sort((a, b) => a.value - b.value);
  const base = sorted.find(entry => entry.value <= 0);
  const stops = sorted.filter(entry => entry.value > 0);
  const expression: ExpressionSpecification = [
    'step',
    ['raster-value'],
    base ? base.color : 'rgba(0,0,0,0)',
  ];
  stops.forEach(entry => {
    expression.push(entry.value - 0.5, entry.color);
  });
  const top = Math.max(1, ...sorted.map(entry => entry.value));
  return {
    'raster-color-mix': [255, 0, 0, 0],
    'raster-color-range': [0, top],
    'raster-color': expression,
  };
}
