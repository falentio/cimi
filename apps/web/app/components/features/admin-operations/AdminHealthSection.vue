<script setup lang="ts">
import { computed } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
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
const notice = computed(() => {
  if (props.health.kind === 'failure') {
    return { title: 'Health status is unavailable', message: props.health.message }
  }
  if (props.health.kind === 'stale-report') {
    return { title: 'Showing the last known health report', message: props.health.message }
  }
  return undefined
})
</script>

<template>
  <section aria-labelledby="admin-health-title">
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 id="admin-health-title" class="text-lg font-semibold tracking-tight">
            System health
          </h2>
        </CardTitle>
        <CardDescription>Control and analytics readiness, separately.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div
          v-if="health.kind === 'loading'"
          class="flex items-center gap-2 text-sm"
          role="status"
          aria-live="polite"
        >
          <Spinner aria-hidden="true" />
          Checking system health...
        </div>

        <template v-else>
          <div v-if="report" class="space-y-1">
            <p class="text-sm font-medium">{{ report.title }}</p>
            <p class="text-muted-foreground text-sm">{{ report.description }}</p>
          </div>
          <p v-else class="text-muted-foreground text-sm">
            The current report will identify one state when health data is available.
          </p>

          <Alert v-if="notice" variant="destructive">
            <AlertTitle>{{ notice.title }}</AlertTitle>
            <AlertDescription>{{ notice.message }}</AlertDescription>
          </Alert>

          <div v-if="report" class="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <p class="text-muted-foreground text-xs font-medium uppercase">
              Control
              <span class="text-foreground ml-1.5 font-medium normal-case">{{
                report.controlStoreLabel
              }}</span>
            </p>
            <p class="text-muted-foreground text-xs font-medium uppercase">
              Analytics
              <span class="text-foreground ml-1.5 font-medium normal-case">{{
                report.analyticsStoreLabel
              }}</span>
            </p>
          </div>

          <Separator v-if="report" />

          <p
            id="admin-health-states-label"
            class="text-muted-foreground text-xs font-medium uppercase"
          >
            Documented states
          </p>
          <ul aria-labelledby="admin-health-states-label" class="flex flex-wrap gap-1.5">
            <li
              v-for="state in matrix"
              :key="state.status"
              :aria-current="state.current ? 'true' : undefined"
            >
              <Badge :variant="state.current ? 'default' : 'outline'">
                <template v-if="state.current">Current · </template>
                {{ state.label }}
              </Badge>
            </li>
          </ul>

          <p v-if="report?.cleanupPending" class="text-sm">
            Cleanup work is pending. Check again after the underlying work completes.
          </p>

          <Separator />

          <div class="flex flex-wrap items-center justify-between gap-3">
            <dl v-if="report" class="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-xs">
              <div class="flex gap-1.5">
                <dt>Version</dt>
                <dd class="text-foreground font-medium">{{ report.version }}</dd>
              </div>
              <div class="flex gap-1.5">
                <dt>Last checked</dt>
                <dd class="text-foreground font-medium">
                  <time :datetime="report.checkedAt">{{ report.checkedAt }}</time>
                </dd>
              </div>
            </dl>
            <Button
              class="ml-auto"
              size="sm"
              variant="outline"
              :disabled="refreshing"
              @click="emit('refresh')"
            >
              <Spinner v-if="refreshing" aria-hidden="true" />
              {{ refreshing ? 'Refreshing...' : 'Refresh health' }}
            </Button>
          </div>
        </template>
      </CardContent>
    </Card>
  </section>
</template>
