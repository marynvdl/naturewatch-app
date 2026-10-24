<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from 'cn';

const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <tr
    data-slot="table-row"
    :class="
      cn(
        'nw:hover:bg-muted/50 nw:data-[state=selected]:bg-on/10 nw:border-border nw:border-b nw:transition-colors nw:has-aria-expanded:bg-muted/50',
        props.class
      )
    "
  >
    <slot />
  </tr>
</template>
