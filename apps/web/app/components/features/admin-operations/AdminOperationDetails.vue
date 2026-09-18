<script setup lang="ts">
import { computed } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import type { AdminLifecycleProjection } from './admin-operations.utils'

const props = defineProps<{
  lifecycle: AdminLifecycleProjection
  refreshing: boolean
}>()

const emit = defineEmits<{
  refresh: []
}>()

const operation = computed(() =>
  props.lifecycle.kind === 'idle' ? undefined : props.lifecycle.operation,
)
const progressPercent = computed(() => {
  if (operation.value?.progress === null || operation.value?.progress === undefined) return null
  return Math.round(operation.value.progress * 100)
})
</script>

<template>
  <div class="space-y-4">
    <div v-if="lifecycle.kind === 'idle'" class="rounded-md border p-4 text-sm">
      <p class="font-medium">Active operation</p>
      <p class="text-muted-foreground mt-1">None reported.</p>
    </div>

    <template v-else>
      <Alert v-if="lifecycle.kind === 'failed'" variant="destructive">
        <AlertTitle>Lifecycle operation stopped</AlertTitle>
        <AlertDescription>{{ lifecycle.operation.failureMessage }}</AlertDescription>
      </Alert>

      <div
        class="rounded-md border p-4"
        :role="lifecycle.kind === 'active' ? 'status' : undefined"
        :aria-live="lifecycle.kind === 'active' ? 'polite' : undefined"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p class="font-medium">
              {{ lifecycle.kind === 'active' ? 'Active operation' : 'Last operation' }}
            </p>
            <p class="text-muted-foreground mt-1 text-sm">
              {{ lifecycle.operation.operationKindLabel }}
              <span v-if="lifecycle.kind === 'active'">
                ·
                {{
                  lifecycle.refreshMode === 'automatic'
                    ? 'Status checks are active.'
                    : 'Refresh for the latest status.'
                }}
              </span>
            </p>
          </div>
          <span class="rounded-md border px-2 py-1 text-xs font-medium">
            {{ lifecycle.operation.status === 'active' ? 'Running' : 'Failed' }}
          </span>
        </div>

        <dl class="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div class="min-w-0">
            <dt class="text-muted-foreground">Operation ID</dt>
            <dd class="mt-1 break-all font-medium">{{ lifecycle.operation.operationId }}</dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Phase</dt>
            <dd class="mt-1 font-medium">{{ lifecycle.operation.phaseLabel }}</dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Checkpoint</dt>
            <dd class="mt-1 font-medium">{{ lifecycle.operation.checkpointLabel }}</dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Last safe sequence</dt>
            <dd class="mt-1 font-medium">
              {{ lifecycle.operation.lastSafeSequence ?? 'Not supplied' }}
            </dd>
          </div>
        </dl>

        <div v-if="progressPercent !== null" class="mt-4 space-y-2">
          <div class="flex justify-between gap-4 text-xs">
            <span>Operation progress</span>
            <span>{{ progressPercent }}%</span>
          </div>
          <Progress :model-value="progressPercent" aria-label="Operation progress" />
        </div>

        <Button
          v-if="lifecycle.kind === 'failed' || lifecycle.refreshMode === 'manual'"
          class="mt-4"
          size="sm"
          variant="outline"
          :disabled="refreshing"
          @click="emit('refresh')"
        >
          <Spinner v-if="refreshing" aria-hidden="true" />
          {{ refreshing ? 'Refreshing...' : 'Refresh operation status' }}
        </Button>
      </div>
    </template>
  </div>
</template>
