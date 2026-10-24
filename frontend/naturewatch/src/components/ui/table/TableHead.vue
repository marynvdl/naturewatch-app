<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from 'cn';

const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <th
    data-slot="table-head"
    :class="
      cn(
        'nw:font-serif nw:italic nw:text-foreground nw:h-10 nw:px-2 nw:text-left nw:align-middle nw:text-base nw:font-medium nw:whitespace-nowrap nw:[&:has([role=checkbox])]:pr-0',
        props.class
      )
    "
  >
    <slot />
  </th>
</template>
