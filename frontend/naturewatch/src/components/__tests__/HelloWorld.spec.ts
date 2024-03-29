import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import vuetify, { components } from '@/plugins/vuetify';

import HelloWorld from '../MapComponent.vue';

describe('HelloWorld', () => {
  const wrapper = mount(HelloWorld, {
    global: { plugins: [vuetify] },
    props: { msg: 'Hello Vitest' },
  });

  it('mount component', async () => {
    expect(HelloWorld).toBeTruthy();

    const img = wrapper.findComponent(components.VImg);
    expect(img).toBeTruthy();
  });

  it('renders properly', () => {
    expect(wrapper.text()).toContain('Hello Vitest');
  });
});
