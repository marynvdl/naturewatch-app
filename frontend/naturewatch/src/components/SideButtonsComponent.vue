<script setup lang="ts">
import InfoButtonComponent from './InfoButtonComponent.vue';
</script>

<template>
  <div class="info-button-container">
    <InfoButtonComponent />
  </div>
</template>

<style scoped>
.info-button-container {
  position: absolute;
  right: 12px;
  bottom: 16px;
  left: auto;
  z-index: 10;
  width: auto;
  box-shadow: none;
}
</style>
