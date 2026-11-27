<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from 'vue';
import PlaceBoundaryReview from '@/components/PlaceBoundaryReview.vue';
import PlaceSuggestInput from '@/components/PlaceSuggestInput.vue';
import { Button } from '@/components/ui/button';
import {
  ATTENTION_PRESETS,
  STATUS_NOTE_MAX,
  STATUS_REASON_MAX,
  WITHDRAWAL_PRESETS,
  loadPlaceStatus,
  loadStatusReasons,
  setPlaceAttention,
  setPlaceWithdrawn,
  type PlaceStatus,
} from '@/places/status';
import usePlacesStore from '@/store/PlacesStore';

/**
 * The Status tab, in Edit mode: review the current boundary for Stats,
 * withdraw a place from the map or restore it, and flag it as needing
 * attention or clear the flag. Each takes a reason and an optional note.
 */
const props = defineProps<{
  placeId: string;
  /** The place's status, as the profile read it. */
  placeStatus: PlaceStatus;
}>();

const emit = defineEmits<{
  /** The place was withdrawn, restored, flagged, or cleared. */
  changed: [placeStatus: PlaceStatus];
}>();

const placesStore = usePlacesStore();
/** Ties each label to its control. */
const uid = useId();

const withdrawalReason = ref('');
const withdrawalNote = ref('');
const attentionReason = ref('');
const attentionNote = ref('');
const busy = ref<'withdrawal' | 'attention' | null>(null);
const error = ref<{ form: 'withdrawal' | 'attention'; text: string } | null>(
  null
);

/** Reasons to suggest: those in use, most used first, then the presets. */
const withdrawalReasons = ref<string[]>([...WITHDRAWAL_PRESETS]);
const attentionReasons = ref<string[]>([...ATTENTION_PRESETS]);

/** Read the reasons in use, for both fields. */
async function loadReasons() {
  const [withdrawal, attention] = await Promise.all([
    loadStatusReasons('withdrawal'),
    loadStatusReasons('attention'),
  ]);
  withdrawalReasons.value = withdrawal;
  attentionReasons.value = attention;
}

onMounted(loadReasons);

watch(
  () => props.placeStatus,
  current => {
    withdrawalReason.value = current.withdrawalReason ?? '';
    withdrawalNote.value = current.withdrawalNote ?? '';
    attentionReason.value = current.attentionReason ?? '';
    attentionNote.value = current.attentionNote ?? '';
  },
  { immediate: true }
);

/** Whether the withdrawal form differs from what is stored. */
const withdrawalEdited = computed(
  () =>
    withdrawalReason.value.trim() !==
      (props.placeStatus.withdrawalReason ?? '') ||
    withdrawalNote.value.trim() !== (props.placeStatus.withdrawalNote ?? '')
);
/** Whether the attention form differs from what is stored. */
const attentionEdited = computed(
  () =>
    attentionReason.value.trim() !==
      (props.placeStatus.attentionReason ?? '') ||
    attentionNote.value.trim() !== (props.placeStatus.attentionNote ?? '')
);

/**
 * Run one change, then read the place's status again.
 * @param form - Which form made the change.
 * @param save - The change. Resolves to an error message, or null.
 */
async function run(
  form: 'withdrawal' | 'attention',
  save: () => Promise<string | null>
) {
  busy.value = form;
  error.value = null;
  const id = props.placeId;
  const message = await save();
  if (message) {
    busy.value = null;
    error.value = { form, text: message };
    return;
  }
  const read = await loadPlaceStatus(id);
  busy.value = null;
  if (form === 'withdrawal') void placesStore.loadWithdrawn();
  placesStore.adminListVersion += 1;
  void loadReasons();
  if (id !== props.placeId) return;
  if (read.status !== 'ok') {
    error.value = {
      form,
      text: 'Saved, but the status could not be read again.',
    };
    return;
  }
  emit('changed', read.placeStatus);
}

/** Withdraw the place, or save a new reason or note while it is withdrawn. */
function withdraw() {
  const reason = withdrawalReason.value.trim();
  if (!reason) return;
  void run('withdrawal', () =>
    setPlaceWithdrawn(
      props.placeId,
      reason,
      withdrawalNote.value.trim() || null
    )
  );
}

/** Put the place back on the map and in the lists. */
function restore() {
  void run('withdrawal', () => setPlaceWithdrawn(props.placeId, null));
}

/** Flag the place, or save a new reason or note while it is flagged. */
function flag() {
  const reason = attentionReason.value.trim();
  if (!reason) return;
  void run('attention', () =>
    setPlaceAttention(props.placeId, reason, attentionNote.value.trim() || null)
  );
}

/** Clear the flag. */
function clearFlag() {
  void run('attention', () => setPlaceAttention(props.placeId, null));
}
</script>

<template>
  <div class="status">
    <PlaceBoundaryReview :place-id="placeId" />

    <section class="status-form" aria-labelledby="status-withdrawal">
      <p id="status-withdrawal" class="map-section status-heading">
        Withdraw from the map
      </p>
      <p class="status-help">
        {{
          placeStatus.withdrawn
            ? 'Withdrawn. Visitors do not see this place, and it gets no new facts.'
            : 'A withdrawn place leaves the map, the list, and search, and gets no new facts.'
        }}
      </p>
      <label class="status-field" :for="`${uid}-withdrawal-reason`">
        <span class="status-label">Reason</span>
        <PlaceSuggestInput
          :id="`${uid}-withdrawal-reason`"
          v-model="withdrawalReason"
          name="withdrawal-reason"
          placeholder="Choose or type a reason"
          show-all
          :options="withdrawalReasons"
          :maxlength="STATUS_REASON_MAX"
        />
      </label>
      <label class="status-field" :for="`${uid}-withdrawal-note`">
        <span class="status-label">Note (optional)</span>
        <textarea
          :id="`${uid}-withdrawal-note`"
          v-model="withdrawalNote"
          class="status-input status-note"
          name="withdrawal-note"
          rows="2"
          :maxlength="STATUS_NOTE_MAX"
        />
      </label>
      <p v-if="error?.form === 'withdrawal'" class="status-error" role="alert">
        {{ error.text }}
      </p>
      <div class="status-actions">
        <Button
          v-if="!placeStatus.withdrawn"
          type="button"
          size="sm"
          :disabled="!withdrawalReason.trim() || busy !== null"
          @click="withdraw"
        >
          Withdraw
        </Button>
        <template v-else>
          <Button
            type="button"
            size="sm"
            variant="outline"
            :disabled="
              !withdrawalReason.trim() || !withdrawalEdited || busy !== null
            "
            @click="withdraw"
          >
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            :disabled="busy !== null"
            @click="restore"
          >
            Restore
          </Button>
        </template>
      </div>
    </section>

    <section class="status-form" aria-labelledby="status-attention">
      <p id="status-attention" class="map-section status-heading">
        Needs attention
      </p>
      <p class="status-help">
        {{
          placeStatus.attentionReason
            ? 'Flagged. It is on the Needs attention list.'
            : 'A flagged place is listed under Needs attention. Visitors do not see the flag.'
        }}
      </p>
      <label class="status-field" :for="`${uid}-attention-reason`">
        <span class="status-label">Reason</span>
        <PlaceSuggestInput
          :id="`${uid}-attention-reason`"
          v-model="attentionReason"
          name="attention-reason"
          placeholder="Choose or type a reason"
          show-all
          :options="attentionReasons"
          :maxlength="STATUS_REASON_MAX"
        />
      </label>
      <label class="status-field" :for="`${uid}-attention-note`">
        <span class="status-label">Note (optional)</span>
        <textarea
          :id="`${uid}-attention-note`"
          v-model="attentionNote"
          class="status-input status-note"
          name="attention-note"
          rows="2"
          :maxlength="STATUS_NOTE_MAX"
        />
      </label>
      <p v-if="error?.form === 'attention'" class="status-error" role="alert">
        {{ error.text }}
      </p>
      <div class="status-actions">
        <Button
          v-if="!placeStatus.attentionReason"
          type="button"
          size="sm"
          :disabled="!attentionReason.trim() || busy !== null"
          @click="flag"
        >
          Flag
        </Button>
        <template v-else>
          <Button
            type="button"
            size="sm"
            variant="outline"
            :disabled="
              !attentionReason.trim() || !attentionEdited || busy !== null
            "
            @click="flag"
          >
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            :disabled="busy !== null"
            @click="clearFlag"
          >
            Clear
          </Button>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.status {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.status-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-heading,
.status-help {
  margin: 0;
}

.status-help,
.status-label {
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted-foreground);
}

.status-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-input {
  width: 100%;
  min-height: 36px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
  color: var(--foreground);
  font: inherit;
  font-size: 14px;
}

.status-note {
  padding: 8px 10px;
  resize: vertical;
}

.status-input:focus-visible {
  outline: 2px solid var(--foreground, #24312c);
  outline-offset: 2px;
}

.status-error {
  margin: 0;
  font-size: 12px;
  color: var(--destructive, #b42318);
}

.status-actions {
  display: flex;
  gap: 8px;
}
</style>
