export type BlobEdge = 'left' | 'right' | 'bottom';

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where the open circle's centre sits, relative to the closed circle's centre.
 * Places and Landscape rest just inside the panel, so the card covers the cut.
 * Measure stays whole. A third of it sits under the panel.
 */
export function nubShift(
  edge: BlobEdge,
  anchor: Box,
  panel: Box,
  size: number
): { x: number; y: number } {
  const reveal = -10;
  const corner = 16;
  let cx = panel.left + panel.width / 2;
  let cy = panel.top;
  if (edge === 'left') {
    cx = panel.left + panel.width + reveal;
  } else if (edge === 'right') {
    cx = panel.left - reveal;
  } else {
    cx = panel.left - size / 6;
  }
  if (edge === 'left' || edge === 'right') {
    const preferred = panel.top + corner + size / 2;
    const lowest = panel.top + panel.height - corner - size / 2;
    cy = lowest < preferred ? panel.top + panel.height / 2 : preferred;
  } else {
    cy = panel.top + panel.height / 2;
  }
  return {
    x: cx - (anchor.left + anchor.width / 2),
    y: cy - (anchor.top + anchor.height / 2),
  };
}

/**
 * Move a shrunk circle onto the top-right corner of an open panel.
 * The shift is in the circle's own coordinates, before the scale.
 * @param anchor - The closed circle.
 * @param panel - The open panel.
 * @param closeSize - The shrunk circle's diameter.
 * @param inset - Gap between the circle and the panel corner.
 * @returns Translation and scale from the closed circle.
 */
export function cornerShift(
  anchor: Box,
  panel: Box,
  closeSize: number,
  inset: number
): { x: number; y: number; scale: number } {
  const currentX = anchor.left + anchor.width / 2;
  const currentY = anchor.top + anchor.height / 2;
  const targetX = panel.left + panel.width - inset - closeSize / 2;
  const targetY = panel.top + inset + closeSize / 2;
  return {
    x: targetX - currentX,
    y: targetY - currentY,
    scale: anchor.width > 0 ? closeSize / anchor.width : 1,
  };
}
