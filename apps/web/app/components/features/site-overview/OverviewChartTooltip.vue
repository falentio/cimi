<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { ArrowDownRight01Icon, ArrowUpRight01Icon, MinusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { cn } from '@/lib/utils'
import type {
  ChangeKind,
  OverviewIcon,
  OverviewMetricPolarity,
  OverviewRange,
} from './site-overview.types'
import { resolveOverviewChange } from './site-overview-chart-change'
import { resolveTooltipDates } from './site-overview-chart-dates'

interface TooltipDatum {
  readonly index?: number
  readonly current?: number
  readonly previous?: number
}

const props = withDefaults(
  defineProps<{
    /** Injected by the crosshair template: the nearest hovered datum. */
    payload?: TooltipDatum
    title: string
    dates: readonly string[]
    range: OverviewRange
    unit?: string
    polarity: OverviewMetricPolarity
    currentColor: string
    previousColor: string
    class?: HTMLAttributes['class']
  }>(),
  {
    payload: () => ({}),
    unit: 'count',
  },
)

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

function formatValue(value: number | undefined): string {
  if (value === undefined) return '—'
  return props.unit === 'percent' ? `${value.toLocaleString()}%` : value.toLocaleString()
}

const rows = computed(() => {
  const dates = resolveTooltipDates(props.dates[props.payload.index ?? -1], props.range)

  return [
    {
      key: 'current',
      label: dates.current,
      value: props.payload.current,
      color: props.currentColor,
    },
    {
      key: 'previous',
      label: dates.previous,
      value: props.payload.previous,
      color: props.previousColor,
    },
  ]
})

const change = computed(() =>
  resolveOverviewChange(props.payload.current, props.payload.previous, props.polarity),
)
</script>

<template>
  <div
    :class="
      cn(
        'border-border/50 bg-background grid min-w-32 items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl',
        props.class,
      )
    "
  >
    <div class="font-medium">
      {{ title }}
    </div>
    <div class="grid gap-1.5">
      <div v-for="row in rows" :key="row.key" class="flex w-full flex-wrap items-stretch gap-2">
        <div
          class="w-1 shrink-0 rounded-xs border-(--color-border) bg-(--color-bg)"
          :style="{ '--color-bg': row.color, '--color-border': row.color }"
        />
        <div class="flex flex-1 items-center justify-between leading-none">
          <span class="text-muted-foreground">{{ row.label }}</span>
          <span class="text-foreground font-mono font-medium tabular-nums">
            {{ formatValue(row.value) }}
          </span>
        </div>
      </div>
    </div>
    <div
      v-if="change"
      class="border-border/50 mt-0.5 flex items-center justify-between gap-2 border-t pt-1.5"
    >
      <span class="text-muted-foreground">Change</span>
      <span
        :class="[
          'inline-flex items-center gap-1 font-mono font-medium',
          changeClasses[change.kind],
        ]"
      >
        <HugeiconsIcon :icon="changeIcons[change.kind]" :size="14" aria-hidden="true" />
        {{ change.label }}
      </span>
    </div>
  </div>
</template>
