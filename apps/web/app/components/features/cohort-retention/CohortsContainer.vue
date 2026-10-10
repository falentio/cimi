<script setup lang="ts">
import CohortDefinitionEditor from './CohortDefinitionEditor.vue'
import CohortDefinitionList from './CohortDefinitionList.vue'
import CohortReportPanel from './CohortReportPanel.vue'
import CohortStatusLine from './CohortStatusLine.vue'
import { cohortDeficiencyHint } from './cohort-report-view'
import { emptyCohortDraft, cohortDraftFromDefinition } from './cohort-draft'
import { useCohorts } from './cohort-retention'
import type { CohortDraft, SCohort } from './cohort-retention.types'

const props = defineProps<{
  readonly siteId: string | undefined
}>()

const controller = useCohorts({ siteId: () => props.siteId })

const editingId = ref<string | null | undefined>()

const definitions = computed(() => controller.definitions.value)

const options = computed(() => controller.cohortOptions.value)

const selected = computed(() => controller.selectedDefinition.value)

const state = computed(() => controller.state.value)

const allDefinitions = computed<readonly SCohort[]>(() => {
  const current = definitions.value

  return current.status === 'ready' ||
    current.status === 'refreshing' ||
    current.status === 'stale-error'
    ? current.definitions
    : []
})

const editing = computed<SCohort | undefined>(() => {
  const id = editingId.value

  return id === undefined || id === null
    ? undefined
    : allDefinitions.value.find((item) => item.id === id)
})

const editorDraft = computed<CohortDraft>(() =>
  editing.value === undefined ? emptyCohortDraft() : cohortDraftFromDefinition(editing.value),
)

const blockedReason = computed(() =>
  state.value.status === 'report-blocked' ? state.value.reason : undefined,
)

const definitionsFailure = computed(() =>
  state.value.status === 'definitions-error' ? state.value.failure : undefined,
)

function create(): void {
  editingId.value = null
}

function edit(cohortId: string): void {
  editingId.value = cohortId
}

function closeEditor(): void {
  editingId.value = undefined
}

async function submit(draft: CohortDraft): Promise<void> {
  const cohortId = editing.value?.id

  if (cohortId === undefined) {
    await controller.create(draft)
  } else {
    await controller.update({ cohortId, draft })
  }

  closeEditor()
}

async function archive(cohortId: string): Promise<void> {
  await controller.archive(cohortId)
}
</script>

<template>
  <div class="flex w-full min-w-0 flex-col gap-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex min-w-0 flex-col gap-1">
        <h2 class="text-xl font-semibold tracking-tight">Cohort retention</h2>
        <p class="text-muted-foreground max-w-prose text-sm">
          A cohort names the action that enters a subject and a different action that counts as
          retention, measured by period for one identity population.
        </p>
      </div>
      <UIButton type="button" @click="create">New cohort</UIButton>
    </header>

    <CohortStatusLine :failure="definitionsFailure" />

    <CohortDefinitionList
      :state="definitions"
      :options="options"
      :empty-hint="null"
      :archive-submitting-id="controller.archiveSubmittingId.value"
      @edit="edit"
      @archive="archive"
    />

    <CohortReportPanel
      v-if="state.status !== 'idle'"
      :outcome="controller.selectedReport.value"
      :options="options"
      :blocked-hint="blockedReason === undefined ? null : cohortDeficiencyHint(blockedReason)"
      :range="controller.resolveRange()"
      :selected="selected"
      :definitions="definitions"
      @select="controller.setCohortId"
      @range="controller.setRange"
      @comparison="controller.setComparison"
      @filters="controller.setFilters"
      @clear-filters="controller.clearFilters"
      @retry="controller.retryReport"
    />

    <CohortDefinitionEditor
      v-if="state.status !== 'idle'"
      :mode="editing === undefined ? 'create' : 'update'"
      :draft="editorDraft"
      :definitions="allDefinitions"
      :editing-id="editing?.id"
      :submitting="controller.definitionSubmitting.value"
      @submit="submit"
      @cancel="closeEditor"
    />
  </div>
</template>
