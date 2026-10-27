import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import vuetify from '@/plugins/vuetify';

import MapComponent from '../MapComponent.vue';

vi.mock('mapbox-gl', () => {
  class Map {
    on() {
      return this;
    }
    off() {
      return this;
    }
    addControl() {
      return this;
    }
    areTilesLoaded() {
      return true;
    }
    isMoving() {
      return false;
    }
    loaded() {
      return true;
    }
  }
  class NavigationControl {}
  class GeolocateControl {}
  return { Map, NavigationControl, GeolocateControl };
});

describe('Map', () => {
  it('mounts the round controls', () => {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList;

    const wrapper = mount(MapComponent, {
      global: { plugins: [vuetify, createPinia()] },
      props: { msg: 'Hello Vitest' },
    });

    expect(wrapper.text()).toContain('Places');
    expect(wrapper.text()).toContain('Landscape');
    expect(wrapper.text()).toContain('Measure');
  });
});
