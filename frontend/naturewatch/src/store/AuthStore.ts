import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Session } from '@supabase/supabase-js';
import { supabaseClient } from '@/lib/supabase';

/**
 * The signed-in session. Only admins sign in, by email magic link.
 * Sign-up is closed: a link is sent only to an existing user.
 */
const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null);
  const isAdmin = ref(false);
  /** Admins switch a place profile between viewing and editing. */
  const editMode = ref(false);
  const started = ref(false);

  const email = computed(() => session.value?.user.email ?? null);
  const signedIn = computed(() => session.value !== null);
  const configured = computed(() => supabaseClient() !== null);

  /** Whether the signed-in user holds `admin`. False on any error. */
  async function readRole() {
    const client = supabaseClient();
    if (!client || !session.value) {
      isAdmin.value = false;
      return;
    }
    const { data, error } = await client.rpc('has_role', { role: 'admin' });
    isAdmin.value = !error && data === true;
  }

  /**
   * Take a new session, and read the role when the user changed.
   * @param next - The session, or null after sign-out.
   */
  async function applySession(next: Session | null) {
    const changedUser = next?.user.id !== session.value?.user.id;
    session.value = next;
    if (!next) {
      isAdmin.value = false;
      editMode.value = false;
      return;
    }
    if (changedUser) await readRole();
  }

  /** Read the stored session and follow later changes. Safe to call more than once. */
  async function start() {
    if (started.value) return;
    started.value = true;
    const client = supabaseClient();
    if (!client) return;
    client.auth.onAuthStateChange((_event, next) => {
      // Supabase warns against awaiting client calls inside this callback.
      setTimeout(() => void applySession(next), 0);
    });
    const { data } = await client.auth.getSession();
    await applySession(data.session);
  }

  /**
   * Send a magic link that returns to this site.
   * @param address - The email to send it to.
   * @returns An error message, or null when the link was sent.
   */
  async function signIn(address: string): Promise<string | null> {
    const client = supabaseClient();
    if (!client) return 'Sign-in is not configured.';
    const { error } = await client.auth.signInWithOtp({
      email: address,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin,
      },
    });
    return error ? 'The link could not be sent.' : null;
  }

  /**
   * End the session and leave edit mode.
   */
  async function signOut() {
    const client = supabaseClient();
    if (client) await client.auth.signOut();
    await applySession(null);
  }

  /**
   * Switch edit mode. Only an admin can turn it on.
   * @param on - True for edit mode.
   */
  function setEditMode(on: boolean) {
    editMode.value = on && isAdmin.value;
  }

  return {
    session,
    isAdmin,
    editMode,
    email,
    signedIn,
    configured,
    start,
    signIn,
    signOut,
    setEditMode,
  };
});

export default useAuthStore;
