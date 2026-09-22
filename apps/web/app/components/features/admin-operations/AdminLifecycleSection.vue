<script setup lang="ts">
import { computed } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import type { AdminInstallationProjection } from './admin-operations.utils'

const props = defineProps<{
  installation: AdminInstallationProjection
  refreshing: boolean
}>()

const emit = defineEmits<{
  refresh: []
}>()

const report = computed(() =>
  props.installation.kind === 'report' || props.installation.kind === 'stale-report'
    ? props.installation
    : undefined,
)
const operation = computed(() =>
  report.value?.lifecycle.kind === 'idle' ? undefined : report.value?.lifecycle.operation,
)
const progressPercent = computed(() => {
  if (operation.value?.progress === null || operation.value?.progress === undefined) return null
  return Math.round(operation.value.progress * 100)
})
</script>

<template>
  <section aria-labelledby="admin-lifecycle-title">
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 id="admin-lifecycle-title" class="text-lg font-semibold tracking-tight">
            Installation and lifecycle
          </h2>
        </CardTitle>
        <CardDescription>
          Review the installation state and any active lifecycle operation.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-3">
        <div
          v-if="installation.kind === 'loading'"
          class="flex items-center gap-2 text-sm"
          role="status"
          aria-live="polite"
        >
          <Spinner aria-hidden="true" />
          Loading installation status...
        </div>

        <Alert v-else-if="installation.kind === 'auth-required'" variant="destructive">
          <AlertTitle>Administrator sign-in required</AlertTitle>
          <AlertDescription>{{ installation.message }}</AlertDescription>
          <Button as-child class="mt-3" size="sm" variant="outline">
            <NuxtLink to="/login?redirect=/admin">Sign in</NuxtLink>
          </Button>
        </Alert>

        <Alert v-else-if="installation.kind === 'admin-required'" variant="destructive">
          <AlertTitle>Administrator access required</AlertTitle>
          <AlertDescription>{{ installation.message }}</AlertDescription>
        </Alert>

        <template v-else-if="installation.kind === 'not-initialized'">
          <p class="text-sm">
            Use the setup surface to initialize the installation without overwriting existing data.
          </p>
          <div>
            <Button as-child variant="outline">
              <NuxtLink to="/setup">Open installation setup</NuxtLink>
            </Button>
          </div>
        </template>

        <Alert v-else-if="installation.kind === 'failure'" variant="destructive">
          <AlertTitle>Installation status is unavailable</AlertTitle>
          <AlertDescription>{{ installation.message }}</AlertDescription>
          <Button
            class="mt-3"
            size="sm"
            variant="outline"
            :disabled="refreshing"
            @click="emit('refresh')"
          >
            <Spinner v-if="refreshing" aria-hidden="true" />
            {{ refreshing ? 'Refreshing...' : 'Refresh installation status' }}
          </Button>
        </Alert>

        <template v-else>
          <Alert v-if="installation.kind === 'stale-report'" variant="destructive">
            <AlertTitle>Showing the last known installation status</AlertTitle>
            <AlertDescription>{{ installation.message }}</AlertDescription>
            <Button
              class="mt-3"
              size="sm"
              variant="outline"
              :disabled="refreshing"
              @click="emit('refresh')"
            >
              <Spinner v-if="refreshing" aria-hidden="true" />
              {{ refreshing ? 'Refreshing...' : 'Refresh installation status' }}
            </Button>
          </Alert>

          <div
            class="rounded-lg border text-sm"
            :role="installation.lifecycle.kind === 'active' ? 'status' : undefined"
            :aria-live="installation.lifecycle.kind === 'active' ? 'polite' : undefined"
          >
            <dl class="divide-y">
              <div class="grid grid-cols-[10rem_1fr] items-center gap-3 px-4 py-2.5">
                <dt class="text-muted-foreground text-xs">Status</dt>
                <dd>
                  <Badge variant="outline">{{ installation.statusLabel }}</Badge>
                </dd>
              </div>
              <div class="grid grid-cols-[10rem_1fr] items-center gap-3 px-4 py-2.5">
                <dt class="text-muted-foreground text-xs">Data directory</dt>
                <dd class="font-medium">
                  {{ installation.dataDirectoryReady ? 'Ready' : 'Not ready' }}
                </dd>
              </div>
              <div class="grid grid-cols-[10rem_1fr] items-center gap-3 px-4 py-2.5">
                <dt class="text-muted-foreground text-xs">Last updated</dt>
                <dd class="font-medium">
                  <time :datetime="installation.updatedAt">{{ installation.updatedAt }}</time>
                </dd>
              </div>
              <div class="grid grid-cols-[10rem_1fr] items-center gap-3 px-4 py-2.5">
                <dt class="text-muted-foreground text-xs">Active operation</dt>
                <dd v-if="installation.lifecycle.kind === 'idle'" class="font-medium">
                  None reported.
                </dd>
                <dd v-else class="flex items-center gap-2 font-medium">
                  {{ installation.lifecycle.operation.operationKindLabel }}
                  <Badge
                    :variant="
                      installation.lifecycle.kind === 'active' ? 'secondary' : 'destructive'
                    "
                  >
                    {{ installation.lifecycle.kind === 'active' ? 'Running' : 'Failed' }}
                  </Badge>
                </dd>
              </div>

              <template v-if="operation">
                <div class="grid grid-cols-[10rem_1fr] items-center gap-3 px-4 py-2.5">
                  <dt class="text-muted-foreground text-xs">Phase</dt>
                  <dd class="font-medium">{{ operation.phaseLabel }}</dd>
                </div>
                <div class="grid grid-cols-[10rem_1fr] items-center gap-3 px-4 py-2.5">
                  <dt class="text-muted-foreground text-xs">Checkpoint</dt>
                  <dd class="font-medium">{{ operation.checkpointLabel }}</dd>
                </div>
                <div class="grid grid-cols-[10rem_1fr] items-center gap-3 px-4 py-2.5">
                  <dt class="text-muted-foreground text-xs">Last safe sequence</dt>
                  <dd class="font-medium">{{ operation.lastSafeSequence ?? 'Not supplied' }}</dd>
                </div>
                <div class="grid grid-cols-[10rem_1fr] items-center gap-3 px-4 py-2.5">
                  <dt class="text-muted-foreground text-xs">Operation ID</dt>
                  <dd class="break-all font-mono text-xs font-medium">
                    {{ operation.operationId }}
                  </dd>
                </div>
                <div v-if="progressPercent !== null" class="px-4 py-2.5">
                  <div class="mb-2 flex justify-between gap-4 text-xs">
                    <span class="text-muted-foreground">Progress</span>
                    <span>{{ progressPercent }}%</span>
                  </div>
                  <Progress :model-value="progressPercent" aria-label="Operation progress" />
                </div>
              </template>
            </dl>

            <p
              v-if="installation.lifecycle.kind === 'failed'"
              class="text-destructive border-t px-4 py-2.5"
            >
              {{ installation.lifecycle.operation.failureMessage }}
            </p>

            <div
              v-if="
                installation.lifecycle.kind === 'failed' ||
                (installation.lifecycle.kind === 'active' &&
                  installation.lifecycle.refreshMode === 'manual')
              "
              class="border-t px-4 py-3"
            >
              <Button size="sm" variant="outline" :disabled="refreshing" @click="emit('refresh')">
                <Spinner v-if="refreshing" aria-hidden="true" />
                {{ refreshing ? 'Refreshing...' : 'Refresh operation status' }}
              </Button>
            </div>
          </div>
        </template>
      </CardContent>
    </Card>
  </section>
</template>
