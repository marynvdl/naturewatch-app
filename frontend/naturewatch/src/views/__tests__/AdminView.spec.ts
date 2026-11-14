import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AdminView from '@/views/AdminView.vue';
import { loadPhotoQueue } from '@/places/images';
import useAuthStore from '@/store/AuthStore';

vi.mock('@/places/images', async importOriginal => {
  const actual = await importOriginal<typeof import('@/places/images')>();
  return { ...actual, loadPhotoQueue: vi.fn() };
});

/** Stands in for the Photos editor, which has its own tests. */
const PhotosEditorStub = defineComponent({
  name: 'PlacePhotosEditor',
  props: { placeId: { type: String, required: true } },
  emits: ['changed'],
  template: '<div class="editor-stub">{{ placeId }}</div>',
});

const PLACES = [
  {
    placeId: 'a',
    name: 'Alpha Falls',
    placeType: 'world_heritage_site',
    suggested: 12,
  },
  {
    placeId: 'b',
    name: 'Beta Desert',
    placeType: 'world_heritage_site',
    suggested: 3,
  },
];

/**
 *
 */
function mountView() {
  return mount(AdminView, {
    global: {
      stubs: {
        PlacePhotosEditor: PhotosEditorStub,
        RouterLink: RouterLinkStub,
      },
    },
  });
}

describe('AdminView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(loadPhotoQueue).mockReset();
    vi.mocked(loadPhotoQueue).mockResolvedValue({
      status: 'ok',
      places: PLACES,
      total: 2,
    });
  });

  it('shows no queue to a visitor or a non-admin', async () => {
    const visitor = mountView();
    await flushPromises();
    expect(visitor.text()).toContain('This page is for admins.');
    expect(visitor.text()).toContain('Sign in');

    const auth = useAuthStore();
    auth.session = { user: { email: 'someone@example.test' } } as never;
    await flushPromises();
    expect(visitor.text()).toContain('This page is for admins.');
    expect(visitor.text()).not.toContain('Sign in');
    expect(visitor.find('.queue-list').exists()).toBe(false);
    expect(loadPhotoQueue).not.toHaveBeenCalled();
  });

  it('lists the places with their type and count, and opens the first', async () => {
    useAuthStore().isAdmin = true;
    const wrapper = mountView();
    await flushPromises();
    expect(loadPhotoQueue).toHaveBeenCalledWith(20, 0);
    const items = wrapper.findAll('.queue-item');
    expect(items.map(item => item.text())).toEqual([
      expect.stringContaining('Alpha Falls'),
      expect.stringContaining('Beta Desert'),
    ]);
    expect(items[0].text()).toContain('World Heritage · 12 suggested');
    expect(wrapper.text()).toContain('1–2 of 2 places');
    expect(wrapper.find('.editor-stub').text()).toBe('a');
    expect(items[0].attributes('aria-current')).toBe('true');
  });

  it('opens a chosen place, and Next place moves down the list', async () => {
    useAuthStore().isAdmin = true;
    const wrapper = mountView();
    await flushPromises();
    await wrapper.findAll('.queue-item')[1].trigger('click');
    expect(wrapper.find('.editor-stub').text()).toBe('b');

    await wrapper.findAll('.queue-item')[0].trigger('click');
    const next = wrapper
      .findAll('button')
      .find(button => button.text().includes('Next place'));
    await next!.trigger('click');
    expect(wrapper.find('.editor-stub').text()).toBe('b');
    expect(next!.attributes('disabled')).toBeDefined();
  });

  it('reloads the queue after a change, and keeps a finished place open', async () => {
    useAuthStore().isAdmin = true;
    const wrapper = mountView();
    await flushPromises();
    vi.mocked(loadPhotoQueue).mockResolvedValue({
      status: 'ok',
      places: [PLACES[1]],
      total: 1,
    });
    wrapper.findComponent(PhotosEditorStub).vm.$emit('changed');
    await flushPromises();
    expect(loadPhotoQueue).toHaveBeenCalledTimes(2);
    expect(wrapper.findAll('.queue-item')).toHaveLength(1);
    expect(wrapper.find('.editor-stub').text()).toBe('a');
    expect(wrapper.find('#place-title').text()).toBe('Alpha Falls');

    const next = wrapper
      .findAll('button')
      .find(button => button.text().includes('Next place'));
    await next!.trigger('click');
    expect(wrapper.find('.editor-stub').text()).toBe('b');
  });

  it('says when the queue is empty or fails', async () => {
    useAuthStore().isAdmin = true;
    vi.mocked(loadPhotoQueue).mockResolvedValue({
      status: 'ok',
      places: [],
      total: 0,
    });
    const empty = mountView();
    await flushPromises();
    expect(empty.text()).toContain('No place has suggested photographs.');

    vi.mocked(loadPhotoQueue).mockResolvedValue({ status: 'error' });
    const failed = mountView();
    await flushPromises();
    expect(failed.text()).toContain('The queue could not be loaded.');
  });
});
