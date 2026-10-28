<script setup lang="ts">
defineProps<{
  name: string;
}>();

defineEmits<{
  close: [];
  zoom: [];
}>();
</script>

<template>
  <section class="place-profile" aria-label="Place">
    <div class="place-profile-head">
      <h2 class="panel-heading">{{ name }}</h2>
      <button type="button" aria-label="Close place" @click="$emit('close')">
        Close
      </button>
    </div>
    <button type="button" class="map-control" @click="$emit('zoom')">
      Zoom to place
    </button>
  </section>
</template>

<style scoped>
.place-profile {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 16px;
}

.place-profile-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.panel-heading {
  min-width: 0;
  overflow-wrap: anywhere;
}

button[aria-label='Close place'] {
  flex: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: #5f7168;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.map-control {
  align-self: flex-start;
}
</style>
