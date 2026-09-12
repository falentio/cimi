<script setup lang="ts">
import { computed } from 'vue'
import { VisAxis, VisLine, VisXYContainer } from '@unovis/vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ChartConfig } from '@/components/ui/chart'
import {
  ChartContainer,
  ChartCrosshair,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  componentToString,
} from '@/components/ui/chart'
import type { OverviewTrend } from './site-overview.types'

interface ChartDatum {
  readonly index: number
  readonly label: string
  readonly current: number
  readonly previous: number
  readonly currentSolid: number | undefined
  readonly currentDotted: number | undefined
}

const props = defineProps<{
  readonly trend: OverviewTrend
  readonly rangeLabel: string
}>()

const maxValue = computed(() => Math.max(1, ...props.trend.current, ...props.trend.previous))
const currentTailIndex = computed(() =>
  Math.min(Math.max(props.trend.currentTailIndex, 0), Math.max(props.trend.labels.length - 1, 0)),
)
const chartData = computed<ChartDatum[]>(() =>
  props.trend.labels.map((label, index) => {
    const current = props.trend.current[index] ?? 0
    const previous = props.trend.previous[index] ?? 0
    return {
      index,
      label,
      current,
      previous,
      currentSolid: index <= currentTailIndex.value ? current : undefined,
      currentDotted: index >= currentTailIndex.value ? current : undefined,
    }
  }),
)
const xDomain = computed<[number, number]>(() => [0, Math.max(chartData.value.length - 1, 1)])
const yDomain = computed<[number, number]>(() => [0, maxValue.value])
const xTickValues = computed(() => chartData.value.map((point) => point.index))

const chartConfig = {
  current: {
    label: 'Current period',
    color: 'var(--primary)',
  },
  previous: {
    label: 'Previous period',
    color: 'var(--muted-foreground)',
  },
} satisfies ChartConfig

const tooltipTemplate = componentToString(chartConfig, ChartTooltipContent, {
  labelKey: 'label',
  indicator: 'line',
})

function formatXTick(value: number | Date): string {
  return typeof value === 'number' ? (chartData.value[value]?.label ?? '') : ''
}

function formatYTick(value: number | Date): string {
  return typeof value === 'number' ? value.toLocaleString() : ''
}

function lineDashArray(_data: ChartDatum[], seriesIndex: number): number[] | undefined {
  return seriesIndex === 1 ? [2, 8] : undefined
}

const chartSummary = computed(() => {
  const currentEnd = props.trend.current.at(-1) ?? 0
  const previousEnd = props.trend.previous.at(-1) ?? 0
  return `Traffic trend for ${props.rangeLabel}. The current period ends at ${currentEnd.toLocaleString()} and the previous period ends at ${previousEnd.toLocaleString()}.`
})
</script>

<template>
  <Card class="min-w-0">
    <CardHeader class="gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <CardTitle>Traffic over time</CardTitle>
        <CardDescription>Current period compared with the previous period.</CardDescription>
      </div>
    </CardHeader>
    <CardContent class="pt-0">
      <ChartContainer
        :config="chartConfig"
        class="min-h-64 w-full"
        role="img"
        :aria-label="chartSummary"
      >
        <VisXYContainer :data="chartData" :x-domain="xDomain" :y-domain="yDomain">
          <VisLine
            :x="(d: ChartDatum) => d.index"
            :y="(d: ChartDatum) => d.previous"
            :color="chartConfig.previous.color"
            :line-width="2"
          />
          <VisLine
            :x="(d: ChartDatum) => d.index"
            :y="[(d: ChartDatum) => d.currentSolid, (d: ChartDatum) => d.currentDotted]"
            :color="[chartConfig.current.color, chartConfig.current.color]"
            :line-width="2.5"
            :line-dash-array="lineDashArray"
          />
          <VisAxis
            type="x"
            :x="(d: ChartDatum) => d.index"
            :tick-values="xTickValues"
            :tick-format="formatXTick"
            :tick-line="false"
            :domain-line="false"
            :grid-line="false"
            :tick-text-hide-overlapping="true"
          />
          <VisAxis
            type="y"
            :tick-format="formatYTick"
            :tick-line="false"
            :domain-line="false"
            :grid-line="true"
            :num-ticks="5"
          />
          <ChartTooltip />
          <ChartCrosshair
            :x="(d: ChartDatum) => d.index"
            :y="[(d: ChartDatum) => d.current, (d: ChartDatum) => d.previous]"
            :color="[chartConfig.current.color, chartConfig.previous.color]"
            :template="tooltipTemplate"
          />
        </VisXYContainer>
        <ChartLegendContent />
      </ChartContainer>
      <p class="sr-only">{{ chartSummary }}</p>
    </CardContent>
  </Card>
</template>
