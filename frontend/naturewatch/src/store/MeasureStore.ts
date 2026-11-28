import { defineStore } from 'pinia';

export const useMeasureStore = defineStore('measure', {
  state: () => ({
    shouldDeleteAll: false,
    /** True while a drawing or editing mode is on, not just selecting. */
    drawing: false,
    /** True while a boundary is edited on the map, in its own draw tool. */
    editingBoundary: false,
  }),
  getters: {
    /** Whether a click on the map places a point instead of choosing a place. */
    busy: state => state.drawing || state.editingBoundary,
  },
  actions: {
    triggerDeleteAll() {
      this.shouldDeleteAll = true;
    },
    setDrawing(drawing: boolean) {
      this.drawing = drawing;
    },
    setEditingBoundary(editing: boolean) {
      this.editingBoundary = editing;
    },
    resetDeleteAllTrigger() {
      this.shouldDeleteAll = false;
    },
  },
});
