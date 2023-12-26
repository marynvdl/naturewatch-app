import { defineStore } from 'pinia';

export const useMeasureStore = defineStore('measure', {
  state: () => ({
    shouldDeleteAll: false,
  }),
  actions: {
    triggerDeleteAll() {
      this.shouldDeleteAll = true;
    },
    resetDeleteAllTrigger() {
      this.shouldDeleteAll = false;
    },
  },
});
