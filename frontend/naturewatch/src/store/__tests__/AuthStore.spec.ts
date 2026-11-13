import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AccountButton from '@/components/AccountButton.vue';
import useAuthStore from '@/store/AuthStore';

const auth = {
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithOtp: vi.fn(),
  signOut: vi.fn(),
};
const rpc = vi.fn();
let configured = true;

vi.mock('@/plugins/supabase', () => ({
  supabaseClient: () => (configured ? { auth, rpc } : null),
}));

const session = {
  access_token: 'token',
  user: { id: 'user-1', email: 'admin@example.test' },
};

describe('Auth store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configured = true;
    setActivePinia(createPinia());
    auth.getSession.mockResolvedValue({ data: { session: null } });
    auth.signInWithOtp.mockResolvedValue({ error: null });
    auth.signOut.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ data: false, error: null });
  });

  it('starts signed out without asking for a role', async () => {
    const store = useAuthStore();
    await store.start();
    expect(store.signedIn).toBe(false);
    expect(store.isAdmin).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reads the admin role for a stored session', async () => {
    auth.getSession.mockResolvedValue({ data: { session } });
    rpc.mockResolvedValue({ data: true, error: null });
    const store = useAuthStore();
    await store.start();
    expect(rpc).toHaveBeenCalledWith('has_role', { role: 'admin' });
    expect(store.email).toBe('admin@example.test');
    expect(store.isAdmin).toBe(true);
  });

  it('treats a failed role read as not an admin', async () => {
    auth.getSession.mockResolvedValue({ data: { session } });
    rpc.mockResolvedValue({ data: null, error: { message: 'nope' } });
    const store = useAuthStore();
    await store.start();
    expect(store.isAdmin).toBe(false);
  });

  it('asks for a link without creating a user', async () => {
    const store = useAuthStore();
    expect(await store.signIn('admin@example.test')).toBeNull();
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'admin@example.test',
      options: {
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin,
      },
    });
  });

  it('reports a link that could not be sent', async () => {
    auth.signInWithOtp.mockResolvedValue({
      error: { message: 'Signups not allowed' },
    });
    const store = useAuthStore();
    expect(await store.signIn('someone@example.test')).toBe(
      'The link could not be sent.'
    );
  });

  it('turns edit mode on for an admin only, and off on sign-out', async () => {
    const store = useAuthStore();
    store.setEditMode(true);
    expect(store.editMode).toBe(false);

    auth.getSession.mockResolvedValue({ data: { session } });
    rpc.mockResolvedValue({ data: true, error: null });
    await store.start();
    store.setEditMode(true);
    expect(store.editMode).toBe(true);

    await store.signOut();
    expect(auth.signOut).toHaveBeenCalled();
    expect(store.signedIn).toBe(false);
    expect(store.isAdmin).toBe(false);
    expect(store.editMode).toBe(false);
  });

  it('says sign-in is not configured without a client', async () => {
    configured = false;
    const store = useAuthStore();
    await store.start();
    expect(store.configured).toBe(false);
    expect(await store.signIn('admin@example.test')).toBe(
      'Sign-in is not configured.'
    );
  });
});

describe('Account button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configured = true;
    setActivePinia(createPinia());
    auth.getSession.mockResolvedValue({ data: { session } });
    rpc.mockResolvedValue({ data: true, error: null });
  });

  it('is hidden from visitors', () => {
    const wrapper = mount(AccountButton);
    expect(wrapper.find('[aria-label="Account"]').exists()).toBe(false);
  });

  it('shows while someone is signed in', async () => {
    await useAuthStore().start();
    const wrapper = mount(AccountButton);
    await flushPromises();
    expect(wrapper.find('[aria-label="Account"]').exists()).toBe(true);
  });
});
