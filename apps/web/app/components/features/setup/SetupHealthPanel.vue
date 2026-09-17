<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import type { HealthView, SetupHealth } from './setup.types'

const props = defineProps<{
  health: HealthView
  refresh: () => Promise<void>
}>()

const retrying = shallowRef(false)
const report = computed<SetupHealth | undefined>(() => {
  if (props.health.kind === 'report' || props.health.kind === 'stale-report') {
    return props.health.report
  }
  return undefined
})

async function retry(): Promise<void> {
  retrying.value = true
  try {
    await props.refresh()
  } catch {
    return
  } finally {
    retrying.value = false
  }
}

function statusLabel(value: string): string {
  return value.replaceAll('_', ' ')
}

function statusTone(value: SetupHealth['status']): string {
  switch (value) {
    case 'healthy':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    case 'degraded':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
    case 'recovering':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300'
    case 'maintenance':
      return 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300'
    case 'unavailable':
      return 'border-destructive/30 bg-destructive/10 text-destructive'
  }
}

function statusDot(value: SetupHealth['status']): string {
  switch (value) {
    case 'healthy':
      return 'bg-emerald-500'
    case 'degraded':
      return 'bg-amber-500'
    case 'recovering':
      return 'bg-sky-500'
    case 'maintenance':
      return 'bg-violet-500'
    case 'unavailable':
      return 'bg-destructive'
  }
}
</script>

<template>
  <section aria-labelledby="setup-health-ledger-title" class="space-y-3">
    <div>
      <p class="text-muted-foreground text-xs font-medium tracking-[0.16em] uppercase">
        Diagnostic ledger
      </p>
      <h2 id="setup-health-ledger-title" class="mt-1 text-lg font-semibold tracking-tight">
        System health
      </h2>
    </div>

    <div
      v-if="health.kind === 'loading'"
      class="text-muted-foreground flex items-center gap-2 text-sm"
      role="status"
      aria-live="polite"
    >
      <Spinner aria-hidden="true" />
      Checking system health...
    </div>

    <Alert v-else-if="health.kind === 'failure'" variant="destructive">
      <AlertTitle>Health status is unavailable</AlertTitle>
      <AlertDescription>{{ health.error.message }}</AlertDescription>
      <Button class="mt-3" size="sm" variant="outline" :disabled="retrying" @click="retry">
        <Spinner v-if="retrying" aria-hidden="true" />
        {{ retrying ? 'Refreshing...' : 'Refresh health' }}
      </Button>
    </Alert>

    <Card v-else-if="report">
      <CardHeader class="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="space-y-1">
          <CardTitle>Health ledger</CardTitle>
          <CardDescription>{{ health.description }}</CardDescription>
        </div>
        <span
          class="w-fit rounded-md border px-2.5 py-1 text-xs font-medium capitalize"
          :class="statusTone(report.status)"
        >
          {{ health.title }}
        </span>
      </CardHeader>
      <CardContent class="space-y-5">
        <div role="list" class="divide-y rounded-md border">
          <div role="listitem" class="relative flex gap-4 p-4">
            <span
              aria-hidden="true"
              class="mt-1.5 size-2.5 shrink-0 rounded-full"
              :class="statusDot(report.status)"
            />
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p class="font-medium">Overall system</p>
                <p class="text-muted-foreground text-sm capitalize">
                  {{ statusLabel(report.status) }}
                </p>
              </div>
              <p class="text-muted-foreground text-sm">Public readiness signal</p>
            </div>
          </div>
          <div role="listitem" class="relative flex gap-4 p-4">
            <span
              aria-hidden="true"
              class="bg-foreground/50 mt-1.5 size-2.5 shrink-0 rounded-full"
            />
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p class="font-medium">Control store</p>
                <p class="text-muted-foreground text-sm capitalize">
                  {{ statusLabel(report.controlStore) }}
                </p>
              </div>
              <p class="text-muted-foreground text-sm">Primary installation data</p>
            </div>
          </div>
          <div role="listitem" class="relative flex gap-4 p-4">
            <span
              aria-hidden="true"
              class="bg-foreground/50 mt-1.5 size-2.5 shrink-0 rounded-full"
            />
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p class="font-medium">Analytics store</p>
                <p class="text-muted-foreground text-sm capitalize">
                  {{ statusLabel(report.analyticsStore) }}
                </p>
              </div>
              <p class="text-muted-foreground text-sm">Event reporting data</p>
            </div>
          </div>
        </div>

        <div class="grid gap-3 text-sm sm:grid-cols-2">
          <div class="rounded-md bg-muted/50 p-3">
            <p class="text-muted-foreground text-xs uppercase">Version</p>
            <p class="mt-1 font-medium">{{ report.version }}</p>
          </div>
          <div class="rounded-md bg-muted/50 p-3">
            <p class="text-muted-foreground text-xs uppercase">Last checked</p>
            <time class="mt-1 block font-medium" :datetime="report.checkedAt">{{
              report.checkedAt
            }}</time>
          </div>
        </div>

        <p v-if="report.cleanupPending" class="text-sm text-amber-700 dark:text-amber-300">
          Cleanup work is pending. Check again after the underlying work completes.
        </p>
        <Alert v-if="health.kind === 'stale-report'" variant="destructive">
          <AlertTitle>Showing the last known health report</AlertTitle>
          <AlertDescription>{{ health.error.message }}</AlertDescription>
        </Alert>
        <Button
          v-if="health.action === 'refresh'"
          size="sm"
          variant="outline"
          :disabled="retrying"
          @click="retry"
        >
          <Spinner v-if="retrying" aria-hidden="true" />
          {{ retrying ? 'Refreshing...' : 'Refresh health' }}
        </Button>
      </CardContent>
    </Card>
  </section>
</template>
