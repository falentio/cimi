<script setup lang="ts">
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { CohortDateRange } from './cohort-retention.types'

const props = defineProps<{
  readonly range: CohortDateRange
  readonly comparison: boolean
  readonly maxPeriods: number
  readonly periodCount: number
}>()

const emit = defineEmits<{
  (event: 'range', range: CohortDateRange): void
  (event: 'comparison', enabled: boolean): void
}>()

const from = computed<string>({
  get: () => props.range.fromDate,
  set: (value) => emit('range', { ...props.range, fromDate: String(value) }),
})

const to = computed<string>({
  get: () => props.range.toDate,
  set: (value) => emit('range', { ...props.range, toDate: String(value) }),
})

const comparing = computed<boolean>({
  get: () => props.comparison,
  set: (value) => emit('comparison', value === true),
})

const overBound = computed(() => props.periodCount > props.maxPeriods)
</script>

<template>
  <div class="flex flex-wrap items-end gap-4">
    <div class="flex flex-col gap-1">
      <Label for="cohort-from">From</Label>
      <Input id="cohort-from" v-model="from" type="date" class="w-40" :aria-invalid="overBound" />
    </div>

    <div class="flex flex-col gap-1">
      <Label for="cohort-to">To</Label>
      <Input id="cohort-to" v-model="to" type="date" class="w-40" :aria-invalid="overBound" />
    </div>

    <div class="flex items-center gap-2">
      <Switch v-model="comparing" id="cohort-compare" />
      <Label for="cohort-compare">Compare with the previous period</Label>
    </div>

    <p v-if="overBound" class="text-destructive text-xs" role="alert">
      {{ periodCount }} periods is more than the {{ maxPeriods }} this report allows. Shorten the
      range.
    </p>
  </div>
</template>
