<script setup lang="ts">
import { X } from '@lucide/vue';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { Button } from '@/components/ui/button';

/** A form for edit mode, centred over the map, with Save and Cancel at its foot. */
defineProps<{
  title: string;
  /** What the dialog does, for screen readers. */
  description: string;
  /** The submit button's text. */
  submitLabel: string;
  /** The submit button is off, for example until the form is complete. */
  submitDisabled?: boolean;
  /** A save is running. Cancel is off. */
  busy?: boolean;
  /** Why the last save failed. */
  error?: string;
}>();

const open = defineModel<boolean>('open', { required: true });

const emit = defineEmits<{ submit: [] }>();
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="edit-overlay" />
      <DialogContent class="edit-dialog nw">
        <form class="edit-form" @submit.prevent="emit('submit')">
          <header class="edit-head">
            <DialogTitle class="edit-title">{{ title }}</DialogTitle>
            <DialogClose
              class="edit-close map-control map-icon"
              :aria-label="`Close ${title.toLowerCase()}`"
            >
              <X aria-hidden="true" />
            </DialogClose>
          </header>
          <DialogDescription class="edit-sr">{{ description }}</DialogDescription>
          <div class="edit-body">
            <slot />
            <p v-if="error" class="edit-error" role="alert">{{ error }}</p>
          </div>
          <footer class="edit-foot">
            <Button
              type="button"
              variant="outline"
              :disabled="busy"
              @click="open = false"
            >
              Cancel
            </Button>
            <Button type="submit" :disabled="submitDisabled || busy">
              {{ submitLabel }}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.edit-overlay {
  position: fixed;
  inset: 0;
  z-index: 1300;
  background: rgba(36, 49, 44, 0.35);
}

.edit-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 1301;
  display: flex;
  flex-direction: column;
  width: min(560px, calc(100vw - 32px));
  max-height: min(720px, calc(100dvh - 32px));
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--background);
  transform: translate(-50%, -50%);
}

.edit-dialog:focus-visible {
  outline: none;
}

.edit-form {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.edit-head {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  height: 60px;
  padding: 0 60px;
  border-bottom: 1px solid var(--border);
}

.edit-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.edit-close {
  position: absolute;
  top: 12px;
  right: 12px;
  cursor: pointer;
}

.edit-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.edit-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  padding: 24px;
  overflow-y: auto;
}

.edit-error {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--destructive, #b42318);
}

.edit-foot {
  display: flex;
  flex: none;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}
</style>
