<script setup lang="ts">
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import type {
  ActiveOperationView,
  Backup,
  OperationSectionView,
  SafetyArtifactView,
} from './backup-restore.types'
import { formatBackupDate } from './backup-restore.utils'

defineProps<{ section: Exclude<OperationSectionView, { kind: 'none' }> }>()

const emit = defineEmits<{
  refresh: []
  resumePolling: []
}>()

const ACTIVE_STAGE_LABELS: Record<ActiveOperationView['stage'], string> = {
  'capturing-sqlite': 'Capturing SQLite',
  'preparing-safety-artifact': 'Preparing safety artifact',
  'restoring-sqlite': 'Restoring SQLite',
  'rebuilding-duckdb': 'Rebuilding DuckDB',
  'structurally-ready': 'Structurally ready',
  'cleanup-pending': 'Cleanup pending',
}
const CONTROL_STORE_LABELS: Record<Backup['readiness']['controlStore'], string> = {
  not_ready: 'Not ready',
  ready: 'Ready',
}
const ANALYTICS_STORE_LABELS: Record<Backup['readiness']['analyticsStore'], string> = {
  not_ready: 'Not ready',
  rebuilding: 'Rebuilding',
  ready: 'Ready',
}
const STRUCTURAL_READINESS_LABELS: Record<Backup['readiness']['structural'], string> = {
  not_ready: 'Not ready',
  ready: 'Ready',
}

function safetyLabel(safety: SafetyArtifactView): string {
  switch (safety.kind) {
    case 'not-created':
      return 'not created'
    case 'creating':
      return 'being prepared'
    case 'ready':
      return `ready through sequence ${safety.lastSafeSequence}`
    case 'failed':
      return safety.error.message
    default: {
      const _exhaustive: never = safety
      return _exhaustive
    }
  }
}
</script>

<template>
  <section aria-labelledby="backup-operation-title" class="space-y-3">
    <div>
      <h2 id="backup-operation-title" class="text-lg font-semibold tracking-tight">
        Current operation
      </h2>
      <p class="text-muted-foreground text-sm">Progress and readiness come from the server.</p>
    </div>

    <Card v-if="section.kind === 'active'">
      <CardHeader>
        <CardTitle>{{
          section.operation === 'backup' ? 'Backup in progress' : 'Restore in progress'
        }}</CardTitle>
        <CardDescription>{{ ACTIVE_STAGE_LABELS[section.stage] }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <div class="flex justify-between gap-3 text-sm">
            <span>Progress</span>
            <span>{{ section.progressPercent }}%</span>
          </div>
          <Progress
            :model-value="section.progressPercent"
            :aria-label="`${section.operation === 'backup' ? 'Backup' : 'Restore'} progress`"
          />
        </div>
        <dl class="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt class="text-muted-foreground">Checkpoint</dt>
            <dd class="font-medium">{{ section.checkpointLabel }}</dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Control store</dt>
            <dd class="font-medium">{{ CONTROL_STORE_LABELS[section.readiness.controlStore] }}</dd>
          </div>
          <div>
            <dt class="text-muted-foreground">DuckDB</dt>
            <dd class="font-medium">
              {{ ANALYTICS_STORE_LABELS[section.readiness.analyticsStore] }}
            </dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Structural readiness</dt>
            <dd class="font-medium">
              {{ STRUCTURAL_READINESS_LABELS[section.readiness.structural] }}
            </dd>
          </div>
        </dl>
        <dl class="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt class="text-muted-foreground">Last safe sequence</dt>
            <dd class="font-medium">{{ section.lastSafeSequence ?? 'Not available' }}</dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Operation ID</dt>
            <dd class="font-mono text-xs break-all">{{ section.operationId }}</dd>
          </div>
        </dl>
        <p v-if="section.operation === 'restore'" class="text-sm">
          Safety artifact
          <span class="font-medium">{{ safetyLabel(section.safetyArtifact) }}</span>
        </p>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <Spinner v-if="section.polling.kind === 'automatic'" aria-hidden="true" />
          <span v-if="section.polling.kind === 'automatic'">
            Checking status, attempt {{ section.polling.attempt }} of
            {{ section.polling.maxAttempts }}.
          </span>
          <span v-else>Automatic status checks are paused.</span>
          <Button
            v-if="section.polling.kind === 'manual'"
            type="button"
            size="sm"
            variant="outline"
            @click="emit('resumePolling')"
          >
            Resume checks
          </Button>
          <Button type="button" size="sm" variant="ghost" @click="emit('refresh')">
            Refresh status
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card v-else-if="section.kind === 'available'">
      <CardHeader>
        <CardTitle>{{
          section.operation === 'backup' ? 'Backup available' : 'Restore available'
        }}</CardTitle>
      </CardHeader>
      <CardContent class="text-sm">
        <template v-if="section.completedAt">
          The server marked this operation available at
          <time :datetime="section.completedAt">{{ formatBackupDate(section.completedAt) }}</time
          >.
        </template>
        <template v-else>The server marked this operation available.</template>
        <span v-if="section.cleanupPending"> Cleanup remains visible below.</span>
      </CardContent>
    </Card>

    <Alert v-else variant="destructive">
      <AlertTitle>Operation stopped</AlertTitle>
      <AlertDescription>{{ section.error.message }}</AlertDescription>
      <Button class="mt-3" type="button" size="sm" variant="outline" @click="emit('refresh')">
        Refresh status
      </Button>
    </Alert>
  </section>
</template>
