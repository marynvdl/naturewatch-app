<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { cn } from 'cn';
import TableCell from './TableCell.vue';
import TableRow from './TableRow.vue';

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes['class'];
    colspan?: number;
  }>(),
  {
    colspan: 1,
  }
);

const delegatedProps = reactiveOmit(props, 'class');
</script>

<template>
  <TableRow>
    <TableCell
      :class="
        cn(
          'nw:p-4 nw:whitespace-nowrap nw:align-middle nw:text-sm nw:text-foreground',
          props.class
        )
      "
      v-bind="delegatedProps"
    >
      <div class="nw:flex nw:items-center nw:justify-center nw:py-10">
        <slot />
      </div>
    </TableCell>
  </TableRow>
</template>
