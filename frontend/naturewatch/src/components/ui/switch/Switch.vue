<script setup lang="ts">
import type { SwitchRootEmits, SwitchRootProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { cn } from 'cn';
import { SwitchRoot, SwitchThumb, useForwardPropsEmits } from 'reka-ui';

const props = withDefaults(
  defineProps<
    SwitchRootProps & {
      class?: HTMLAttributes['class'];
      size?: 'sm' | 'default';
    }
  >(),
  {
    size: 'default',
  }
);

const emits = defineEmits<SwitchRootEmits>();

const delegatedProps = reactiveOmit(props, 'class', 'size');

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <SwitchRoot
    v-slot="slotProps"
    data-slot="switch"
    :data-size="size"
    v-bind="forwarded"
    :class="
      cn(
        'nw nw:appearance-none nw:data-[state=checked]:bg-on nw:data-[state=unchecked]:bg-input nw:focus-visible:border-ring nw:focus-visible:ring-ring/50 nw:aria-invalid:ring-destructive/20 nw:dark:aria-invalid:ring-destructive/40 nw:aria-invalid:border-destructive nw:dark:aria-invalid:border-destructive/50 nw:dark:data-[state=unchecked]:bg-input/80 nw:shrink-0 nw:rounded-full nw:border nw:border-transparent nw:focus-visible:ring-3 nw:aria-invalid:ring-3 nw:data-[size=default]:h-[18.4px] nw:data-[size=default]:w-8 nw:data-[size=sm]:h-3.5 nw:data-[size=sm]:w-6 nw:peer nw:group/switch nw:relative nw:inline-flex nw:items-center nw:transition-colors nw:outline-none nw:after:absolute nw:after:-inset-x-3 nw:after:-inset-y-2 nw:data-disabled:cursor-not-allowed nw:data-disabled:opacity-50',
        props.class
      )
    "
  >
    <SwitchThumb
      data-slot="switch-thumb"
      class="nw:bg-background nw:dark:data-[state=unchecked]:bg-foreground nw:dark:data-[state=checked]:bg-primary-foreground nw:rounded-full nw:group-data-[size=default]/switch:size-4 nw:group-data-[size=sm]/switch:size-3 nw:group-data-[size=default]/switch:data-[state=checked]:translate-x-[calc(100%-2px)] nw:group-data-[size=sm]/switch:data-[state=checked]:translate-x-[calc(100%-2px)] nw:group-data-[size=default]/switch:data-[state=unchecked]:translate-x-0 nw:group-data-[size=sm]/switch:data-[state=unchecked]:translate-x-0 nw:pointer-events-none nw:block nw:ring-0 nw:transition-transform"
    >
      <slot name="thumb" v-bind="slotProps" />
    </SwitchThumb>
  </SwitchRoot>
</template>
