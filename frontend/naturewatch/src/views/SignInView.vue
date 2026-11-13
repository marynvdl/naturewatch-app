<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import useAuthStore from '@/store/AuthStore';

/** Admin sign-in by email magic link. Visitors are not sent here. */
const auth = useAuthStore();
const address = ref('');
const state = ref<'idle' | 'sending' | 'sent'>('idle');
const error = ref('');
const signedInText = computed(
  () => `Signed in as ${auth.email}${auth.isAdmin ? ', admin' : ''}.`
);

/** Ask for a magic link for the typed address. */
async function send() {
  const email = address.value.trim();
  if (!email) return;
  state.value = 'sending';
  error.value = '';
  const message = await auth.signIn(email);
  if (message) {
    error.value = message;
    state.value = 'idle';
  } else {
    state.value = 'sent';
  }
}
</script>

<template>
  <main class="signin-page">
    <section class="signin-card" aria-labelledby="signin-title">
      <h1 id="signin-title" class="panel-heading">Sign in</h1>

      <p v-if="!auth.configured" class="signin-text">
        Sign-in is not configured on this site.
      </p>

      <template v-else-if="auth.signedIn">
        <p class="signin-text nw:break-all">{{ signedInText }}</p>
        <div class="signin-actions">
          <Button as-child>
            <router-link to="/">Back to the map</router-link>
          </Button>
          <Button variant="outline" @click="auth.signOut()">Sign out</Button>
        </div>
      </template>

      <p v-else-if="state === 'sent'" class="signin-text" role="status">
        Check your email. If the address belongs to an account, a sign-in link
        is on its way.
      </p>

      <form v-else class="signin-form" @submit.prevent="send">
        <label class="signin-label" for="signin-email">
          Email
          <Input
            id="signin-email"
            v-model="address"
            type="email"
            autocomplete="email"
            required
          />
        </label>
        <p v-if="error" class="signin-error" role="alert">{{ error }}</p>
        <Button type="submit" class="nw:w-fit" :disabled="state === 'sending'">
          Send link
        </Button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.signin-page {
  display: grid;
  height: 100%;
  padding: 16px;
  overflow: auto;
  place-items: center;
  background: #f8f9f9;
  font-family: var(--font-sans);
}

.signin-card {
  box-sizing: border-box;
  display: flex;
  width: min(360px, 100%);
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
}

.signin-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}

.signin-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.signin-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}

.signin-error {
  margin: 0;
  color: #b42318;
  font-size: 13px;
}

.signin-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
