<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { getOperationFailureMessage } from './setup.utils'
import SetupUpgradePanel from './SetupUpgradePanel.vue'
import type { InitializedInstallation, LifecycleView, UpgradeView } from './setup.types'

const props = defineProps<{
  installation: InitializedInstallation
  lifecycle: LifecycleView
  upgrade: UpgradeView
  refresh: () => Promise<void>
  beginUpgrade: () => void
  cancelUpgrade: () => void
  submitUpgrade: (confirmation: string) => Promise<void>
}>()

const retrying = shallowRef(false)
const progressValue = computed(() => {
  if (props.lifecycle.kind !== 'running' || props.lifecycle.operation.progress === null) {
    return null
  }
  return Math.round(props.lifecycle.operation.progress * 100)
})

async function refreshStatus(): Promise<void> {
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
  <section aria-labelledby="setup-lifecycle-title" class="space-y-3">
    <div>
      <h2 id="setup-lifecycle-title" class="text-lg font-semibold tracking-tight">
        Installation lifecycle
      </h2>
      <p class="text-muted-foreground text-sm">
        Current installation state is {{ statusLabel(installation.status) }}.
      </p>
    </div>

    <Alert v-if="installation.cleanupPending">
      <AlertTitle>Cleanup work is pending</AlertTitle>
      <AlertDescription
        >Wait for cleanup to complete before starting another lifecycle action.</AlertDescription
      >
    </Alert>

    <Card v-if="lifecycle.kind === 'running'">
      <CardHeader>
        <CardTitle>Lifecycle operation in progress</CardTitle>
        <CardDescription>
          {{ statusLabel(lifecycle.operation.kind) }} is running.
          {{
            lifecycle.polling.kind === 'active'
              ? 'This page will check for a safe result.'
              : 'Refresh status to check for a safe result.'
          }}
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <dl class="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt class="text-muted-foreground">Phase</dt>
            <dd class="font-medium">{{ statusLabel(lifecycle.operation.phase) }}</dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Checkpoint</dt>
            <dd class="font-medium">{{ statusLabel(lifecycle.operation.checkpoint) }}</dd>
          </div>
          <div v-if="lifecycle.polling.kind === 'active'">
            <dt class="text-muted-foreground">Poll attempt</dt>
            <dd class="font-medium">
              {{ lifecycle.polling.attempt }} of {{ lifecycle.polling.maxAttempts }}
            </dd>
          </div>
        </dl>
        <div v-if="progressValue !== null" class="space-y-2">
          <div class="text-muted-foreground flex justify-between text-xs">
            <span>Safe progress</span>
            <span>{{ progressValue }}%</span>
          </div>
          <Progress :model-value="progressValue" aria-label="Lifecycle progress" />
        </div>
        <Button
          v-if="lifecycle.polling.kind !== 'active'"
          size="sm"
          variant="outline"
          :disabled="retrying"
          @click="refreshStatus"
        >
          <Spinner v-if="retrying" aria-hidden="true" />
          {{ retrying ? 'Refreshing...' : 'Refresh status' }}
        </Button>
      </CardContent>
    </Card>

    <Alert v-else-if="lifecycle.kind === 'failed'" variant="destructive">
      <AlertTitle>Lifecycle operation stopped</AlertTitle>
      <AlertDescription>{{ getOperationFailureMessage(lifecycle.operation) }}</AlertDescription>
      <Button class="mt-3" size="sm" variant="outline" :disabled="retrying" @click="refreshStatus">
        <Spinner v-if="retrying" aria-hidden="true" />
        {{ retrying ? 'Refreshing...' : 'Refresh status' }}
      </Button>
    </Alert>

    <SetupUpgradePanel
      :upgrade="upgrade"
      :refresh="refreshStatus"
      :begin-upgrade="beginUpgrade"
      :cancel-upgrade="cancelUpgrade"
      :submit-upgrade="submitUpgrade"
    />
  </section>
</template>
