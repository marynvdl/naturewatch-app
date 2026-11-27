<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { Button } from '@/components/ui/button';
import {
  REVIEW_NOTE_MAX,
  findingText,
  loadBoundaryReview,
  reviewBoundary,
  statsLine,
  verdictState,
  warnsOnShape,
  type BoundaryReview,
  type BoundaryVerdict,
} from '@/places/boundaryReview';
import useAuthStore from '@/store/AuthStore';
import usePlacesStore from '@/store/PlacesStore';

/**
 * The top of the Status tab, in Edit mode: one line on whether the place is
 * counted in Stats, then the Boundary section. It lists the shape check, and
 * takes one verdict on the current boundary: Shape is right, count it; Needs
 * fixing; or Leave out of Stats. Back to review undoes a verdict.
 */
const props = defineProps<{
  placeId: string;
  /** Whether the place is hidden from the map. */
  hidden: boolean;
}>();

const auth = useAuthStore();
const placesStore = usePlacesStore();
const uid = useId();

const state = ref<'loading' | 'ok' | 'error'>('loading');
const review = ref<BoundaryReview | null>(null);
const note = ref('');
const busy = ref(false);
const error = ref('');
let request = 0;

/** What each verdict is called, where the Stats line does not say it. */
const VERDICT_LABEL = {
  counted: 'Shape is right',
  fix: 'Needs fixing',
  left_out: 'Left out of Stats',
} as const;

const verdict = computed(() =>
  review.value
    ? verdictState(review.value.qcStatus, review.value.eligibility)
    : null
);
const stats = computed(() => statsLine(props.hidden, review.value));
/** Whether a check warns on the shape. */
const shapeWarns = computed(
  () => review.value?.findings.some(warnsOnShape) ?? false
);

/** When and by whom the verdict was given, such as "Reviewed 27 Nov 2026, by you." */
const reviewedText = computed(() => {
  const current = review.value;
  if (!current?.setAt || !verdict.value || verdict.value === 'not_reviewed')
    return '';
  const day = new Date(current.setAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const who = !current.setBy
    ? ''
    : current.setBy === auth.session?.user.id
      ? ', by you'
      : ', by another admin';
  // A hidden place's Stats line does not name the verdict, so it is named here.
  const label = props.hidden ? `${VERDICT_LABEL[verdict.value]}. ` : '';
  return `${label}Reviewed ${day}${who}.`;
});

/** The note, unless the Stats line already shows it. */
const shownNote = computed(() => {
  const current = review.value;
  if (!current?.note || verdict.value === 'not_reviewed') return null;
  if (verdict.value === 'left_out' && !props.hidden) return null;
  return current.note;
});

/** Whether "Shape is right, count it" is offered: the shape was checked and is not marked for fixing. */
const canCount = computed(
  () =>
    verdict.value === 'not_reviewed' &&
    review.value?.qcStatus !== 'unchecked' &&
    review.value?.qcStatus !== 'rejected'
);

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
    note.value = '';
    error.value = '';
    void load();
  },
  { immediate: true }
);

/**
 * Give the boundary a verdict, then read it again and refresh the lists.
 * @param next - The verdict.
 */
async function give(next: BoundaryVerdict) {
  const id = review.value?.boundaryId;
  if (!id) return;
  busy.value = true;
  error.value = '';
  const message = await reviewBoundary(id, next, note.value.trim() || null);
  if (message) {
    busy.value = false;
    error.value = message;
    return;
  }
  note.value = '';
  await load();
  busy.value = false;
  placesStore.adminListVersion += 1;
}
</script>

<template>
  <p v-if="state === 'ok'" class="status-stats">{{ stats }}</p>
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
      <ul v-if="review.findings.length" class="boundary-findings">
        <li
          v-for="finding in review.findings"
          :key="finding.checkId"
          :class="{ 'is-warn': warnsOnShape(finding) }"
        >
          <span aria-hidden="true">
            {{ warnsOnShape(finding) ? '⚠' : '✓' }}
          </span>
          {{ findingText(finding) }}
        </li>
      </ul>
      <p v-else class="status-help">The shape has not been checked yet.</p>
      <p v-if="reviewedText" class="status-help">{{ reviewedText }}</p>
      <p v-if="shownNote" class="status-help">{{ shownNote }}</p>

      <template v-if="verdict === 'not_reviewed'">
        <label class="status-field" :for="`${uid}-review-note`">
          <span class="status-label">Note</span>
          <textarea
            :id="`${uid}-review-note`"
            v-model="note"
            class="status-input"
            name="review-note"
            rows="2"
            :maxlength="REVIEW_NOTE_MAX"
          />
          <span class="status-label">
            {{
              shapeWarns
                ? 'Needed to leave it out, or to count a shape the check warned about.'
                : 'Needed to leave it out.'
            }}
          </span>
        </label>
        <p v-if="error" class="status-error" role="alert">{{ error }}</p>
        <div class="status-actions">
          <Button
            v-if="canCount"
            type="button"
            size="sm"
            :disabled="busy || (shapeWarns && !note.trim())"
            @click="give('count')"
          >
            Shape is right, count it
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            :disabled="busy"
            @click="give('fix')"
          >
            Needs fixing
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            :disabled="busy || !note.trim()"
            @click="give('leave_out')"
          >
            Leave out of Stats
          </Button>
        </div>
      </template>
      <template v-else>
        <p v-if="error" class="status-error" role="alert">{{ error }}</p>
        <div class="status-actions">
          <Button
            type="button"
            size="sm"
            variant="outline"
            :disabled="busy"
            @click="give('undo')"
          >
            Back to review
          </Button>
        </div>
      </template>
    </template>
  </section>
</template>

<style scoped>
.boundary-review {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-stats {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--foreground);
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
