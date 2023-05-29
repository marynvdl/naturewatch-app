import { defineStore } from 'pinia';
import { ref, type Ref } from 'vue';

const useTimelineStore = defineStore('timeline', () => {
  // State
  /** Loading overlay */
  const visible: Ref<boolean> = ref(false);
  const activeYear: Ref<number> = ref(2022);
  const lastActiveYear: Ref<number> = ref(2016);

  // Getters

  // Actions
  /** Set timeline visibility to true or false*/
  function toggleTimelineVisibility(setVisible: boolean): void {
    visible.value = setVisible;
  }

  /** Set active year*/
  function setActiveYear(newYear: number): void {
    lastActiveYear.value = activeYear.value;
    activeYear.value = newYear;
  }

  return {
    visible,
    activeYear,
    lastActiveYear,
    toggleTimelineVisibility,
    setActiveYear,
  };
});

export default useTimelineStore;
