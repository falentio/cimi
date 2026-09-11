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
  },
]

const trendByRange: Readonly<Record<OverviewRange, OverviewTrend>> = {
  '7d': {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    current: [52, 59, 48, 66, 72, 61, 68],
    previous: [44, 47, 51, 49, 58, 56, 59],
    currentTailIndex: 5,
  },
  '30d': {
    labels: ['Apr 22', 'Apr 27', 'May 2', 'May 7', 'May 12', 'May 17', 'May 22', 'May 27'],
    current: [52, 58, 50, 65, 61, 74, 68, 82],
    previous: [44, 49, 47, 53, 55, 60, 59, 66],
    currentTailIndex: 6,
  },
  '90d': {
    labels: ['Mar 1', 'Mar 14', 'Mar 27', 'Apr 9', 'Apr 22', 'May 5', 'May 18', 'May 31'],
    current: [41, 48, 46, 57, 52, 67, 62, 79],
    previous: [38, 43, 45, 48, 50, 55, 58, 63],
    currentTailIndex: 6,
  },
  '12m': {
    labels: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'],
    current: [34, 39, 42, 45, 51, 54, 57, 61, 65, 69, 74, 82],
    previous: [30, 34, 37, 41, 43, 46, 49, 52, 55, 59, 63, 68],
    currentTailIndex: 10,
  },
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
  trends: trendByRange,
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
      <MetricGrid :metrics="overviewFixture.metrics" />
      <OverviewChart
        :trend="overviewFixture.trends[selectedRange]"
        :range-label="selectedRangeLabel"
      />
      <BreakdownGrid :sections="visibleBreakdowns" @tab-change="handleBreakdownTabChange" />
    </template>
  </section>
</template>
