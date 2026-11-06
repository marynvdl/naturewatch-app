import { defineStore } from 'pinia';

export const useMeasureStore = defineStore('measure', {
  state: () => ({
    shouldDeleteAll: false,
    /** True while a drawing or editing mode is on, not just selecting. */
    drawing: false,
  }),
  actions: {
    triggerDeleteAll() {
      this.shouldDeleteAll = true;
    },
    setDrawing(drawing: boolean) {
      this.drawing = drawing;
    },
    resetDeleteAllTrigger() {
      this.shouldDeleteAll = false;
    },
  },
});
