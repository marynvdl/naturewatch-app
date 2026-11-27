<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { Button } from '@/components/ui/button';
import {
  ELIGIBILITY_REASON_MAX,
  acceptBoundaryQc,
  findingText,
  loadBoundaryReview,
  setStatsEligibility,
  type BoundaryReview,
  type StatsEligibility,
} from '@/places/boundaryReview';
import useAuthStore from '@/store/AuthStore';
import usePlacesStore from '@/store/PlacesStore';

/**
 * The Boundary section of the Status tab, in Edit mode: the current
 * boundary's QC findings and its Stats eligibility. An admin accepts the
 * warnings of a flagged boundary, and sets it eligible, excluded, or back to
 * pending, with a reason.
 */
const props = defineProps<{ placeId: string }>();

const auth = useAuthStore();
const placesStore = usePlacesStore();
const uid = useId();

const state = ref<'loading' | 'ok' | 'error'>('loading');
const review = ref<BoundaryReview | null>(null);
const reason = ref('');
const busy = ref(false);
const error = ref('');
let request = 0;

const QC_TEXT: Record<string, string> = {
  unchecked: 'Not checked yet.',
  passed: 'Passed QC.',
  flagged: 'Flagged by QC. Accept the warnings before making it eligible.',
  accepted: 'Warnings accepted by an admin.',
};
const ELIGIBILITY_TEXT: Record<StatsEligibility, string> = {
  pending: 'Pending for Stats',
  eligible: 'Eligible for Stats',
  excluded: 'Excluded from Stats',
};

/** When and by whom the eligibility was set, such as "27 Nov 2026, by you". */
const setText = computed(() => {
  const current = review.value;
  if (!current?.setAt) return '';
  const day = new Date(current.setAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  if (!current.setBy) return day;
  return current.setBy === auth.session?.user.id
    ? `${day}, by you`
    : `${day}, by another admin`;
});

/** Whether a choice needs a reason, as `set_stats_eligibility` asks. */
function needsReason(next: StatsEligibility): boolean {
  if (next === 'excluded') return true;
  return next === 'eligible' && review.value?.qcStatus !== 'passed';
}

/** The eligibilities the boundary can move to now. */
const choices = computed(() => {
  const current = review.value;
  if (!current) return [];
  const list: { id: StatsEligibility; label: string }[] = [];
  if (
    current.eligibility !== 'eligible' &&
    (current.qcStatus === 'passed' || current.qcStatus === 'accepted')
  )
    list.push({ id: 'eligible', label: 'Eligible' });
  if (current.eligibility !== 'excluded')
    list.push({ id: 'excluded', label: 'Excluded' });
  if (current.eligibility !== 'pending')
    list.push({ id: 'pending', label: 'Back to pending' });
  return list;
});

/** Read the boundary for the open place. */
async function load() {
  const current = ++request;
  const result = await loadBoundaryReview(props.placeId);
  if (current !== request) return;
  if (result.status !== 'ok') {
    state.value = 'error';
    return;
  }
  review.value = result.review;
  state.value = 'ok';
}

watch(
  () => props.placeId,
  () => {
    state.value = 'loading';
    review.value = null;
    reason.value = '';
    error.value = '';
    void load();
  },
  { immediate: true }
);

/**
 * Run one change, then read the boundary again and refresh the lists.
 * @param save - The change. Resolves to an error message, or null.
 */
async function run(save: () => Promise<string | null>) {
  busy.value = true;
  error.value = '';
  const message = await save();
  if (message) {
    busy.value = false;
    error.value = message;
    return;
  }
  await load();
  busy.value = false;
  placesStore.adminListVersion += 1;
}

/** Accept the warnings of a flagged boundary. */
function accept() {
  const id = review.value?.boundaryId;
  if (!id) return;
  void run(() => acceptBoundaryQc(id));
}

/**
 * Set the eligibility, with the reason typed.
 * @param next - The new eligibility.
 */
function choose(next: StatsEligibility) {
  const id = review.value?.boundaryId;
  if (!id) return;
  const text = reason.value.trim();
  if (needsReason(next) && !text) return;
  void run(async () => {
    const message = await setStatsEligibility(id, next, text || null);
    if (!message) reason.value = '';
    return message;
  });
}
</script>

<template>
  <section
    v-if="state !== 'ok' || review"
    class="boundary-review"
    aria-labelledby="status-boundary"
  >
    <p id="status-boundary" class="map-section status-heading">Boundary</p>
    <p v-if="state === 'loading'" class="status-help">Loading the boundary.</p>
    <p v-else-if="state === 'error'" class="status-error" role="alert">
      The boundary could not be read.
    </p>
    <template v-else-if="review">
      <p class="status-help">{{ QC_TEXT[review.qcStatus] }}</p>
      <ul v-if="review.findings.length" class="boundary-findings">
        <li
          v-for="finding in review.findings"
          :key="finding.checkId"
          :class="{ 'is-warn': finding.outcome !== 'pass' }"
        >
          {{ findingText(finding) }}
        </li>
      </ul>
      <p class="boundary-eligibility">
        <strong>{{ ELIGIBILITY_TEXT[review.eligibility] }}</strong>
        <span v-if="setText" class="status-help boundary-set">
          · {{ setText }}
        </span>
      </p>
      <p v-if="review.reason" class="status-help">{{ review.reason }}</p>
      <div v-if="review.qcStatus === 'flagged'" class="status-actions">
        <Button
          type="button"
          size="sm"
          variant="outline"
          :disabled="busy"
          @click="accept"
        >
          Accept warnings
        </Button>
      </div>
      <label class="status-field" :for="`${uid}-eligibility-reason`">
        <span class="status-label">Reason</span>
        <textarea
          :id="`${uid}-eligibility-reason`"
          v-model="reason"
          class="status-input status-note"
          name="eligibility-reason"
          rows="2"
          :maxlength="ELIGIBILITY_REASON_MAX"
        />
      </label>
      <p v-if="error" class="status-error" role="alert">{{ error }}</p>
      <div class="status-actions">
        <Button
          v-for="choice in choices"
          :key="choice.id"
          type="button"
          size="sm"
          :variant="choice.id === 'eligible' ? 'default' : 'outline'"
          :disabled="busy || (needsReason(choice.id) && !reason.trim())"
          @click="choose(choice.id)"
        >
          {{ choice.label }}
        </Button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.boundary-review {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-heading,
.status-help,
.boundary-eligibility {
  margin: 0;
}

.status-help,
.status-label {
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted-foreground);
}

.boundary-eligibility {
  font-size: 13px;
}

.boundary-set {
  margin-left: 4px;
}

.boundary-findings {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted-foreground);
}

.boundary-findings .is-warn {
  color: var(--foreground);
  font-weight: 600;
}

.status-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-input {
  width: 100%;
  min-height: 36px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
  color: var(--foreground);
  font: inherit;
  font-size: 14px;
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
  flex-wrap: wrap;
  gap: 8px;
}
</style>
