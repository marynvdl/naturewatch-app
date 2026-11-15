<script setup lang="ts">
import { computed, ref } from 'vue';
import { Images, LogOut, Pencil, UserRound } from '@lucide/vue';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import useAuthStore from '@/store/AuthStore';
import usePlacesStore from '@/store/PlacesStore';

/**
 * Shown only while someone is signed in. Visitors see nothing. An admin's
 * controls are here: Edit mode and the Photo queue.
 */
const auth = useAuthStore();
const placesStore = usePlacesStore();
const open = ref(false);

const editMode = computed({
  get: () => auth.editMode,
  set: (on: boolean) => auth.setEditMode(on),
});

/** Open the photo queue in the Places panel, in Edit mode, or close it. */
function togglePhotoQueue() {
  const on = !placesStore.photoQueueOpen;
  if (on) auth.setEditMode(true);
  placesStore.photoQueueOpen = on;
  open.value = false;
}
</script>

<template>
  <Popover v-if="auth.signedIn" v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="account-trigger"
        title="Account"
        aria-label="Account"
      >
        <UserRound :size="16" aria-hidden="true" />
      </button>
    </PopoverTrigger>
    <PopoverContent
      align="end"
      side="bottom"
      :side-offset="8"
      :collision-padding="12"
      class="account-panel map-panel nw nw:z-[1200] nw:rounded-(--map-panel-radius) nw:bg-background nw:p-(--map-panel-padding) nw:shadow-none"
      aria-label="Account"
    >
      <h2 class="panel-heading">Account</h2>
      <div class="account-section">
        <p class="map-section">Signed in as</p>
        <p class="account-email">{{ auth.email }}</p>
        <span class="account-role">
          {{ auth.isAdmin ? 'Admin' : 'No role' }}
        </span>
      </div>
      <div v-if="auth.isAdmin" class="account-section" aria-label="Admin">
        <p class="map-section">Admin</p>
        <div class="account-switch">
          <Pencil :size="16" aria-hidden="true" />
          <span aria-hidden="true">Edit mode</span>
          <Switch v-model="editMode" aria-label="Edit mode" />
        </div>
        <button
          type="button"
          class="map-control"
          :class="{ 'is-on': placesStore.photoQueueOpen }"
          :aria-pressed="placesStore.photoQueueOpen"
          @click="togglePhotoQueue"
        >
          <Images :size="16" aria-hidden="true" />
          Photo queue
        </button>
      </div>
      <button type="button" class="map-control" @click="auth.signOut()">
        <LogOut :size="16" aria-hidden="true" />
        Sign out
      </button>
    </PopoverContent>
  </Popover>
</template>

<style scoped>
/* Matches More info. */
.account-trigger {
  display: grid;
  width: 31px;
  height: 31px;
  padding: 0;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #f8f9f9;
  color: #24312c;
  cursor: pointer;
}
</style>

<style>
/* The panel renders in a portal, so these are not scoped. Radius, padding, and surface are utilities on the panel, so they replace the popover's own. */
.nw.account-panel.map-panel {
  display: flex;
  width: min(280px, calc(100vw - 24px));
  flex-direction: column;
  align-items: flex-start;
  gap: 18px;
}

.account-panel .account-section {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
}

.account-panel .map-section,
.account-panel .account-email {
  margin: 0;
}

.account-panel .account-email {
  font-size: 14px;
  overflow-wrap: anywhere;
}

.account-panel .account-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  font-size: 14px;
}

.account-panel .account-switch [data-slot='switch'] {
  margin-left: auto;
}

.account-panel .account-role {
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--on);
  color: var(--on-foreground);
  font-size: 12px;
  line-height: 1.2;
}
</style>
