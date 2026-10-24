<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import type { ButtonVariants } from '@/components/ui/button';
import { Button } from '@/components/ui/button';

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariants['variant'];
    class?: HTMLAttributes['class'];
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
    label: string;
  }>(),
  {
    variant: 'outline',
    type: 'button',
  }
);
</script>

<template>
  <Button
    :variant="props.variant"
    size="icon"
    :class="props.class"
    :disabled="props.disabled"
    :type="props.type"
    :aria-label="props.label"
  >
    <slot />
  </Button>
</template>
