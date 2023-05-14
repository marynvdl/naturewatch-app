import { defineStore } from 'pinia';
import { ref, type Ref } from 'vue';

const useTimelineStore = defineStore('timeline', () => {
  // State
  /** Loading overlay */
  const visible: Ref<boolean> = ref(false);
  const activeYear: Ref<number> = ref(2022);

  // Getters

  // Actions
  /** Set timeline visibility to true or false*/
  function toggleTimelineVisibility(setVisible: boolean): void {
    visible.value = setVisible;
  }

  /** Set active year*/
  function setActiveYear(newYear: number): void {
    activeYear.value = newYear;
  }

  return { visible, activeYear, toggleTimelineVisibility, setActiveYear };
});

export default useTimelineStore;
