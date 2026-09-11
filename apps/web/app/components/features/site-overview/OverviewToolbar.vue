<script setup lang="ts">
import { computed } from 'vue'
import { Calendar03Icon, RefreshIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { OverviewRange, OverviewRangeOption } from './site-overview.types'

const props = defineProps<{
  readonly ranges: readonly OverviewRangeOption[]
  readonly selectedRange: OverviewRange
  readonly statusText: string
}>()

const emit = defineEmits<{
  rangeChange: [range: OverviewRange]
  refresh: []
}>()

const selectedRangeLabel = computed(
  () =>
    props.ranges.find((range) => range.value === props.selectedRange)?.label ?? 'Choose a range',
)

function handleRangeChange(value: unknown): void {
  if (typeof value !== 'string') return
  const range = props.ranges.find((option) => option.value === value)
  if (range === undefined) return
  emit('rangeChange', range.value)
}
</script>

<template>
  <section
    aria-labelledby="site-overview-title"
    class="flex flex-col gap-4 border-border/70 border-b pb-5 lg:flex-row lg:items-end lg:justify-between"
  >
    <div class="flex min-w-0 flex-col gap-1">
      <p class="text-muted-foreground text-sm font-medium">Overview</p>
      <h2 id="site-overview-title" class="text-2xl font-semibold tracking-tight text-balance">
        Site analytics
      </h2>
      <p class="text-muted-foreground max-w-xl text-sm text-pretty">
        See how visitors find and use this site.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <label for="overview-range" class="sr-only">Time range</label>
      <Select :model-value="props.selectedRange" @update:model-value="handleRangeChange">
        <SelectTrigger id="overview-range" class="min-w-36" aria-label="Time range">
          <HugeiconsIcon :icon="Calendar03Icon" aria-hidden="true" data-icon="inline-start" />
          <SelectValue placeholder="Choose a range">{{ selectedRangeLabel }}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="range in props.ranges" :key="range.value" :value="range.value">
            {{ range.label }}
          </SelectItem>
        </SelectContent>
      </Select>

      <Button type="button" @click="emit('refresh')">
        <HugeiconsIcon :icon="RefreshIcon" aria-hidden="true" data-icon="inline-start" />
        Refresh
      </Button>

      <span
        role="status"
        aria-live="polite"
        class="text-muted-foreground min-h-5 text-xs whitespace-nowrap"
      >
        {{ props.statusText }}
      </span>
    </div>
  </section>
</template>
