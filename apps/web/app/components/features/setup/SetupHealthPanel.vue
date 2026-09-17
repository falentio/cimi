<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import type { HealthView } from './setup.types'

const props = defineProps<{
  health: HealthView
  refresh: () => Promise<void>
}>()

const retrying = shallowRef(false)
const report = computed(() => {
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
</script>

<template>
  <section aria-labelledby="setup-health-title" class="space-y-3">
    <div>
      <h2 id="setup-health-title" class="text-lg font-semibold tracking-tight">System health</h2>
      <p class="text-muted-foreground text-sm">Public readiness for control and analytics data.</p>
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
      <CardHeader>
        <CardTitle class="flex flex-wrap items-center justify-between gap-2">
          <span>{{ health.title }}</span>
          <span class="text-muted-foreground text-sm font-normal">{{
            statusLabel(report.status)
          }}</span>
        </CardTitle>
        <CardDescription>{{ health.description }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <dl class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-md border p-3">
            <dt class="text-muted-foreground text-xs font-medium uppercase">Control store</dt>
            <dd class="mt-1 text-sm font-medium">{{ statusLabel(report.controlStore) }}</dd>
          </div>
          <div class="rounded-md border p-3">
            <dt class="text-muted-foreground text-xs font-medium uppercase">Analytics store</dt>
            <dd class="mt-1 text-sm font-medium">{{ statusLabel(report.analyticsStore) }}</dd>
          </div>
        </dl>
        <p v-if="report.cleanupPending" class="text-muted-foreground text-sm">
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
