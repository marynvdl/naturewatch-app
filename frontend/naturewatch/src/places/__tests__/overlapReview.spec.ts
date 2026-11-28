import { describe, expect, it } from 'vitest';
import { overlapCardNote } from '@/places/overlapReview';

describe('overlapCardNote', () => {
  it('counts the proposed links and names the largest share', () => {
    expect(
      overlapCardNote({ count: 3, otherName: 'Sabi Sand', share: 0.62 })
    ).toBe('3 proposed links · 62.0% inside Sabi Sand');
  });

  it('gives the count alone when the share or the name is unknown', () => {
    expect(overlapCardNote({ count: 1, otherName: null, share: 0.5 })).toBe(
      '1 proposed link'
    );
    expect(
      overlapCardNote({ count: 1200, otherName: 'Kafue', share: null })
    ).toBe('1,200 proposed links');
  });
});
