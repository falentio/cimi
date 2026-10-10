<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { Alert02Icon, GlobalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { isStringValue } from '../../../utils/type-guards'
import BreakdownGrid from './BreakdownGrid.vue'
import MetricGrid from './MetricGrid.vue'
import OverviewChart from './OverviewChart.vue'
import OverviewFilterBar from './OverviewFilterBar.vue'
import OverviewToolbar from './OverviewToolbar.vue'
import { overviewBreakdownSections } from './site-overview-breakdowns'
import {
  hasOverviewFilterValue,
  normalizeOverviewFilters,
  removeOverviewFilterValue,
  replaceOverviewFilterValue,
  toggleOverviewFilterValue,
} from './site-overview-filters'
import { overviewRangeOptions } from './site-overview.range'
import type { BreakdownId, OverviewFilter, OverviewRange } from './site-overview.types'
import { useSiteTraffic } from './useSiteTraffic'

const route = useRoute()

const siteId = computed(() => {
  const value = route.params.siteId

  return isStringValue(value) ? value : undefined
})

const selectedRange = shallowRef<OverviewRange>('30d')

const comparison = shallowRef(false)

const activeFilters = shallowRef<readonly OverviewFilter[]>([])

const statusText = shallowRef('')

const traffic = useSiteTraffic({ siteId, range: selectedRange, filters: activeFilters, comparison })

const view = computed(() => traffic.view.value)

const load = computed(() => traffic.load.value)

const metrics = computed(() => view.value?.metrics ?? [])

const hasTraffic = computed(() => view.value?.hasTraffic ?? false)

const trend = computed(() => view.value?.trend)

const breakdowns = computed(() => view.value?.breakdowns ?? [])

const freshnessLine = computed(() => {
  const freshness = view.value?.freshness

  if (freshness === undefined) return ''

  return freshness.status === 'stale' ? 'Recent data is still catching up.' : 'Data is current.'
})

function filterCountLabel(filters: readonly OverviewFilter[]): string {
  const count = filters.reduce((total, filter) => total + filter.values.length, 0)

  return count === 1 ? '1 active filter.' : count + ' active filters.'
}

function commitFilters(next: readonly OverviewFilter[], message: string): void {
  activeFilters.value = next
  statusText.value = next.length === 0 ? message : message + ' ' + filterCountLabel(next)
}

function handleRangeChange(range: OverviewRange): void {
  selectedRange.value = range
}

function handleComparisonChange(value: boolean): void {
  comparison.value = value
}

async function handleRefresh(): Promise<void> {
  statusText.value = 'Refreshing\u2026'
  await traffic.refresh()
  statusText.value = 'Updated just now'
}

function handleBreakdownTabChange(payload: { sectionId: string; tabId: string }): void {
  const section = overviewBreakdownSections.find((item) => item.id === payload.sectionId)

  if (section === undefined || !section.tabs.some((tab) => tab.id === payload.tabId)) return

  traffic.selectTab(payload.sectionId, payload.tabId)
}

function handleRowSelect(filter: OverviewFilter): void {
  const wasSelected = hasOverviewFilterValue(activeFilters.value, filter)
  commitFilters(
    toggleOverviewFilterValue(activeFilters.value, filter),
    wasSelected ? 'Filter removed.' : 'Filter added.',
  )
}

function handleFilterAdd(filter: OverviewFilter): void {
  commitFilters(normalizeOverviewFilters([...activeFilters.value, filter]), 'Filter added.')
}

function handleFilterReplace(payload: {
  current: OverviewFilter
  replacement: OverviewFilter
}): void {
  commitFilters(
    replaceOverviewFilterValue(activeFilters.value, payload.current, payload.replacement),
    'Filter updated.',
  )
}

function handleFilterRemove(filter: OverviewFilter): void {
  commitFilters(removeOverviewFilterValue(activeFilters.value, filter), 'Filter removed.')
}

function handleFilterClear(): void {
  commitFilters([], 'All filters cleared.')
}
</script>

<template>
  <section class="flex min-w-0 flex-col gap-6">
    <div class="sticky top-0 z-20 bg-background ring-background ring-2">
      <OverviewToolbar
        :ranges="overviewRangeOptions"
        :selected-range="selectedRange"
        :status-text="statusText"
        :freshness-text="freshnessLine"
        :comparison="comparison"
        @range-change="handleRangeChange"
        @comparison-change="handleComparisonChange"
        @refresh="handleRefresh"
      >
        <template #filters>
          <OverviewFilterBar
            :filters="activeFilters"
            @add-filter="handleFilterAdd"
            @replace-filter="handleFilterReplace"
            @remove-filter="handleFilterRemove"
            @clear-filters="handleFilterClear"
          />
        </template>
      </OverviewToolbar>
    </div>

    <div
      v-if="load.status === 'loading'"
      class="text-muted-foreground flex min-h-56 items-center justify-center gap-2 rounded-xl border border-dashed text-sm"
      role="status"
      aria-live="polite"
    >
      <Spinner class="motion-reduce:animate-none" />
      Loading site analytics…
    </div>

    <Empty v-else-if="load.status === 'error'" class="min-h-56 border-destructive/40">
      <EmptyHeader>
        <EmptyMedia variant="icon" class="bg-destructive/10 text-destructive">
          <HugeiconsIcon :icon="Alert02Icon" aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>Analytics unavailable</EmptyTitle>
        <EmptyDescription>
          {{ load.status === 'error' ? load.error.message : '' }}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>

    <Empty v-else-if="load.status === 'ready' && !hasTraffic" class="min-h-56">
      <EmptyHeader>
        <EmptyMedia variant="icon" class="bg-muted text-muted-foreground">
          <HugeiconsIcon :icon="GlobalIcon" aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No analytics yet</EmptyTitle>
        <EmptyDescription>
          Traffic data will appear here once this site receives visitors.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>

    <template v-else-if="load.status === 'ready'">
      <MetricGrid :metrics="metrics" />
      <OverviewChart v-if="trend" title="Visitors" :trend="trend" />
      <BreakdownGrid
        :sections="breakdowns"
        :selected-filters="activeFilters"
        @tab-change="handleBreakdownTabChange"
        @row-select="handleRowSelect"
        @load-more="traffic.loadMore"
      />
    </template>
  </section>
</template>
