import { describe, expect, it } from 'vitest';
import {
  formatKm2,
  formatPercent,
  formatReleaseMonth,
  placesMatching,
  placePopupElement,
  protectedPlanetUrl,
  buildPlaceFeatures,
} from '@/places/display';

describe('place figures', () => {
  it('rounds square kilometres to a hectare and percent to one decimal', () => {
    expect(formatKm2(11.455618)).toBe('11.46');
    expect(formatPercent(0.0598)).toBe('0.1');
    expect(formatKm2(0)).toBe('0.00');
    expect(formatPercent(0)).toBe('0.0');
  });

  it('names the release month and the Protected Planet page', () => {
    expect(formatReleaseMonth('2026-10-01')).toBe('October 2026');
    expect(protectedPlanetUrl('873')).toBe(
      'https://www.protectedplanet.net/873'
    );
  });

  it('filters places by name', () => {
    const places = [
      { name: 'Kruger National Park' },
      { name: 'Sardaville Game and Holiday Farm' },
    ];
    expect(placesMatching(places, ' kruger ')).toEqual([places[0]]);
    expect(placesMatching(places, '')).toEqual(places);
  });

  it('joins a stored boundary to the stored cropland figure', () => {
    const features = buildPlaceFeatures(
      [
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Kruger National Park',
          site_id: '873',
          source_name: 'WDPCA',
          release_month: '2026-10-01',
          geom: { type: 'MultiPolygon', coordinates: [] },
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          name: 'Missing shape',
          site_id: null,
          source_name: 'WDPCA',
          release_month: '2026-10-01',
          geom: null,
        },
      ],
      [
        {
          place_id: '11111111-1111-1111-1111-111111111111',
          area_km2: 11.455618,
          percent: 0.0598,
        },
      ]
    );
    expect(features.features).toHaveLength(1);
    const popup = placePopupElement(features.features[0].properties);
    expect(popup.textContent).toContain('Kruger National Park');
    expect(popup.textContent).toContain('11.46 km²');
    expect(popup.textContent).toContain('0.1%');
    expect(popup.textContent).toContain('October 2026');
    expect(popup.querySelector('a')?.getAttribute('href')).toBe(
      'https://www.protectedplanet.net/873'
    );
  });
});
