import { describe, expect, it } from 'vitest';
import { nubShift } from '../blobPath';

describe('blob circle', () => {
  const anchor = { left: 600, top: 12, width: 112, height: 112 };
  const panel = { left: 520, top: 116, width: 200, height: 360 };

  it('tucks the open circle just under the panel edge', () => {
    const right = nubShift('right', anchor, panel, 112);
    const centreX = anchor.left + anchor.width / 2 + right.x;
    expect(centreX).toBeGreaterThan(panel.left);
    expect(centreX).toBeLessThan(panel.left + 24);

    const leftAnchor = { left: 12, top: 12, width: 112, height: 112 };
    const leftPanel = { left: 12, top: 12, width: 280, height: 170 };
    const left = nubShift('left', leftAnchor, leftPanel, 112);
    const leftCentre = leftAnchor.left + leftAnchor.width / 2 + left.x;
    const leftEdge = leftPanel.left + leftPanel.width;
    expect(leftCentre).toBeLessThan(leftEdge);
    expect(leftCentre).toBeGreaterThan(leftEdge - 24);

    const bottom = nubShift(
      'bottom',
      { left: 500, top: 700, width: 112, height: 112 },
      { left: 480, top: 640, width: 220, height: 120 },
      112
    );
    const bottomCentre = 700 + 56 + bottom.y;
    expect(bottomCentre).toBeGreaterThan(640);
    expect(bottomCentre).toBeLessThan(664);
  });
});
