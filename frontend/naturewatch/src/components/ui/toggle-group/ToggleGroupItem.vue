<script setup lang="ts">
import type { VariantProps } from 'class-variance-authority';
import type { ToggleGroupItemProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { cn } from 'cn';
import { ToggleGroupItem, useForwardProps } from 'reka-ui';
import { inject } from 'vue';
import { toggleVariants } from '@/components/ui/toggle';

type ToggleGroupVariants = VariantProps<typeof toggleVariants> & {
  spacing?: number;
};

const props = defineProps<
  ToggleGroupItemProps & {
    class?: HTMLAttributes['class'];
    variant?: ToggleGroupVariants['variant'];
    size?: ToggleGroupVariants['size'];
  }
>();

const context = inject<ToggleGroupVariants>('toggleGroup');

const delegatedProps = reactiveOmit(props, 'class', 'size', 'variant');
const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <ToggleGroupItem
    v-slot="slotProps"
    data-slot="toggle-group-item"
    :data-variant="context?.variant || variant"
    :data-size="context?.size || size"
    :data-spacing="context?.spacing"
    v-bind="forwardedProps"
    :class="
      cn(
        'nw:data-[state=on]:bg-on nw:data-[state=on]:text-on-foreground nw:group-data-[spacing=0]/toggle-group:rounded-none nw:group-data-[spacing=0]/toggle-group:px-3.5 nw:group-data-[spacing=0]/toggle-group:first:rounded-l-full nw:group-data-[spacing=0]/toggle-group:last:rounded-r-full nw:group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-1.5 nw:group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-1.5 nw:shrink-0 nw:focus:z-10 nw:focus-visible:z-10 nw:group-data-[spacing=0]/toggle-group:data-[variant=outline]:border-l-0 nw:group-data-[spacing=0]/toggle-group:data-[variant=outline]:first:border-l',
        toggleVariants({
          variant: context?.variant || variant,
          size: context?.size || size,
        }),
        props.class
      )
    "
  >
    <slot v-bind="slotProps" />
  </ToggleGroupItem>
</template>
