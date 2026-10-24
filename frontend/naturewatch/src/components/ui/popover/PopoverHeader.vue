<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from 'cn';

const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <div
    data-slot="popover-header"
    :class="cn('nw:flex nw:flex-col nw:gap-1 nw:text-sm', props.class)"
  >
    <slot />
  </div>
</template>
