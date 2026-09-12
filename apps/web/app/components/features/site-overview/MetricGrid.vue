<script setup lang="ts">
import { computed } from 'vue'
import {
  ArrowDownRight01Icon,
  ArrowUpRight01Icon,
  Cancel01Icon,
  FilterIcon,
  MinusSignIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { VisArea, VisXYContainer } from '@unovis/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { ChartConfig } from '@/components/ui/chart'
import { ChartContainer } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import type {
  ChangeKind,
  OverviewIcon,
  OverviewMetric,
  OverviewMetricId,
} from './site-overview.types'

interface SparklinePoint {
  readonly index: number
  readonly value: number
}

const props = defineProps<{
  readonly metrics: readonly OverviewMetric[]
  readonly selectedIds: readonly OverviewMetricId[]
}>()

const emit = defineEmits<{
  toggle: [id: OverviewMetricId]
  clear: []
}>()

const changeIcons: Readonly<Record<ChangeKind, OverviewIcon>> = {
  positive: ArrowUpRight01Icon,
  negative: ArrowDownRight01Icon,
  neutral: MinusSignIcon,
}

const changeClasses: Readonly<Record<ChangeKind, string>> = {
  positive: 'text-emerald-700 dark:text-emerald-300',
  negative: 'text-destructive',
  neutral: 'text-muted-foreground',
}

const sparklineConfig = {
  value: {
    label: 'Trend',
    color: 'var(--primary)',
  },
} satisfies ChartConfig

function sparklineData(values: readonly number[]): SparklinePoint[] {
  if (values.length === 0) return []

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max === min ? 1 : max - min

  return values.map((value, index) => ({
    index,
    value: (value - min) / span,
  }))
}

const metricCells = computed(() =>
  props.metrics.map((metric) => ({
    metric,
    sparklineData: sparklineData(metric.sparkline),
  })),
)

/** Focused is a single-select lens: the first selected id is the active filter. */
const activeId = computed<OverviewMetricId | null>(() => props.selectedIds.at(0) ?? null)
const activeMetric = computed(
  () => props.metrics.find((metric) => metric.id === activeId.value) ?? null,
)
const hasSelection = computed(() => activeId.value !== null)
</script>

<template>
  <section aria-label="Key metrics" class="min-w-0">
    <Card class="min-w-0 gap-0 p-0">
      <CardContent class="bg-muted p-1">
        <div
          v-if="hasSelection"
          class="mb-1 flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-2"
        >
          <p class="flex min-w-0 items-center gap-2 text-sm">
            <HugeiconsIcon
              :icon="FilterIcon"
              :size="15"
              class="text-primary shrink-0"
              aria-hidden="true"
            />
            <span class="text-muted-foreground shrink-0">Filtering by</span>
            <span class="truncate font-medium">{{ activeMetric?.label }}</span>
          </p>
          <Button type="button" variant="ghost" size="sm" @click="emit('clear')">
            <HugeiconsIcon :icon="Cancel01Icon" aria-hidden="true" data-icon="inline-start" />
            Clear
          </Button>
        </div>

        <ul class="grid min-w-0 list-none gap-1 bg-muted sm:grid-cols-2 xl:grid-cols-3">
          <li
            v-for="{ metric, sparklineData: data } in metricCells"
            :key="metric.id"
            class="min-w-0"
          >
            <button
              type="button"
              :aria-pressed="activeId === metric.id"
              :class="
                cn(
                  'flex w-full min-w-0 flex-col overflow-hidden rounded-lg bg-card text-left outline-none',
                  'focus-visible:ring-ring/50 focus-visible:ring-3',
                  'transition-[opacity,box-shadow] duration-150 motion-reduce:transition-none',
                  activeId === metric.id
                    ? 'ring-2 ring-primary ring-inset'
                    : 'ring-1 ring-transparent ring-inset hover:ring-border',
                  hasSelection && activeId !== metric.id
                    ? 'opacity-45 hover:opacity-80'
                    : 'opacity-100',
                )
              "
              @click="emit('toggle', metric.id)"
            >
              <div class="grid min-w-0 gap-3 px-4 pt-4 pb-4">
                <div class="flex min-w-0 items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-muted-foreground break-words text-sm font-medium">
                      {{ metric.label }}
                    </p>
                    <p class="text-2xl font-semibold tracking-tight tabular-nums">
                      {{ metric.value }}
                    </p>
                  </div>
                  <span
                    class="flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors"
                    :class="
                      activeId === metric.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-primary/10 text-primary'
                    "
                  >
                    <HugeiconsIcon :icon="metric.icon" :size="16" aria-hidden="true" />
                  </span>
                </div>
                <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span
                    :class="[
                      'inline-flex items-center gap-1 font-medium',
                      changeClasses[metric.changeKind],
                    ]"
                  >
                    <HugeiconsIcon
                      :icon="changeIcons[metric.changeKind]"
                      :size="14"
                      aria-hidden="true"
                    />
                    {{ metric.change }}
                  </span>
                  <span class="text-muted-foreground">{{ metric.comparison }}</span>
                </div>
                <span class="sr-only">
                  {{ metric.label }} changed {{ metric.change }} {{ metric.comparison }}.
                </span>
              </div>
              <ChartContainer
                :config="sparklineConfig"
                class="aspect-auto h-16 scale-103 min-h-0 min-w-0 w-full"
                aria-hidden="true"
              >
                <VisXYContainer
                  :x-domain="[0, Math.max(data.length - 1, 1)]"
                  :y-domain="[0, 1]"
                  :auto-margin="false"
                  :padding="{ top: 2, right: 0, bottom: 2, left: 0 }"
                >
                  <VisArea
                    :data="data"
                    :x="(point: SparklinePoint) => point.index"
                    :y="(point: SparklinePoint) => point.value"
                    :color="sparklineConfig.value.color"
                    :opacity="0.14"
                    :line="true"
                    :line-color="sparklineConfig.value.color"
                    :line-width="2"
                  />
                </VisXYContainer>
              </ChartContainer>
            </button>
          </li>
        </ul>
      </CardContent>
    </Card>
  </section>
</template>
