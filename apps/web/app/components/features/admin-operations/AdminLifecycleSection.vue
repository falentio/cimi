<script setup lang="ts">
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import AdminOperationDetails from './AdminOperationDetails.vue'
import type { AdminInstallationProjection } from './admin-operations.utils'

defineProps<{
  installation: AdminInstallationProjection
  refreshing: boolean
}>()

const emit = defineEmits<{
  refresh: []
}>()
</script>

<template>
  <section aria-labelledby="admin-lifecycle-title" class="space-y-3">
    <div>
      <h2 id="admin-lifecycle-title" class="text-lg font-semibold tracking-tight">
        Installation and lifecycle
      </h2>
      <p class="text-muted-foreground text-sm">
        Review the installation state and any active lifecycle operation.
      </p>
    </div>

    <Card v-if="installation.kind === 'loading'">
      <CardContent class="flex items-center gap-2 py-6 text-sm" role="status" aria-live="polite">
        <Spinner aria-hidden="true" />
        Loading installation status...
      </CardContent>
    </Card>

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

    <Card v-else-if="installation.kind === 'not-initialized'">
      <CardHeader>
        <CardTitle>Installation is uninitialized</CardTitle>
        <CardDescription>
          Use the setup surface to initialize the installation without overwriting existing data.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button as-child variant="outline">
          <NuxtLink to="/setup">Open installation setup</NuxtLink>
        </Button>
      </CardContent>
    </Card>

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

      <Card>
        <CardHeader>
          <CardTitle>Installation status: {{ installation.statusLabel }}</CardTitle>
          <CardDescription>
            The data directory is {{ installation.dataDirectoryReady ? 'ready' : 'not ready' }}.
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-5">
          <dl class="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt class="text-muted-foreground">Lifecycle status</dt>
              <dd class="mt-1 font-medium">{{ installation.statusLabel }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Last updated</dt>
              <dd class="mt-1 break-words font-medium">
                <time :datetime="installation.updatedAt">{{ installation.updatedAt }}</time>
              </dd>
            </div>
          </dl>
          <AdminOperationDetails
            :lifecycle="installation.lifecycle"
            :refreshing="refreshing"
            @refresh="emit('refresh')"
          />
        </CardContent>
      </Card>
    </template>
  </section>
</template>
