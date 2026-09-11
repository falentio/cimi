<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { OverviewTrend } from './site-overview.types'

interface ChartPoint {
  readonly x: number
  readonly y: number
}

const props = defineProps<{
  readonly trend: OverviewTrend
  readonly rangeLabel: string
}>()

const chartWidth = 960
const chartHeight = 300
const plotLeft = 32
const plotRight = 16
const plotTop = 18
const plotBottom = 42
const plotWidth = chartWidth - plotLeft - plotRight
const plotHeight = chartHeight - plotTop - plotBottom

const pointCount = computed(() => Math.max(props.trend.labels.length, 1))
const maxValue = computed(() => Math.max(1, ...props.trend.current, ...props.trend.previous))

function toPoints(values: readonly number[]): readonly ChartPoint[] {
  return values.map((value, index) => {
    const x = plotLeft + (pointCount.value === 1 ? 0 : (index / (pointCount.value - 1)) * plotWidth)
    const y = plotTop + plotHeight - (value / maxValue.value) * plotHeight
    return { x, y }
  })
}

function pathFor(points: readonly ChartPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
}

const currentPoints = computed(() => toPoints(props.trend.current))
const previousPoints = computed(() => toPoints(props.trend.previous))
const tailStartIndex = computed(() =>
  Math.min(Math.max(props.trend.currentTailIndex, 0), Math.max(currentPoints.value.length - 1, 0)),
)
const solidCurrentPoints = computed(() => currentPoints.value.slice(0, tailStartIndex.value + 1))
const dottedCurrentPoints = computed(() => currentPoints.value.slice(tailStartIndex.value))
const previousPath = computed(() => pathFor(previousPoints.value))
const solidCurrentPath = computed(() => pathFor(solidCurrentPoints.value))
const dottedCurrentPath = computed(() => pathFor(dottedCurrentPoints.value))
const currentAreaPath = computed(() => {
  const points = solidCurrentPoints.value
  const first = points[0]
  const last = points.at(-1)
  if (first === undefined || last === undefined || points.length < 2) return ''
  return `${pathFor(points)} L ${last.x.toFixed(2)} ${plotTop + plotHeight} L ${first.x.toFixed(2)} ${plotTop + plotHeight} Z`
})

const yTicks = computed(() =>
  [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    label: Math.round(maxValue.value * ratio).toLocaleString(),
    y: plotTop + plotHeight - ratio * plotHeight,
  })),
)

const xLabels = computed(() =>
  props.trend.labels.map((label, index) => ({
    label,
    x: plotLeft + (pointCount.value === 1 ? 0 : (index / (pointCount.value - 1)) * plotWidth),
  })),
)

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
      <div
        class="flex shrink-0 flex-wrap items-center gap-3 text-muted-foreground text-xs"
        role="group"
        aria-label="Chart legend"
      >
        <span class="inline-flex items-center gap-1.5">
          <span class="bg-primary size-2 rounded-full" aria-hidden="true" />
          Current period
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="bg-muted-foreground/40 size-2 rounded-full" aria-hidden="true" />
          Previous period
        </span>
      </div>
    </CardHeader>
    <CardContent class="pt-0">
      <div class="min-w-0">
        <svg
          class="text-foreground block h-auto min-h-64 w-full"
          viewBox="0 0 960 300"
          role="img"
          aria-labelledby="overview-chart-title overview-chart-description"
        >
          <title id="overview-chart-title">Traffic trend for {{ props.rangeLabel }}</title>
          <desc id="overview-chart-description">{{ chartSummary }}</desc>
          <g aria-hidden="true">
            <line
              v-for="(tick, index) in yTicks"
              :key="index"
              :x1="plotLeft"
              :x2="chartWidth - plotRight"
              :y1="tick.y"
              :y2="tick.y"
              class="text-border"
              stroke="currentColor"
              stroke-width="1"
            />
            <text
              v-for="(tick, index) in yTicks"
              :key="`label-${index}`"
              :x="plotLeft - 8"
              :y="tick.y + 4"
              class="fill-foreground text-[11px]"
              text-anchor="end"
            >
              {{ tick.label }}
            </text>
            <text
              v-for="label in xLabels"
              :key="label.label"
              :x="label.x"
              :y="chartHeight - 12"
              class="fill-foreground text-[11px]"
              text-anchor="middle"
            >
              {{ label.label }}
            </text>
            <path
              :d="previousPath"
              class="text-muted-foreground/40"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
            <path
              v-if="currentAreaPath"
              :d="currentAreaPath"
              class="text-primary/10"
              fill="currentColor"
              stroke="none"
            />
            <path
              :d="solidCurrentPath"
              class="text-primary"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
            />
            <path
              :d="dottedCurrentPath"
              class="text-primary"
              fill="none"
              stroke="currentColor"
              stroke-dasharray="2 8"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
            />
          </g>
        </svg>
        <p class="sr-only">{{ chartSummary }}</p>
      </div>
    </CardContent>
  </Card>
</template>
