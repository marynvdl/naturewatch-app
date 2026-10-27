<template>
  <div class="about">
    <h1>This is an about page</h1>
    <Button type="button" @click="showSnackbar('Test')">Snackbar test</Button>
  </div>
</template>

<script lang="ts" setup>
import { useGlobal } from '@/store';
import { Button } from '@/components/ui/button';

/** Global Store */
const globalStore = useGlobal();

/** Display snackbar */
const showSnackbar = (message: string) => {
  globalStore.setMessage(message);
};
</script>

<style scoped>
.about {
  max-width: 720px;
  padding: 24px;
  font-family: var(--font-sans);
}

h1 {
  font-size: 1.5rem;
  font-weight: 500;
}
</style>
