import { beforeEach, describe, expect, it } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AccountButton from '@/components/AccountButton.vue';
import useAuthStore from '@/store/AuthStore';
import usePlacesStore from '@/store/PlacesStore';

/**
 * Sign in, mount the button, and open its panel.
 * @param admin - Whether the user is an admin.
 * @returns The mounted button and the document body, where the panel renders.
 */
async function openPanel(admin: boolean) {
  const auth = useAuthStore();
  auth.$patch({ session: { user: { email: 'a@example.test' } } } as never);
  auth.isAdmin = admin;
  const wrapper = mount(AccountButton, { attachTo: document.body });
  await flushPromises();
  await wrapper.get('button[aria-label="Account"]').trigger('click');
  await flushPromises();
  return { wrapper, body: new DOMWrapper(document.body) };
}

describe('Account button', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('shows no admin controls to someone without the role', async () => {
    const { wrapper, body } = await openPanel(false);
    expect(body.text()).toContain('Sign out');
    expect(body.find('[aria-label="Edit mode"]').exists()).toBe(false);
    expect(body.text()).not.toContain('Photo queue');
    wrapper.unmount();
  });

  it('turns Edit mode on and off, with the admin lists only in Edit mode', async () => {
    const auth = useAuthStore();
    const places = usePlacesStore();
    const { wrapper, body } = await openPanel(true);
    const listButton = () =>
      body
        .findAll('button')
        .find(button => button.text() === 'Needs attention');
    const edit = body.get('button[aria-label="Edit mode"]');
    expect(edit.attributes('aria-pressed')).toBe('false');
    expect(listButton()).toBeUndefined();

    await edit.trigger('click');
    expect(auth.editMode).toBe(true);
    expect(edit.classes()).toContain('is-on');
    // The photo queue is a filter on the places list now.
    expect(body.text()).not.toContain('Photo queue');
    await listButton()!.trigger('click');
    await flushPromises();
    expect(places.adminList).toBe('attention');

    // Turning Edit mode off closes the list.
    await wrapper.get('button[aria-label="Account"]').trigger('click');
    await flushPromises();
    await body.get('button[aria-label="Edit mode"]').trigger('click');
    await flushPromises();
    expect(auth.editMode).toBe(false);
    expect(places.adminList).toBeNull();
    expect(listButton()).toBeUndefined();
    wrapper.unmount();
  });
});
