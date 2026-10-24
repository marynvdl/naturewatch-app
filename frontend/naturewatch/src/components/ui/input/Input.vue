<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { useVModel } from '@vueuse/core';
import { cn } from 'cn';

const props = defineProps<{
  defaultValue?: string | number;
  modelValue?: string | number;
  class?: HTMLAttributes['class'];
}>();

const emits = defineEmits<{
  (e: 'update:modelValue', payload: string | number): void;
}>();

const modelValue = useVModel(props, 'modelValue', emits, {
  passive: true,
  defaultValue: props.defaultValue,
});
</script>

<template>
  <input
    v-model="modelValue"
    data-slot="input"
    :class="
      cn(
        'nw nw:appearance-none nw:dark:bg-input/30 nw:border-input nw:focus-visible:border-ring nw:focus-visible:ring-ring/50 nw:aria-invalid:ring-destructive/20 nw:dark:aria-invalid:ring-destructive/40 nw:aria-invalid:border-destructive nw:dark:aria-invalid:border-destructive/50 nw:h-9 nw:rounded-md nw:border nw:bg-white nw:px-2.5 nw:py-1 nw:text-base nw:transition-colors nw:file:h-7 nw:file:text-sm nw:file:font-medium nw:focus-visible:ring-3 nw:aria-invalid:ring-3 nw:md:text-sm nw:w-full nw:min-w-0 nw:outline-none nw:file:inline-flex nw:file:border-0 nw:file:bg-transparent nw:file:text-foreground nw:placeholder:text-muted-foreground nw:disabled:pointer-events-none nw:disabled:cursor-not-allowed nw:disabled:opacity-50',
        props.class
      )
    "
  />
</template>
