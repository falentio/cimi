<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import {
  Activity01Icon,
  Alert02Icon,
  Analytics01Icon,
  Chart01Icon,
  ComputerIcon,
  File01Icon,
  GlobalIcon,
  Link01Icon,
  UserGroupIcon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import type {
  BreakdownId,
  BreakdownSection,
  BreakdownTabId,
  OverviewFixture,
  OverviewMetric,
  OverviewMetricId,
  OverviewRange,
  OverviewRangeOption,
  OverviewTrend,
  RankingRow,
  VisibleBreakdownSection,
} from './site-overview.types'
import BreakdownGrid from './BreakdownGrid.vue'
import MetricGrid from './MetricGrid.vue'
import OverviewChart from './OverviewChart.vue'
import OverviewToolbar from './OverviewToolbar.vue'

const selectedMetricIds = shallowRef<readonly OverviewMetricId[]>([])

function handleMetricToggle(id: OverviewMetricId): void {
  selectedMetricIds.value = selectedMetricIds.value.includes(id) ? [] : [id]
}

const rangeOptions: readonly OverviewRangeOption[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '12m', label: 'Last 12 months' },
]

const metrics: readonly OverviewMetric[] = [
  {
    id: 'visitors',
    label: 'Visitors',
    value: '24,860',
    change: '+18.4%',
    changeKind: 'positive',
    comparison: 'vs previous period',
    icon: UserGroupIcon,
    sparkline: [38, 44, 42, 53, 49, 62, 58, 68, 64, 78],
    unit: 'count',
    trends: {
      '7d': {
        current: [42.1, 45.9, 47.2, 53.6, 60.3, 61.6, 68],
        previous: [36.5, 38.3, 39.9, 45.2, 51.4, 53.1, 58.4],
        currentTailIndex: 5,
      },
      '30d': {
        current: [42.1, 45.2, 45.9, 51.6, 57.6, 58.3, 65.6, 68],
        previous: [36.5, 37.7, 38.8, 43.5, 49.1, 50.3, 56.3, 57],
        currentTailIndex: 6,
      },
      '90d': {
        current: [42.1, 45.2, 45.9, 51.6, 57.6, 58.3, 65.6, 68],
        previous: [36.5, 37.7, 38.8, 43.5, 49.1, 50.3, 56.3, 57],
        currentTailIndex: 6,
      },
      '12m': {
        current: [42.1, 43.8, 42.9, 47.2, 51.8, 51, 56.9, 55.8, 62.7, 61.8, 66.8, 68],
        previous: [36.5, 36.5, 36.3, 39.8, 44.2, 44, 48.8, 46.8, 53.5, 53.1, 56.4, 57.8],
        currentTailIndex: 10,
      },
    },
  },
  {
    id: 'pageviews',
    label: 'Pageviews',
    value: '62,104',
    change: '+12.7%',
    changeKind: 'positive',
    comparison: 'vs previous period',
    icon: ViewIcon,
    sparkline: [44, 42, 50, 47, 56, 53, 61, 64, 59, 73],
    unit: 'count',
    trends: {
      '7d': {
        current: [39.5, 47.5, 51.6, 56.4, 62.9, 65.7, 73],
        previous: [35.2, 42, 46.2, 50.1, 55.9, 57.9, 65.1],
        currentTailIndex: 5,
      },
      '30d': {
        current: [39.5, 46.8, 50.1, 54.2, 59.9, 62, 66, 73],
        previous: [35.2, 41.3, 44.8, 48.2, 53.2, 54.6, 58.9, 65.3],
        currentTailIndex: 6,
      },
      '90d': {
        current: [39.5, 46.8, 50.1, 54.2, 59.9, 62, 66, 73],
        previous: [35.2, 41.3, 44.8, 48.2, 53.2, 54.6, 58.9, 65.3],
        currentTailIndex: 6,
      },
      '12m': {
        current: [39.5, 45.2, 46.9, 49.3, 53.5, 53.9, 56.3, 64, 62.9, 66.9, 73, 73],
        previous: [35.2, 39.9, 42, 43.8, 47.5, 47.5, 50.2, 57.3, 54.8, 58.4, 65.1, 63.9],
        currentTailIndex: 10,
      },
    },
  },
  {
    id: 'sessions',
    label: 'Sessions',
    value: '18,942',
    change: '+9.8%',
    changeKind: 'positive',
    comparison: 'vs previous period',
    icon: Activity01Icon,
    sparkline: [31, 37, 34, 45, 42, 48, 46, 55, 52, 61],
    unit: 'count',
    trends: {
      '7d': {
        current: [32.3, 36.6, 40.8, 48.6, 48.9, 57.8, 61],
        previous: [29, 33.5, 37.6, 44.5, 44.7, 53.5, 55.9],
        currentTailIndex: 5,
      },
      '30d': {
        current: [32.3, 35.9, 39.4, 46.5, 46.1, 54.3, 54.4, 61],
        previous: [29, 32.8, 36.3, 42.5, 42.2, 50.2, 49.9, 54.6],
        currentTailIndex: 6,
      },
      '90d': {
        current: [32.3, 35.9, 39.4, 46.5, 46.1, 54.3, 54.4, 61],
        previous: [29, 32.8, 36.3, 42.5, 42.2, 50.2, 49.9, 54.6],
        currentTailIndex: 6,
      },
      '12m': {
        current: [32.3, 34.4, 36.4, 42, 40.1, 46.8, 45.3, 50.7, 51.7, 55.8, 60, 61],
        previous: [29, 31.4, 33.5, 38.4, 36.7, 43.3, 41.5, 45.4, 47, 51.4, 54.9, 56.2],
        currentTailIndex: 10,
      },
    },
  },
  {
    id: 'bounce-rate',
    label: 'Bounce rate',
    value: '32.4%',
    change: '-4.6%',
    changeKind: 'positive',
    comparison: 'vs previous period',
    icon: Analytics01Icon,
    sparkline: [62, 59, 61, 54, 56, 49, 52, 44, 46, 39],
    unit: 'percent',
    trends: {
      '7d': {
        current: [29.9, 30.3, 31, 31.3, 31.4, 31.9, 32.4],
        previous: [32, 31.7, 32.2, 32.4, 32.3, 33.5, 34.5],
        currentTailIndex: 5,
      },
      '30d': {
        current: [29.9, 30.2, 30.9, 31.1, 31.2, 31.6, 32.2, 32.4],
        previous: [32, 31.6, 32.1, 32.2, 32.1, 33.2, 34.3, 34.1],
        currentTailIndex: 6,
      },
      '90d': {
        current: [29.9, 30.2, 30.9, 31.1, 31.2, 31.6, 32.2, 32.4],
        previous: [32, 31.6, 32.1, 32.2, 32.1, 33.2, 34.3, 34.1],
        currentTailIndex: 6,
      },
      '12m': {
        current: [29.9, 30.1, 30.6, 30.7, 30.7, 31, 31.4, 31.7, 31.5, 31.8, 32.1, 32.4],
        previous: [32, 31.5, 31.7, 31.8, 31.6, 32.6, 33.5, 33.3, 32.6, 33.8, 34.1, 34.2],
        currentTailIndex: 10,
      },
    },
  },
  {
    id: 'avg-visit',
    label: 'Avg. visit',
    value: '2m 18s',
    change: '+6.2%',
    changeKind: 'positive',
    comparison: 'vs previous period',
    icon: Chart01Icon,
    sparkline: [34, 39, 36, 43, 46, 44, 52, 56, 53, 61],
    unit: 'duration',
    trends: {
      '7d': {
        current: [33.8, 40.1, 43.2, 49.5, 50.9, 55, 61],
        previous: [32.2, 38.2, 41, 45.7, 47.7, 51.3, 57.3],
        currentTailIndex: 5,
      },
      '30d': {
        current: [33.8, 39.4, 41.9, 47.5, 48.3, 51.8, 55.1, 61],
        previous: [32.2, 37.6, 39.8, 43.9, 45.3, 48.3, 51.8, 58.3],
        currentTailIndex: 6,
      },
      '90d': {
        current: [33.8, 39.4, 41.9, 47.5, 48.3, 51.8, 55.1, 61],
        previous: [32.2, 37.6, 39.8, 43.9, 45.3, 48.3, 51.8, 58.3],
        currentTailIndex: 6,
      },
      '12m': {
        current: [33.8, 38, 39.1, 43.3, 42.7, 44.8, 46.7, 50.6, 51.5, 56.5, 57.4, 61],
        previous: [32.2, 36.2, 37.1, 40, 40, 41.8, 43.9, 48.3, 47.9, 54.1, 53.5, 58],
        currentTailIndex: 10,
      },
    },
  },
  {
    id: 'exit-rate',
    label: 'Exit rate',
    value: '18.7%',
    change: '+2.1%',
    changeKind: 'negative',
    comparison: 'vs previous period',
    icon: Link01Icon,
    sparkline: [29, 32, 31, 35, 33, 39, 38, 42, 44, 47],
    unit: 'percent',
    trends: {
      '7d': {
        current: [27.8, 26, 24.8, 23, 21, 19.9, 18.7],
        previous: [27.2, 25.3, 24.5, 22.3, 20.5, 19.6, 18.6],
        currentTailIndex: 5,
      },
      '30d': {
        current: [27.8, 26.2, 25.2, 23.7, 21.9, 21.1, 20.4, 18.7],
        previous: [27.2, 25.5, 24.9, 23, 21.3, 20.8, 20.3, 18.4],
        currentTailIndex: 6,
      },
      '90d': {
        current: [27.8, 26.2, 25.2, 23.7, 21.9, 21.1, 20.4, 18.7],
        previous: [27.2, 25.5, 24.9, 23, 21.3, 20.8, 20.3, 18.4],
        currentTailIndex: 6,
      },
      '12m': {
        current: [27.8, 26.7, 26.2, 25.1, 23.8, 23.5, 23.3, 21.7, 21.1, 20.7, 19.1, 18.7],
        previous: [27.2, 26, 25.8, 24.3, 23.2, 23.2, 23.1, 21.3, 20.8, 20.2, 18.9, 18.6],
        currentTailIndex: 10,
      },
    },
  },
]

const rangeLabels: Readonly<Record<OverviewRange, readonly string[]>> = {
  '7d': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  '30d': ['Apr 22', 'Apr 27', 'May 2', 'May 7', 'May 12', 'May 17', 'May 22', 'May 27'],
  '90d': ['Mar 1', 'Mar 14', 'Mar 27', 'Apr 9', 'Apr 22', 'May 5', 'May 18', 'May 31'],
  '12m': ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'],
}

function rows(items: readonly [string, string, number][]): readonly RankingRow[] {
  return items.map(([label, value, share], index) => ({
    id: `${label}-${index}`,
    label,
    value,
    share,
  }))
}

const breakdowns: readonly BreakdownSection[] = [
  {
    id: 'pages',
    title: 'Top pages',
    subtitle: 'Most viewed paths',
    icon: File01Icon,
    tabs: [
      { id: 'pages', label: 'Pages' },
      { id: 'titles', label: 'Titles' },
    ],
    activeTab: 'pages',
    rows: {
      pages: rows([
        ['/', '12,840', 78],
        ['/pricing', '8,214', 51],
        ['/docs/getting-started', '5,968', 37],
        ['/blog/roadmap', '3,742', 23],
        ['/contact', '2,106', 13],
      ]),
      titles: rows([
        ['Home', '12,840', 78],
        ['Plans and pricing', '8,214', 51],
        ['Getting started', '5,968', 37],
        ['Product roadmap', '3,742', 23],
        ['Contact', '2,106', 13],
      ]),
    },
  },
  {
    id: 'referrers',
    title: 'Referrers',
    subtitle: 'Where visitors came from',
    icon: Link01Icon,
    tabs: [
      { id: 'referrers', label: 'Referrers' },
      { id: 'channels', label: 'Channels' },
    ],
    activeTab: 'referrers',
    rows: {
      referrers: rows([
        ['Google', '7,420', 42],
        ['Direct / none', '4,882', 28],
        ['Hacker News', '2,946', 17],
        ['X', '1,328', 8],
        ['GitHub', '944', 5],
      ]),
      channels: rows([
        ['Organic search', '7,420', 42],
        ['Direct', '4,882', 28],
        ['Social', '2,274', 13],
        ['Referral', '2,020', 12],
        ['Email', '924', 5],
      ]),
    },
  },
  {
    id: 'countries',
    title: 'Countries',
    subtitle: 'Visitors by location',
    icon: GlobalIcon,
    tabs: [
      { id: 'countries', label: 'Countries' },
      { id: 'regions', label: 'Regions' },
    ],
    activeTab: 'countries',
    rows: {
      countries: rows([
        ['United States', '8,214', 33],
        ['Germany', '4,982', 20],
        ['United Kingdom', '3,746', 15],
        ['Canada', '2,518', 10],
        ['Netherlands', '1,842', 7],
      ]),
      regions: rows([
        ['North America', '11,842', 48],
        ['Europe', '9,418', 38],
        ['Asia Pacific', '2,144', 9],
        ['Other', '1,456', 5],
      ]),
    },
  },
  {
    id: 'devices',
    title: 'Devices',
    subtitle: 'How visitors browse',
    icon: ComputerIcon,
    tabs: [
      { id: 'devices', label: 'Devices' },
      { id: 'browsers', label: 'Browsers' },
    ],
    activeTab: 'devices',
    rows: {
      devices: rows([
        ['Desktop', '15,624', 63],
        ['Mobile', '7,218', 29],
        ['Tablet', '1,494', 6],
        ['Other', '524', 2],
      ]),
      browsers: rows([
        ['Chrome', '13,178', 53],
        ['Safari', '7,964', 32],
        ['Firefox', '1,986', 8],
        ['Edge', '1,234', 5],
        ['Other', '498', 2],
      ]),
    },
  },
]

const overviewFixture: OverviewFixture = {
  metrics,
  rangeLabels,
  defaultMetricId: 'visitors',
  breakdowns,
}

type OverviewViewState = 'loading' | 'error' | 'empty' | 'ready'

const selectedRange = shallowRef<OverviewRange>('30d')
const activeBreakdownTabs = shallowRef<Readonly<Record<BreakdownId, BreakdownTabId>>>({
  pages: 'pages',
  referrers: 'referrers',
  countries: 'countries',
  devices: 'devices',
})
const statusText = shallowRef('Updated 12 minutes ago')
const isLoading = shallowRef(false)
const fixtureError = shallowRef<string | null>(null)

const selectedRangeLabel = computed(
  () =>
    rangeOptions.find((range) => range.value === selectedRange.value)?.label ?? 'Selected period',
)
/** The metric the chart follows: the selected one, or the fixture default. */
const activeMetric = computed(
  () =>
    overviewFixture.metrics.find((metric) => metric.id === selectedMetricIds.value.at(0)) ??
    overviewFixture.metrics.find((metric) => metric.id === overviewFixture.defaultMetricId) ??
    overviewFixture.metrics[0]!,
)
const activeTrend = computed<OverviewTrend>(() => ({
  labels: overviewFixture.rangeLabels[selectedRange.value],
  ...activeMetric.value.trends[selectedRange.value],
}))
const visibleBreakdowns = computed<readonly VisibleBreakdownSection[]>(() =>
  overviewFixture.breakdowns.map((section) => {
    const activeTab = activeBreakdownTabs.value[section.id] ?? section.activeTab
    return {
      ...section,
      activeTab,
      rows: section.rows[activeTab] ?? [],
    }
  }),
)
const viewState = computed<OverviewViewState>(() => {
  if (isLoading.value) return 'loading'
  if (fixtureError.value !== null) return 'error'
  if (overviewFixture.metrics.length === 0 || overviewFixture.breakdowns.length === 0)
    return 'empty'
  return 'ready'
})

function handleRangeChange(range: OverviewRange): void {
  selectedRange.value = range
}

function handleRefresh(): void {
  statusText.value = 'Updated just now'
}

function handleBreakdownTabChange(payload: {
  sectionId: BreakdownId
  tabId: BreakdownTabId
}): void {
  const section = overviewFixture.breakdowns.find((item) => item.id === payload.sectionId)
  if (section === undefined || !section.tabs.some((tab) => tab.id === payload.tabId)) return

  activeBreakdownTabs.value = {
    ...activeBreakdownTabs.value,
    [payload.sectionId]: payload.tabId,
  }
}
</script>

<template>
  <section class="flex min-w-0 flex-col gap-6" aria-labelledby="site-overview-title">
    <OverviewToolbar
      :ranges="rangeOptions"
      :selected-range="selectedRange"
      :status-text="statusText"
      @range-change="handleRangeChange"
      @refresh="handleRefresh"
    />

    <div
      v-if="viewState === 'loading'"
      class="text-muted-foreground flex min-h-56 items-center justify-center gap-2 rounded-xl border border-dashed text-sm"
      role="status"
      aria-live="polite"
    >
      <Spinner class="motion-reduce:animate-none" />
      Loading site analytics…
    </div>

    <Empty v-else-if="viewState === 'empty'" class="min-h-56">
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

    <Empty v-else-if="viewState === 'error'" class="min-h-56 border-destructive/40">
      <EmptyHeader>
        <EmptyMedia variant="icon" class="bg-destructive/10 text-destructive">
          <HugeiconsIcon :icon="Alert02Icon" aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>Analytics unavailable</EmptyTitle>
        <EmptyDescription>
          {{ fixtureError ?? 'Unable to load analytics for this site.' }}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>

    <template v-else>
      <MetricGrid
        :metrics="overviewFixture.metrics"
        :selected-ids="selectedMetricIds"
        @toggle="handleMetricToggle"
      />
      <OverviewChart
        :metric="activeMetric"
        :trend="activeTrend"
        :range-label="selectedRangeLabel"
      />
      <BreakdownGrid :sections="visibleBreakdowns" @tab-change="handleBreakdownTabChange" />
    </template>
  </section>
</template>
