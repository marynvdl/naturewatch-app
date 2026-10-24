<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from 'cn';

const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <td
    data-slot="table-cell"
    :class="
      cn(
        'nw:p-2 nw:align-middle nw:whitespace-nowrap nw:[&:has([role=checkbox])]:pr-0',
        props.class
      )
    "
  >
    <slot />
  </td>
</template>
