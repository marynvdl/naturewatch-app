import { defineStore } from 'pinia';
import { ref, type Ref } from 'vue';

const useDrawerStore = defineStore('drawer', () => {
  // State
  const visible: Ref<boolean> = ref(true);
  const width = ref('128');

  // Getters

  // Actions
  /** Set drawer visibility to true or false*/
  function toggleDrawerVisibility(): void {
    visible.value = !visible.value;
  }
  return { visible, width, toggleDrawerVisibility };
});

export default useDrawerStore;
