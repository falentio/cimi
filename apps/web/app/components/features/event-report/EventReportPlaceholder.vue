<script setup lang="ts">
import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import EventReportContext from './EventReportContext.vue'
import EventReportExplorer from './EventReportExplorer.vue'
import EventReportMetrics from './EventReportMetrics.vue'
import { eventReportViewModel } from './event-report.types'
</script>

<template>
  <section class="flex min-w-0 flex-col gap-6" aria-labelledby="event-report-title">
    <header class="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <div class="flex min-w-0 flex-wrap items-center gap-3">
          <h2 id="event-report-title" class="cn-font-heading text-2xl font-semibold tracking-tight">
            Events
          </h2>
          <Badge variant="secondary">Contract-only</Badge>
        </div>
        <p class="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">
          Bounded, authenticated reporting for accepted Events. The report shape is ready, but
          runtime handlers are not served yet.
        </p>
      </div>
    </header>

    <Alert class="items-start">
      <HugeiconsIcon :icon="Alert02Icon" aria-hidden="true" />
      <AlertTitle>Event reporting is not served yet.</AlertTitle>
      <AlertDescription>
        The contract is read-only and stateless. Counts, rows, and freshness metadata will appear
        after the report procedures have runtime handlers.
      </AlertDescription>
    </Alert>

    <EventReportContext
      :context="eventReportViewModel.context"
      :event-kinds="eventReportViewModel.eventKinds"
    />
    <EventReportMetrics :metrics="eventReportViewModel.metrics" />
    <EventReportExplorer :operations="eventReportViewModel.operations" />
  </section>
</template>
