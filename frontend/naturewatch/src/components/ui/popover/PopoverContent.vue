<script setup lang="ts">
import type { PopoverContentEmits, PopoverContentProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { cn } from 'cn';
import { PopoverContent, PopoverPortal, useForwardPropsEmits } from 'reka-ui';

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(
  defineProps<PopoverContentProps & { class?: HTMLAttributes['class'] }>(),
  {
    align: 'center',
    sideOffset: 4,
  }
);
const emits = defineEmits<PopoverContentEmits>();

const delegatedProps = reactiveOmit(props, 'class');

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <PopoverPortal>
    <PopoverContent
      data-slot="popover-content"
      v-bind="{ ...$attrs, ...forwarded }"
      :class="
        cn(
          'nw nw:bg-popover nw:text-popover-foreground nw:data-open:animate-in nw:data-closed:animate-out nw:data-closed:fade-out-0 nw:data-open:fade-in-0 nw:data-closed:zoom-out-95 nw:data-open:zoom-in-95 nw:data-[side=bottom]:slide-in-from-top-2 nw:data-[side=left]:slide-in-from-right-2 nw:data-[side=right]:slide-in-from-left-2 nw:data-[side=top]:slide-in-from-bottom-2 nw:border-border nw:flex nw:flex-col nw:gap-4 nw:rounded-md nw:border nw:p-4 nw:text-sm nw:duration-100 nw:z-50 nw:w-72 nw:max-w-(--reka-popover-content-available-width) nw:origin-(--reka-popover-content-transform-origin) nw:outline-hidden',
          props.class
        )
      "
    >
      <slot />
    </PopoverContent>
  </PopoverPortal>
</template>
