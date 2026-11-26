import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { StoredCorrection } from '@/corrections/api';

/** The correction chosen in the Corrections list, and when the corrections change. */
const useCorrectionsStore = defineStore('corrections', () => {
  /** The correction chosen in the list. The map draws it thicker, even when rejected. */
  const chosen = ref<StoredCorrection | null>(null);
  /** Goes up after a save, a review, or a photo change, so the list and outlines read again. */
  const version = ref(0);

  /** Say that the corrections changed. */
  function changed() {
    version.value += 1;
  }

  return { chosen, version, changed };
});

export default useCorrectionsStore;
