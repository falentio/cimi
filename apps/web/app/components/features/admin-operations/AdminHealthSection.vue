<script setup lang="ts">
import { computed } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import type { AdminHealthProjection } from './admin-operations.utils'

const props = defineProps<{
  health: AdminHealthProjection
  refreshing: boolean
}>()

const emit = defineEmits<{
  refresh: []
}>()

const report = computed(() =>
  props.health.kind === 'report' || props.health.kind === 'stale-report'
    ? props.health.report
    : undefined,
)
const matrix = computed(() => {
  if (props.health.kind === 'loading' || props.health.kind === 'failure') {
    return props.health.matrix
  }
  return props.health.report.matrix
})
</script>

<template>
  <section aria-labelledby="admin-health-title" class="space-y-3">
    <div>
      <h2 id="admin-health-title" class="text-lg font-semibold tracking-tight">System health</h2>
      <p class="text-muted-foreground text-sm">
        The report keeps control and analytics readiness separate.
      </p>
    </div>

    <div
      v-if="health.kind === 'loading'"
      class="flex items-center gap-2 text-sm"
      role="status"
      aria-live="polite"
    >
      <Spinner aria-hidden="true" />
      Checking system health...
    </div>

    <Alert v-else-if="health.kind === 'failure'" variant="destructive">
      <AlertTitle>Health status is unavailable</AlertTitle>
      <AlertDescription>{{ health.message }}</AlertDescription>
      <Button
        class="mt-3"
        size="sm"
        variant="outline"
        :disabled="refreshing"
        @click="emit('refresh')"
      >
        <Spinner v-if="refreshing" aria-hidden="true" />
        {{ refreshing ? 'Refreshing...' : 'Refresh health' }}
      </Button>
    </Alert>

    <Card>
      <CardHeader class="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div v-if="report" class="min-w-0 space-y-1">
          <CardTitle>Current health: {{ report.title }}</CardTitle>
          <CardDescription>{{ report.description }}</CardDescription>
        </div>
        <div v-else class="min-w-0 space-y-1">
          <CardTitle>Documented health states</CardTitle>
          <CardDescription>
            The current report will identify one state when health data is available.
          </CardDescription>
        </div>
        <span
          v-if="report"
          class="w-fit shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium"
        >
          {{ report.title }}
        </span>
      </CardHeader>
      <CardContent class="space-y-5">
        <div aria-label="Documented health states" role="list" class="grid gap-2 sm:grid-cols-5">
          <div
            v-for="state in matrix"
            :key="state.status"
            role="listitem"
            class="rounded-md border p-3 text-sm"
            :class="state.current ? 'border-primary bg-primary/5' : 'bg-muted/30'"
            :aria-current="state.current ? 'true' : undefined"
          >
            <p class="font-medium">{{ state.label }}</p>
            <p
              class="mt-1 text-xs"
              :class="state.current ? 'text-foreground' : 'text-muted-foreground'"
            >
              {{ state.current ? 'Current state' : 'Documented state' }}
            </p>
          </div>
        </div>

        <div v-if="report" class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-md border p-3">
            <p class="text-muted-foreground text-xs font-medium uppercase">Control store</p>
            <p class="mt-1 font-medium">SQLite · {{ report.controlStoreLabel }}</p>
          </div>
          <div class="rounded-md border p-3">
            <p class="text-muted-foreground text-xs font-medium uppercase">Analytics store</p>
            <p class="mt-1 font-medium">DuckDB · {{ report.analyticsStoreLabel }}</p>
          </div>
        </div>

        <dl v-if="report" class="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt class="text-muted-foreground">Version</dt>
            <dd class="mt-1 break-words font-medium">{{ report.version }}</dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Last checked</dt>
            <dd class="mt-1 break-words font-medium">
              <time :datetime="report.checkedAt">{{ report.checkedAt }}</time>
            </dd>
          </div>
        </dl>

        <p v-if="report?.cleanupPending" class="text-sm">
          Cleanup work is pending. Check again after the underlying work completes.
        </p>
        <Alert v-if="health.kind === 'stale-report'" variant="destructive">
          <AlertTitle>Showing the last known health report</AlertTitle>
          <AlertDescription>{{ health.message }}</AlertDescription>
        </Alert>
        <Button size="sm" variant="outline" :disabled="refreshing" @click="emit('refresh')">
          <Spinner v-if="refreshing" aria-hidden="true" />
          {{ refreshing ? 'Refreshing...' : 'Refresh health' }}
        </Button>
      </CardContent>
    </Card>
  </section>
</template>
