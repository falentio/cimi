<script setup lang="ts">
import { HugeiconsIcon } from '@hugeicons/vue'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { EventMetricDescriptor } from './event-report.types'

const props = defineProps<{
  readonly metrics: readonly EventMetricDescriptor[]
}>()
</script>

<template>
  <section aria-labelledby="event-metrics-title">
    <h3 id="event-metrics-title" class="sr-only">Event report metrics</h3>
    <div class="grid min-w-0 gap-4 sm:grid-cols-3">
      <Card v-for="metric in props.metrics" :key="metric.id" size="sm" class="min-w-0">
        <CardHeader class="gap-2">
          <div class="flex min-w-0 items-start justify-between gap-3">
            <CardDescription class="min-w-0">{{ metric.label }}</CardDescription>
            <span
              class="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg"
            >
              <HugeiconsIcon :icon="metric.icon" aria-hidden="true" />
            </span>
          </div>
          <CardTitle>
            <p class="text-3xl font-semibold tracking-tight tabular-nums">
              {{ metric.displayValue }}
            </p>
          </CardTitle>
        </CardHeader>
        <CardContent class="flex min-w-0 flex-col gap-2 pt-0">
          <Badge variant="secondary" class="w-fit">{{ metric.status }}</Badge>
          <p class="text-muted-foreground text-xs leading-relaxed">{{ metric.description }}</p>
        </CardContent>
      </Card>
    </div>
  </section>
</template>
