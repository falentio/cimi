<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDownRight01Icon, ArrowUpRight01Icon, MinusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { VisLine, VisXYContainer } from '@unovis/vue'
import { Card, CardContent } from '@/components/ui/card'
import type { ChartConfig } from '@/components/ui/chart'
import { ChartContainer } from '@/components/ui/chart'
import type { ChangeKind, OverviewIcon, OverviewMetric } from './site-overview.types'

interface SparklinePoint {
  readonly index: number
  readonly value: number
}

const props = defineProps<{
  readonly metrics: readonly OverviewMetric[]
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
</script>

<template>
  <section aria-label="Key metrics" class="min-w-0">
    <Card class="min-w-0 gap-0 p-0">
      <CardContent class="p-0">
        <ul class="grid min-w-0 list-none gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
          <li
            v-for="{ metric, sparklineData: data } in metricCells"
            :key="metric.id"
            class="min-w-0 bg-card px-4 py-4"
          >
            <div class="grid min-w-0 gap-3">
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
                  class="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg"
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
              <ChartContainer
                :config="sparklineConfig"
                class="aspect-auto h-8 min-h-0 min-w-0 w-full"
                aria-hidden="true"
              >
                <VisXYContainer
                  :data="data"
                  :x-domain="[0, Math.max(data.length - 1, 1)]"
                  :y-domain="[0, 1]"
                  :auto-margin="false"
                  :padding="{ top: 2, right: 0, bottom: 2, left: 0 }"
                >
                  <VisLine
                    :x="(point: SparklinePoint) => point.index"
                    :y="(point: SparklinePoint) => point.value"
                    :color="sparklineConfig.value.color"
                    :line-width="2"
                  />
                </VisXYContainer>
              </ChartContainer>
              <span class="sr-only">
                {{ metric.label }} changed {{ metric.change }} {{ metric.comparison }}.
              </span>
            </div>
          </li>
        </ul>
      </CardContent>
    </Card>
  </section>
</template>
