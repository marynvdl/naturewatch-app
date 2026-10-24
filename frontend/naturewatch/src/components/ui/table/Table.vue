<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from 'cn';

const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <div
    data-slot="table-container"
    class="nw nw:relative nw:w-full nw:overflow-x-auto"
  >
    <table
      data-slot="table"
      :class="
        cn(
          'nw:w-full nw:caption-bottom nw:border-collapse nw:text-sm',
          props.class
        )
      "
    >
      <slot />
    </table>
  </div>
</template>
