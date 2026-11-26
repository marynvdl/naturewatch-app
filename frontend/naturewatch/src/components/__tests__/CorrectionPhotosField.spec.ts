import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import CorrectionPhotosField from '@/components/CorrectionPhotosField.vue';

/**
 * Photos to show.
 * @param count - How many.
 */
const photos = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    key: `p${index}`,
    src: `blob:${index}`,
  }));

describe('CorrectionPhotosField', () => {
  it('passes on only as many files as there is room for', async () => {
    const wrapper = mount(CorrectionPhotosField, {
      props: { photos: photos(5) },
    });
    const input = wrapper.get('input[type="file"]');
    const files = [
      new File(['1'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['2'], 'b.jpg', { type: 'image/jpeg' }),
    ];
    Object.defineProperty(input.element, 'files', { value: files });
    await input.trigger('change');
    expect(wrapper.emitted('add')).toEqual([[[files[0]]]]);
  });

  it('removes a photo and hides Add photos when full', async () => {
    const wrapper = mount(CorrectionPhotosField, {
      props: { photos: photos(6) },
    });
    expect(wrapper.find('input[type="file"]').exists()).toBe(false);
    await wrapper.get('button[aria-label="Remove photo 2"]').trigger('click');
    expect(wrapper.emitted('remove')).toEqual([['p1']]);
  });
});
