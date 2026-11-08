import type { ExpressionSpecification } from 'mapbox-gl';

/** One class value and the colour the map should paint it. */
export interface ClassColor {
  value: number;
  color: string;
}

/** Mapbox raster paint that colours pixels from the red channel. */
export interface RasterColorPaint {
  'raster-color': ExpressionSpecification;
  'raster-color-mix': [number, number, number, number];
  'raster-color-range': [number, number];
  'raster-fade-duration': 0;
}

/** Mapbox raster paint for class-value tiles. */
export type ClassRasterPaint = RasterColorPaint;

/** Share-tile paint from the catalog. Opacity follows √share below solidZoom. */
export interface SharePaint {
  color: string;
  /** Lighter colour on satellite, so the layer still reads against imagery. */
  colorSatellite?: string;
  steps: number;
  solidZoom: number;
}

/** Colour to paint share tiles on the current basemap. */
export function sharePaintColor(spec: SharePaint, satellite: boolean): string {
  return satellite && spec.colorSatellite ? spec.colorSatellite : spec.color;
}

/** Graded layer below solidZoom, solid layer from it. */
export interface ShareRasterPaint {
  graded: RasterColorPaint;
  solid: RasterColorPaint;
  solidZoom: number;
}

const RED_MIX: RasterColorPaint['raster-color-mix'] = [255, 0, 0, 0];

/**
 * Paint that colours class-value tiles.
 * The PNG stores the class as an 8-bit gray value, so gray 1 is 1/255 in the texture.
 * Mapbox scales raster-color-mix down to fit the colour ramp, so a mix of 255
 * on red puts the class number back. A class that is not listed stays transparent.
 * Class 0 is the step's base colour. Fading between tile zooms blends those class
 * values and can paint a class that only exists in the other zoom, so the fade is off.
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
    'raster-color-mix': RED_MIX,
    'raster-color-range': [0, top],
    'raster-color': expression,
    'raster-fade-duration': 0,
  };
}

/**
 * Paint that colours share tiles.
 * Index 0 is nodata. Shade k of `steps` stores red = 255 × (k / steps)², so the
 * shades sit evenly on √share. Opacity is 0.2 + 0.75 × √share where there is any
 * cropland, and 0 where there is none. From solidZoom the map draws share ≥ 0.5
 * solid and the rest clear. Two Mapbox layers, with maxzoom and minzoom at
 * solidZoom, because a zoom-dependent colour on one layer was not used.
 * @param spec - Colour, number of graded steps, and the zoom that turns solid.
 * @returns Graded paint, solid paint, and that zoom.
 */
export function shareRasterPaint(spec: SharePaint): ShareRasterPaint {
  const rgb = hexRgb(spec.color);
  const graded: ExpressionSpecification = [
    'interpolate',
    ['linear'],
    ['raster-value'],
    0,
    rgba(rgb, 0),
  ];
  for (let k = 1; k <= spec.steps; k++) {
    const share = (k / spec.steps) ** 2;
    graded.push(
      Math.max(1, Math.round(share * 255)),
      rgba(rgb, 0.2 + 0.75 * Math.sqrt(share))
    );
  }
  return {
    solidZoom: spec.solidZoom,
    graded: redChannelPaint(graded),
    solid: redChannelPaint([
      'step',
      ['raster-value'],
      rgba(rgb, 0),
      128,
      rgba(rgb, 1),
    ]),
  };
}

/** Paint that reads the red channel as 0–255. */
function redChannelPaint(
  expression: ExpressionSpecification
): RasterColorPaint {
  return {
    'raster-color-mix': RED_MIX,
    'raster-color-range': [0, 255],
    'raster-color': expression,
    'raster-fade-duration': 0,
  };
}

/** RGB from a #rrggbb catalog colour. */
function hexRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** CSS rgba() from an RGB triple and an opacity. */
function rgba(rgb: [number, number, number], alpha: number): string {
  return `rgba(${rgb.join(',')},${alpha})`;
}
