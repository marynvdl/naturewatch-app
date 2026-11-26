<script setup lang="ts">
/**
 * The place type buttons and More…, as the Places panel and the Filter window
 * both show them. The panel holds which types are on.
 */
defineProps<{
  /** The buttons shown, in order. */
  buttons: readonly { id: string; label: string }[];
  /** The ids of the buttons that are on. */
  selected: readonly string[];
  /** Whether More… has added the recognition buttons. */
  showMore: boolean;
}>();

defineEmits<{
  /** A type button was pressed. */
  select: [id: string];
  /** More… or Less was pressed. */
  more: [];
}>();
</script>

<template>
  <div class="places-types" role="group" aria-label="Place types">
    <button
      v-for="type in buttons"
      :key="type.id"
      type="button"
      class="place-type map-control"
      :class="{ 'is-on': selected.includes(type.id) }"
      :aria-pressed="selected.includes(type.id)"
      @click="$emit('select', type.id)"
    >
      {{ type.label }}
    </button>
    <button
      type="button"
      class="place-type-more"
      :aria-expanded="showMore"
      @click="$emit('more')"
    >
      {{ showMore ? 'Less' : 'More…' }}
    </button>
  </div>
</template>

<style scoped>
.places-types {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: 6px;
}

.place-type {
  white-space: nowrap;
}

/* A text link, so it does not read as another place type. */
.place-type-more {
  height: 32px;
  margin: 0;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--muted-foreground);
  font: inherit;
  font-size: 13px;
  text-decoration: underline;
  text-decoration-color: var(--border);
  text-underline-offset: 3px;
  cursor: pointer;
}

.place-type-more:hover {
  color: var(--foreground);
  text-decoration-color: currentColor;
}

.place-type-more:focus-visible {
  outline: 2px solid var(--foreground);
  outline-offset: 2px;
  border-radius: 4px;
}
</style>
