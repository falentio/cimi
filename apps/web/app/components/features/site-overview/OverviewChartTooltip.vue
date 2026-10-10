<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { ArrowDownRight01Icon, ArrowUpRight01Icon, MinusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { cn } from '@/lib/utils'
import { resolveOverviewChange } from './site-overview-chart-change'
import type { ChangeKind, OverviewIcon, OverviewTrendPointDate } from './site-overview.types'

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
    dates: readonly OverviewTrendPointDate[]
    currentColor: string
    previousColor: string
    class?: HTMLAttributes['class']
  }>(),
  {
    payload: () => ({}),
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
  return value === undefined ? '\u2014' : value.toLocaleString()
}

const dates = computed<OverviewTrendPointDate | undefined>(
  () => props.dates[props.payload.index ?? -1],
)

const rows = computed(() => [
  {
    key: 'current',
    label: dates.value?.current ?? '',
    value: props.payload.current,
    color: props.currentColor,
  },
  {
    key: 'previous',
    label: dates.value?.previous ?? '',
    value: props.payload.previous,
    color: props.previous.color,
  },
])

/** The chart plots visitors, where more is better, so polarity is fixed. */
const change = computed(() =>
  resolveOverviewChange(props.payload.current, props.payload.previous, 'higher-is-better'),
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
