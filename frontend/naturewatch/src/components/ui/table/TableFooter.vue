<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from 'cn';

const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <tfoot
    data-slot="table-footer"
    :class="
      cn(
        'bg-muted/50 nw:border-t nw:font-medium nw:[&>tr]:last:border-b-0',
        props.class
      )
    "
  >
    <slot />
  </tfoot>
</template>
