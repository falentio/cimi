<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import type { CohortReportFailure } from './cohort-retention.types'

defineProps<{
  readonly failure: CohortReportFailure | undefined
}>()
</script>

<template>
  <div
    v-if="failure !== undefined"
    class="border-destructive/40 bg-destructive/5 text-destructive flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
    role="status"
  >
    <Badge variant="outline" class="border-destructive/40 text-destructive">Unavailable</Badge>
    <span>{{ failure.message }}</span>
  </div>
</template>
