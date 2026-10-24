<script setup lang="ts">
import type { SliderRootEmits, SliderRootProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { cn } from 'cn';
import {
  SliderRange,
  SliderRoot,
  SliderThumb,
  SliderTrack,
  useForwardPropsEmits,
} from 'reka-ui';

const props = defineProps<
  SliderRootProps & { class?: HTMLAttributes['class'] }
>();
const emits = defineEmits<SliderRootEmits>();

const delegatedProps = reactiveOmit(props, 'class');

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <SliderRoot
    v-slot="{ modelValue: values }"
    data-slot="slider"
    :data-vertical="props.orientation === 'vertical' ? '' : undefined"
    :class="
      cn(
        'nw nw:data-vertical:min-h-40 nw:relative nw:flex nw:w-full nw:touch-none nw:items-center nw:select-none nw:data-disabled:opacity-50 nw:data-vertical:h-full nw:data-vertical:w-auto nw:data-vertical:flex-col',
        props.class
      )
    "
    v-bind="forwarded"
  >
    <SliderTrack
      data-slot="slider-track"
      :data-horizontal="props.orientation !== 'vertical' ? '' : undefined"
      :data-vertical="props.orientation === 'vertical' ? '' : undefined"
      class="nw:bg-muted nw:rounded-full nw:data-horizontal:h-1.5 nw:data-vertical:w-1.5 nw:relative nw:grow nw:overflow-hidden nw:data-horizontal:w-full nw:data-vertical:h-full"
    >
      <SliderRange
        data-slot="slider-range"
        :data-horizontal="props.orientation !== 'vertical' ? '' : undefined"
        :data-vertical="props.orientation === 'vertical' ? '' : undefined"
        class="nw:bg-on nw:absolute nw:select-none nw:data-horizontal:h-full nw:data-vertical:w-full"
      />
    </SliderTrack>

    <SliderThumb
      v-for="(_, key) in values"
      :key="key"
      data-slot="slider-thumb"
      :data-vertical="props.orientation === 'vertical' ? '' : undefined"
      class="nw:border-on nw:ring-ring/50 nw:size-4 nw:rounded-full nw:border nw:bg-white nw:transition-colors nw:hover:ring-4 nw:focus-visible:ring-4 nw:focus-visible:outline-hidden nw:block nw:shrink-0 nw:select-none nw:disabled:pointer-events-none nw:disabled:opacity-50"
    />
  </SliderRoot>
</template>
