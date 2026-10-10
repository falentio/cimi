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
import { isNumberValue } from '../../../utils/type-guards'
import OverviewChartTooltip from './OverviewChartTooltip.vue'
import type { OverviewTrendView } from './site-overview.types'

interface ChartDatum {
  readonly index: number
  readonly label: string
  readonly current: number
  readonly previous: number
}

const props = defineProps<{
  readonly title: string
  readonly trend: OverviewTrendView
}>()

/** Visitors is the only series the contract trends, so the chart plots that one metric. */
const hasComparison = computed(() => props.trend.previous.length > 0)

const maxValue = computed(() =>
  Math.max(1, ...props.trend.current, ...(hasComparison.value ? props.trend.previous : [])),
)

/** True when the contract marks every bucket incomplete, so the whole series is a projection. */
const allIncomplete = computed(() => props.trend.currentTailIndex < 0)

/**
 * Index of the last complete bucket, or -1 when there is none. Clamped only at the top, so the
 * sentinel survives and the slice below can read it.
 */
const currentTailIndex = computed(() =>
  Math.min(props.trend.currentTailIndex, Math.max(props.trend.labels.length - 1, 0)),
)

const chartData = computed<ChartDatum[]>(() =>
  props.trend.labels.map((label, index) => ({
    index,
    label,
    current: props.trend.current[index] ?? 0,
    previous: props.trend.previous[index] ?? 0,
  })),
)

const solidChartData = computed(() =>
  allIncomplete.value ? [] : chartData.value.slice(0, currentTailIndex.value + 1),
)

const dottedChartData = computed(() =>
  allIncomplete.value ? [...chartData.value] : chartData.value.slice(currentTailIndex.value),
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

const tooltipTemplate = (datum: ChartDatum): string => {
  if (!isClient) return ''
  const container = document.createElement('div')
  render(
    h(OverviewChartTooltip, {
      payload: datum,
      title: props.title,
      dates: props.trend.dates,
      currentColor: chartConfig.current.color,
      previousColor: chartConfig.previous.color,
    }),
    container,
  )

  return container.innerHTML
}

function formatXTick(value: number | Date): string {
  return isNumberValue(value) ? (chartData.value[value]?.label ?? '') : ''
}

function formatYTick(value: number | Date): string {
  return isNumberValue(value) ? value.toLocaleString() : ''
}

const chartSummary = computed(() => {
  const currentEnd = props.trend.current.at(-1) ?? 0
  const previousEnd = props.trend.previous.at(-1)

  const comparison =
    previousEnd === undefined
      ? 'No comparison period is selected.'
      : 'The previous period ends at ' + previousEnd.toLocaleString() + '.'

  return (
    props.title +
    ' trend. The current period ends at ' +
    currentEnd.toLocaleString() +
    '. ' +
    comparison
  )
})
</script>

<template>
  <Card class="min-w-0">
    <CardHeader class="gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <CardTitle>{{ title }} over time</CardTitle>
        <CardDescription>Current period compared with the previous period.</CardDescription>
      </div>
    </CardHeader>
    <CardContent class="pt-0">
      <ChartContainer
        :config="chartConfig"
        class="aspect-auto h-64 min-h-0 w-full md:h-80"
        role="img"
        :aria-label="chartSummary"
      >
        <VisXYContainer :data="chartData" :x-domain="xDomain" :y-domain="yDomain">
          <VisArea
            v-if="hasComparison"
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
            :y="[
              (d: ChartDatum) => d.current,
              ...(hasComparison ? [(d: ChartDatum) => d.previous] : []),
            ]"
            :color="[
              chartConfig.current.color,
              ...(hasComparison ? [chartConfig.previous.color] : []),
            ]"
            :template="tooltipTemplate"
          />
        </VisXYContainer>
        <ChartLegendContent v-if="hasComparison" />
      </ChartContainer>
      <p class="sr-only">{{ chartSummary }}</p>
    </CardContent>
  </Card>
</template>
