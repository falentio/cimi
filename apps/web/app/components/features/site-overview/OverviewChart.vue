<script setup lang="ts">
import { computed, h, render } from 'vue'
import { isClient } from '@vueuse/core'
import { VisArea, VisAxis, VisXYContainer } from '@unovis/vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ChartConfig } from '@/components/ui/chart'
import {
  ChartContainer,
  ChartCrosshair,
  ChartLegendContent,
  ChartTooltip,
} from '@/components/ui/chart'
import type { OverviewMetric, OverviewRange, OverviewTrend } from './site-overview.types'
import OverviewChartTooltip from './OverviewChartTooltip.vue'

interface ChartDatum {
  readonly index: number
  readonly label: string
  readonly current: number
  readonly previous: number
}

const props = defineProps<{
  readonly metric: OverviewMetric
  readonly trend: OverviewTrend
  readonly range: OverviewRange
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
    }
  }),
)
const solidChartData = computed(() => chartData.value.slice(0, currentTailIndex.value + 1))
const dottedChartData = computed(() => chartData.value.slice(currentTailIndex.value))
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

const tooltipTemplate = (datum: ChartDatum): string => {
  if (!isClient) return ''
  const container = document.createElement('div')
  render(
    h(OverviewChartTooltip, {
      payload: datum,
      title: props.metric.label,
      dates: props.trend.dates,
      range: props.range,
      unit: props.metric.unit,
      polarity: props.metric.polarity,
      currentColor: chartConfig.current.color,
      previousColor: chartConfig.previous.color,
    }),
    container,
  )
  return container.innerHTML
}

function formatXTick(value: number | Date): string {
  return typeof value === 'number' ? (chartData.value[value]?.label ?? '') : ''
}

function formatYTick(value: number | Date): string {
  if (typeof value !== 'number') return ''
  return props.metric.unit === 'percent' ? `${value}%` : value.toLocaleString()
}

const chartSummary = computed(() => {
  const currentEnd = props.trend.current.at(-1) ?? 0
  const previousEnd = props.trend.previous.at(-1) ?? 0
  return `${props.metric.label} trend for ${props.rangeLabel}. The current period ends at ${currentEnd.toLocaleString()} and the previous period ends at ${previousEnd.toLocaleString()}.`
})
</script>

<template>
  <Card class="min-w-0">
    <CardHeader class="gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <CardTitle>{{ metric.label }} over time</CardTitle>
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
          <VisArea
            :data="chartData"
            :x="(d: ChartDatum) => d.index"
            :y="(d: ChartDatum) => d.previous"
            :color="chartConfig.previous.color"
            :opacity="0.08"
            :line="true"
            :line-color="chartConfig.previous.color"
            :line-width="2"
          />
          <VisArea
            :data="solidChartData"
            :x="(d: ChartDatum) => d.index"
            :y="(d: ChartDatum) => d.current"
            :color="chartConfig.current.color"
            :opacity="0.14"
            :line="true"
            :line-color="chartConfig.current.color"
            :line-width="2.5"
          />
          <VisArea
            :data="dottedChartData"
            :x="(d: ChartDatum) => d.index"
            :y="(d: ChartDatum) => d.current"
            :color="chartConfig.current.color"
            :opacity="0"
            :line="true"
            :line-color="chartConfig.current.color"
            :line-width="2.5"
            :line-dash-array="[2, 8]"
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
            :data="chartData"
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
