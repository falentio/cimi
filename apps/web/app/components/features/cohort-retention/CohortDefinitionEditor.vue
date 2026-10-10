<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import CohortActionEditor from './CohortActionEditor.vue'
import { COHORT_DRAFT_PROBLEM_LABELS, emptyCohortDraft, validateCohortDraft } from './cohort-draft'
import type { CohortActionDraft, CohortDraft, SCohort } from './cohort-retention.types'

const props = defineProps<{
  readonly mode: 'create' | 'update'
  readonly draft: CohortDraft
  readonly definitions: readonly SCohort[]
  readonly editingId: string | undefined
  readonly submitting: boolean
}>()

const emit = defineEmits<{
  (event: 'submit', draft: CohortDraft): void
  (event: 'cancel'): void
}>()

const draft = ref<CohortDraft>(props.draft)

const entryAction = computed<CohortActionDraft>({
  get: () => draft.value.entryAction,
  set: (value) => {
    draft.value = { ...draft.value, entryAction: value }
  },
})

const retentionAction = computed<CohortActionDraft>({
  get: () => draft.value.retentionAction,
  set: (value) => {
    draft.value = { ...draft.value, retentionAction: value }
  },
})

const problems = computed(() =>
  validateCohortDraft({
    draft: draft.value,
    definitions: props.definitions,
    editingId: props.editingId,
  }),
)

const canSubmit = computed(() => problems.value.form === null && problems.value.fields.size === 0)

function submit(): void {
  if (!canSubmit.value) return

  emit('submit', draft.value)
}
</script>

<template>
  <section class="flex w-full min-w-0 flex-col gap-4 rounded-md border p-4">
    <h3 class="text-sm font-medium">
      {{ mode === 'create' ? 'New cohort' : 'Edit cohort' }}
    </h3>

    <div class="flex flex-col gap-2">
      <Label for="cohort-name">Name</Label>
      <Input id="cohort-name" v-model="draft.name" placeholder="Trial to paid" />
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <div class="flex flex-col gap-2">
        <Label for="cohort-identity">Identity population</Label>
        <NativeSelect id="cohort-identity" v-model="draft.identityKind">
          <option value="visitor">Visitors</option>
          <option value="identified_user">Identified users</option>
        </NativeSelect>
        <p class="text-muted-foreground text-xs">
          One population per cohort. Visitor and Identified User results never combine.
        </p>
      </div>

      <div class="flex flex-col gap-2">
        <Label for="cohort-period">Retention period</Label>
        <NativeSelect id="cohort-period" v-model="draft.period">
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </NativeSelect>
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <CohortActionEditor v-model="entryAction" slot="entry" />
      <CohortActionEditor v-model="retentionAction" slot="retention" />
    </div>

    <ul
      v-if="problems.fields.size > 0 || problems.form !== null"
      class="text-destructive flex flex-col gap-1 text-xs"
      role="alert"
    >
      <li v-for="problem in problems.fields" :key="problem">
        {{ COHORT_DRAFT_PROBLEM_LABELS[problem] }}
      </li>
      <li v-if="problems.form !== null">
        {{ COHORT_DRAFT_PROBLEM_LABELS[problems.form] }}
      </li>
    </ul>

    <p class="text-muted-foreground text-xs">
      A report covers at most twelve periods. An over-long range is rejected rather than shortened.
    </p>

    <div class="flex justify-end gap-2">
      <Button variant="ghost" :disabled="submitting" @click="emit('cancel')">Cancel</Button>
      <Button :disabled="!canSubmit || submitting" @click="submit">
        {{ submitting ? 'Saving…' : mode === 'create' ? 'Create cohort' : 'Save changes' }}
      </Button>
    </div>
  </section>
</template>
