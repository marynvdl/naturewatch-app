<script setup lang="ts">
import type { VariantProps } from 'class-variance-authority';
import type { ToggleGroupRootEmits, ToggleGroupRootProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import type { toggleVariants } from '@/components/ui/toggle';
import { reactiveOmit } from '@vueuse/core';
import { cn } from 'cn';
import { ToggleGroupRoot, useForwardPropsEmits } from 'reka-ui';
import { provide } from 'vue';

type ToggleGroupVariants = VariantProps<typeof toggleVariants>;

const props = withDefaults(
  defineProps<
    ToggleGroupRootProps & {
      class?: HTMLAttributes['class'];
      variant?: ToggleGroupVariants['variant'];
      size?: ToggleGroupVariants['size'];
      spacing?: number;
    }
  >(),
  {
    spacing: 0,
  }
);

const emits = defineEmits<ToggleGroupRootEmits>();

provide('toggleGroup', {
  variant: props.variant,
  size: props.size,
  spacing: props.spacing,
});

const delegatedProps = reactiveOmit(props, 'class', 'size', 'variant');
const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <ToggleGroupRoot
    v-slot="slotProps"
    data-slot="toggle-group"
    :data-size="size"
    :data-variant="variant"
    :data-spacing="spacing"
    :style="{
      '--gap': spacing,
    }"
    v-bind="forwarded"
    :data-orientation="orientation || 'horizontal'"
    :class="
      cn(
        'nw nw:rounded-full nw:group/toggle-group nw:flex nw:w-fit nw:flex-row nw:items-center nw:gap-[--spacing(var(--gap))] nw:data-vertical:flex-col nw:data-vertical:items-stretch',
        props.class
      )
    "
  >
    <slot v-bind="slotProps" />
  </ToggleGroupRoot>
</template>
