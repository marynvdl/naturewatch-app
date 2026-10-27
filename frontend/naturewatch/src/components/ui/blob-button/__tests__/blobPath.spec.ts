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

    const bottomAnchor = { left: 500, top: 700, width: 112, height: 112 };
    const bottomPanel = { left: 480, top: 640, width: 220, height: 120 };
    const bottom = nubShift('bottom', bottomAnchor, bottomPanel, 112);
    const bottomCentreY = bottomAnchor.top + 56 + bottom.y;
    expect(bottomCentreY).toBe(bottomPanel.top + bottomPanel.height / 2);
    const bottomCentreX = bottomAnchor.left + 56 + bottom.x;
    expect(bottomCentreX).toBeLessThan(bottomPanel.left);
    const covered = bottomCentreX + 56 - bottomPanel.left;
    expect(covered).toBeCloseTo(112 / 3);
  });
});
