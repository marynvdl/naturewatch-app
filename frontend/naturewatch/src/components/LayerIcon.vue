<script setup lang="ts">
import { computed } from 'vue';
import { layerIcon } from '@/icons/layerIcon';

const props = withDefaults(
  defineProps<{
    name?: string;
    size?: number;
  }>(),
  { size: 16 }
);

const icon = computed(() => layerIcon(props.name));
</script>

<template>
  <component
    :is="icon"
    v-if="icon"
    :size="size"
    :stroke-width="1.75"
    aria-hidden="true"
  />
</template>
