<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import SetupHealthPanel from './SetupHealthPanel.vue'
import SetupLifecyclePanel from './SetupLifecyclePanel.vue'
import { useSetup } from './useSetup'

const setup = useSetup()
const view = setup.view
const retrying = shallowRef(false)
const initializing = shallowRef(false)
const operationalView = computed(() => (view.value.kind === 'operational' ? view.value : undefined))

async function initialize(): Promise<void> {
  initializing.value = true
  try {
    await setup.initialize()
  } catch {
    return
  } finally {
    initializing.value = false
  }
}

async function refresh(): Promise<void> {
  retrying.value = true
  try {
    await setup.refresh()
  } catch {
    return
  } finally {
    retrying.value = false
  }
}
</script>

<template>
  <section aria-labelledby="setup-title" class="flex min-w-0 w-full flex-col gap-6">
    <header class="space-y-2">
      <p class="text-muted-foreground text-sm font-medium tracking-wide uppercase">Cimi setup</p>
      <h1 id="setup-title" class="text-3xl font-semibold tracking-tight">
        Initialize and maintain this installation
      </h1>
      <p class="text-muted-foreground max-w-2xl text-sm sm:text-base">
        Use this page to initialize the installation and check control and analytics readiness.
      </p>
    </header>

    <Card v-if="view.kind === 'loading'">
      <CardContent class="flex items-center gap-2 py-6 text-sm" role="status" aria-live="polite">
        <Spinner aria-hidden="true" />
        Loading installation status...
      </CardContent>
    </Card>

    <Alert v-else-if="view.kind === 'auth-required'" variant="destructive">
      <AlertTitle>Administrator sign-in required</AlertTitle>
      <AlertDescription>Sign in as an installation administrator to continue.</AlertDescription>
      <Button as-child class="mt-3" size="sm" variant="outline">
        <NuxtLink to="/login?redirect=/setup">Sign in</NuxtLink>
      </Button>
    </Alert>

    <Empty v-else-if="view.kind === 'admin-required'" class="min-h-64 border border-dashed">
      <EmptyHeader>
        <EmptyTitle><h2>Administrator access required</h2></EmptyTitle>
        <EmptyDescription>
          Installation administrator access is required to manage this installation.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button as-child variant="outline">
          <NuxtLink to="/">Return to home</NuxtLink>
        </Button>
      </EmptyContent>
    </Empty>

    <Card v-else-if="view.kind === 'not-initialized'">
      <CardHeader>
        <CardTitle>Initialize installation</CardTitle>
        <CardDescription>
          Create the installation metadata with the contract default retention policy. Existing data
          is not overwritten.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <Alert v-if="view.initialization.kind === 'success'">
          <AlertTitle>
            {{
              view.initialization.outcome.kind === 'created'
                ? 'Installation initialized.'
                : 'Existing installation reused.'
            }}
          </AlertTitle>
          <AlertDescription>
            {{
              view.initialization.outcome.kind === 'created'
                ? 'The installation is ready to continue.'
                : 'No data was overwritten.'
            }}
          </AlertDescription>
        </Alert>
        <Alert v-else-if="view.initialization.kind === 'failure'" variant="destructive">
          <AlertTitle>Initialization could not be completed</AlertTitle>
          <AlertDescription>{{ view.initialization.error.message }}</AlertDescription>
        </Alert>
        <form
          v-if="view.initialization.kind === 'available' || view.initialization.kind === 'failure'"
          @submit.prevent="initialize"
        >
          <Button type="submit" :disabled="initializing">
            <Spinner v-if="initializing" aria-hidden="true" />
            {{
              view.initialization.kind === 'failure'
                ? 'Try initialization again'
                : 'Initialize installation'
            }}
          </Button>
        </form>
        <div
          v-else-if="view.initialization.kind === 'submitting'"
          class="flex items-center gap-2 text-sm"
          role="status"
        >
          <Spinner aria-hidden="true" />
          Initializing installation...
        </div>
      </CardContent>
    </Card>

    <Alert v-else-if="view.kind === 'installation-failure'" variant="destructive">
      <AlertTitle>Installation status could not be loaded</AlertTitle>
      <AlertDescription>{{ view.installation.error.message }}</AlertDescription>
      <Button class="mt-3" size="sm" variant="outline" :disabled="retrying" @click="refresh">
        <Spinner v-if="retrying" aria-hidden="true" />
        {{ retrying ? 'Refreshing...' : 'Refresh status' }}
      </Button>
    </Alert>

    <Alert v-if="operationalView?.notice">
      <AlertTitle>{{ operationalView.notice.message }}</AlertTitle>
      <AlertDescription>Installation lifecycle state has been refreshed.</AlertDescription>
    </Alert>

    <Alert v-if="operationalView?.installation.kind === 'stale-failure'" variant="destructive">
      <AlertTitle>Showing the last known installation status</AlertTitle>
      <AlertDescription>{{ operationalView.installation.error.message }}</AlertDescription>
      <Button class="mt-3" size="sm" variant="outline" :disabled="retrying" @click="refresh">
        <Spinner v-if="retrying" aria-hidden="true" />
        {{ retrying ? 'Refreshing...' : 'Refresh status' }}
      </Button>
    </Alert>

    <SetupLifecyclePanel
      v-if="operationalView"
      :installation="operationalView.installation.installation"
      :lifecycle="operationalView.lifecycle"
      :upgrade="operationalView.upgrade"
      :refresh="setup.refresh"
      :begin-upgrade="setup.beginUpgrade"
      :cancel-upgrade="setup.cancelUpgrade"
      :submit-upgrade="setup.submitUpgrade"
    />

    <SetupHealthPanel :health="view.health" :refresh="setup.refresh" />
  </section>
</template>
