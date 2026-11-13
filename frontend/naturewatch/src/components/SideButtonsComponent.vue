<script setup lang="ts">
import AccountButton from './AccountButton.vue';
import InfoButtonComponent from './InfoButtonComponent.vue';
</script>

<template>
  <div class="info-button-container">
    <InfoButtonComponent />
  </div>
  <!-- Top right, clear of the map controls and the Measure panel. -->
  <div class="account-button-container">
    <AccountButton />
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

.account-button-container {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 10;
  display: flex;
}
</style>
