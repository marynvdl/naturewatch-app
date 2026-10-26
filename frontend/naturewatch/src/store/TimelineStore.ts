import { defineStore } from 'pinia';
import { ref, type Ref } from 'vue';
import { timelineRange } from '@/catalog';

const useTimelineStore = defineStore('timeline', () => {
  // State
  /** Loading overlay */
  const visible: Ref<boolean> = ref(false);
  const activeYear: Ref<number> = ref(timelineRange.max);
  const lastActiveYear: Ref<number> = ref(timelineRange.min);

  // Getters

  // Actions
  /**
   * Set timeline visibility to true or false
   * @param setVisible
   */
  function toggleTimelineVisibility(setVisible: boolean): void {
    visible.value = setVisible;
  }

  /**
   * Set the active year and remember the year it replaces.
   * @param {number} newYear - The year to be set as the active year.
   */
  function setActiveYear(newYear: number): void {
    if (newYear === activeYear.value) return;
    lastActiveYear.value = activeYear.value;
    activeYear.value = newYear;
  }

  /**
   * Move the active year while the slider is still moving.
   * The year from before that move stays in place until the slider is released.
   * @param {number} newYear - The year under the slider thumb.
   */
  function previewActiveYear(newYear: number): void {
    activeYear.value = newYear;
  }

  /**
   * Remember the year that was selected before the latest slider change.
   * @param {number} year - The year to return to.
   */
  function setPreviousYear(year: number): void {
    lastActiveYear.value = year;
  }

  return {
    visible,
    activeYear,
    lastActiveYear,
    toggleTimelineVisibility,
    setActiveYear,
    previewActiveYear,
    setPreviousYear,
  };
});

export default useTimelineStore;
