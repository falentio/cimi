<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDownRight01Icon, ArrowUpRight01Icon, MinusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { Card, CardContent } from '@/components/ui/card'
import type { ChangeKind, OverviewIcon, OverviewMetric } from './site-overview.types'

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

function sparklinePath(values: readonly number[]): string {
  if (values.length === 0) return ''

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max === min ? 1 : max - min
  const step = values.length === 1 ? 0 : 100 / (values.length - 1)

  return values
    .map((value, index) => {
      const x = index * step
      const y = 24 - ((value - min) / span) * 18
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

const metricCells = computed(() =>
  props.metrics.map((metric) => ({
    metric,
    sparklinePath: sparklinePath(metric.sparkline),
  })),
)
</script>

<template>
  <section aria-label="Key metrics" class="min-w-0">
    <Card class="min-w-0 gap-0 p-0">
      <CardContent class="p-0">
        <ul class="grid min-w-0 list-none gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
          <li
            v-for="{ metric, sparklinePath: path } in metricCells"
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
              <svg
                class="text-primary/70 h-8 w-full"
                viewBox="0 0 100 28"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  :d="path"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
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
