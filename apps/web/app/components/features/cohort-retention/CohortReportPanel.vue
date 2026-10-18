<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cohortDeficiencyHint } from './cohort-report-view'
import { countCohortPeriods } from './cohort-report-query'
import { toCohortReportViewModel } from './cohort-report-view'
import CohortFilterBar from './CohortFilterBar.vue'
import CohortPeriodTable from './CohortPeriodTable.vue'
import CohortReportControls from './CohortReportControls.vue'
import type { AcceptableValue } from 'reka-ui'
import type {
  CohortDateRange,
  CohortDefinitionsLoadState,
  CohortOption,
  CohortReportBlockedReason,
  CohortReportFilter,
  CohortReportOutcome,
  CohortReportViewModel,
  SCohort,
} from './cohort-retention.types'

const props = defineProps<{
  readonly outcome: CohortReportOutcome
  readonly options: readonly CohortOption[]
  readonly blockedHint: string | null
  readonly range: CohortDateRange
  readonly selected: SCohort | undefined
  readonly definitions: CohortDefinitionsLoadState
}>()

const emit = defineEmits<{
  (event: 'select', cohortId: string): void
  (event: 'range', range: CohortDateRange): void
  (event: 'comparison', enabled: boolean): void
  (event: 'filters', filters: readonly CohortReportFilter[]): void
  (event: 'clear-filters'): void
  (event: 'retry'): void
}>()

const filters = ref<readonly CohortReportFilter[]>([])

const comparison = ref(false)

watch(
  () => props.selected?.id,
  () => {
    filters.value = []
  },
)

const periodCount = computed(() =>
  props.selected === undefined ? 0 : countCohortPeriods(props.selected.period, props.range),
)

const view = computed<CohortReportViewModel | null>(() => {
  const cohort = props.selected

  if (props.outcome.kind !== 'ready' || cohort === undefined) return null

  return toCohortReportViewModel({
    report: props.outcome.report,
    cohort,
    locale: 'en',
  })
})

const identityLabel = computed(() => {
  const cohort = props.selected

  if (cohort === undefined) return 'No cohort selected'

  return cohort.identityKind === 'visitor' ? 'Visitors (anonymous)' : 'Identified users'
})

const selectedId = computed<string>({
  get: () => props.selected?.id ?? '',
  set: (value) => emit('select', value),
})

function onRange(range: CohortDateRange): void {
  emit('range', range)
}

function onComparison(enabled: boolean): void {
  comparison.value = enabled
  emit('comparison', enabled)
}

function onFilters(next: readonly CohortReportFilter[]): void {
  emit('filters', next)
}
</script>

<template>
  <section class="flex w-full min-w-0 flex-col gap-4">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <h3 class="text-sm font-medium">Retention report</h3>
      <div class="flex items-center gap-2">
        <Badge variant="outline">{{ identityLabel }}</Badge>
        <Badge
          v-if="view !== null"
          :variant="view.statusTone === 'stale' ? 'destructive' : 'secondary'"
        >
          {{ view.statusLabel }}
        </Badge>
      </div>
    </header>

    <div v-if="options.length > 0" class="flex flex-col gap-1">
      <Label for="cohort-select">Cohort</Label>
      <NativeSelect id="cohort-select" v-model="selectedId">
        <option value="" disabled>Choose a cohort</option>
        <option v-for="option in options" :key="option.cohortId" :value="option.cohortId">
          {{ option.name }} ({{ option.status }})
        </option>
      </NativeSelect>
    </div>

    <Skeleton v-if="outcome.kind === 'loading'" class="h-40 w-full" />

    <template v-else-if="view !== null">
      <CohortReportControls
        :range="range"
        :comparison="comparison"
        :max-periods="12"
        :period-count="periodCount"
        @range="onRange"
        @comparison="onComparison"
      />

      <CohortFilterBar v-model="filters" @update:model-value="onFilters" />

      <p class="text-muted-foreground text-xs">
        {{ view.comparisonLabel ?? 'No comparison window.' }}
      </p>

      <CohortPeriodTable :rows="view.rows" />
    </template>

    <div v-else-if="outcome.kind === 'blocked'" class="flex flex-col gap-2">
      <p class="text-sm" role="status">
        {{ blockedHint ?? cohortDeficiencyHint(outcome.reason) }}
      </p>
      <p v-if="outcome.reason.kind === 'range-over-periods'" class="text-muted-foreground text-xs">
        A report covers at most {{ outcome.reason.maxPeriods }} periods.
      </p>
    </div>

    <div v-else-if="outcome.kind === 'error'" class="flex flex-col gap-2">
      <p class="text-destructive text-sm" role="alert">{{ outcome.failure.message }}</p>
      <div>
        <UIButton variant="outline" size="sm" @click="emit('retry')">Try again</UIButton>
      </div>
    </div>

    <p v-else-if="outcome.kind === 'empty'" class="text-muted-foreground text-sm">
      Choose a cohort to read its retention report.
    </p>
  </section>
</template>
