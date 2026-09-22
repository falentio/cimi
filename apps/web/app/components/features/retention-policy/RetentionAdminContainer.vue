<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import RetentionCleanupSection from './RetentionCleanupSection.vue'
import RetentionConfirmationDialog from './RetentionConfirmationDialog.vue'
import RetentionPolicyForm from './RetentionPolicyForm.vue'
import { useRetentionAdmin } from './useRetentionAdmin'

const controller = useRetentionAdmin()
const view = computed(() => controller.view.value)
const refreshing = shallowRef(false)

async function refresh(): Promise<void> {
  refreshing.value = true
  try {
    await controller.refresh()
  } finally {
    refreshing.value = false
  }
}

async function submit(policy: Parameters<typeof controller.submit>[0]): Promise<void> {
  await controller.submit(policy)
}

async function confirmShortening(confirmation: string): Promise<void> {
  await controller.confirmShortening(confirmation)
}
</script>

<template>
  <main aria-labelledby="retention-admin-title" class="flex min-w-0 w-full flex-col gap-6">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <p class="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Admin settings
        </p>
        <h1 id="retention-admin-title" class="text-3xl font-semibold tracking-tight">
          Installation retention
        </h1>
        <p class="text-muted-foreground mt-1 max-w-2xl text-sm sm:text-base">
          Manage installation defaults while keeping lifecycle and cleanup status visible.
        </p>
      </div>
      <Button variant="outline" type="button" :disabled="refreshing" @click="refresh">
        <Spinner v-if="refreshing" aria-hidden="true" />
        {{ refreshing ? 'Refreshing…' : 'Refresh status' }}
      </Button>
    </header>

    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ view.kind === 'ready' ? view.announcement : '' }}
    </p>

    <div
      v-if="view.kind === 'loading'"
      class="text-muted-foreground flex items-center gap-2 text-sm"
      role="status"
    >
      <Spinner aria-hidden="true" />
      {{ view.message }}
    </div>

    <Alert v-else-if="view.kind === 'access-error'" variant="destructive">
      <AlertTitle>Retention settings require administrator access</AlertTitle>
      <AlertDescription>{{ view.error.message }}</AlertDescription>
      <Button v-if="view.error.kind === 'authentication'" class="mt-3" size="sm" as-child>
        <NuxtLink to="/login?redirect=/admin/retention">Sign in</NuxtLink>
      </Button>
      <Button v-else class="mt-3" size="sm" variant="outline" as-child>
        <NuxtLink to="/admin">Return to admin operations</NuxtLink>
      </Button>
    </Alert>

    <Card v-else-if="view.kind === 'not-initialized'">
      <CardHeader>
        <CardTitle>Installation is not initialized</CardTitle>
        <CardDescription>{{ view.message }}</CardDescription>
        <Button class="mt-3 w-fit" size="sm" as-child>
          <NuxtLink to="/setup">Open installation setup</NuxtLink>
        </Button>
      </CardHeader>
    </Card>

    <Alert v-else-if="view.kind === 'error'" variant="destructive">
      <AlertTitle>Retention settings could not be loaded</AlertTitle>
      <AlertDescription>{{ view.error.message }}</AlertDescription>
      <div class="mt-3 flex flex-wrap gap-2">
        <Button size="sm" :disabled="refreshing" @click="refresh">
          <Spinner v-if="refreshing" aria-hidden="true" />
          Refresh
        </Button>
        <Button
          v-if="view.error.kind === 'not-found' && view.error.action === 'setup'"
          size="sm"
          variant="outline"
          as-child
        >
          <NuxtLink to="/setup">Open setup</NuxtLink>
        </Button>
      </div>
    </Alert>

    <template v-else-if="view.kind === 'ready'">
      <Alert v-if="view.stale" variant="destructive" role="alert">
        <AlertTitle>Retention settings are stale</AlertTitle>
        <AlertDescription>
          {{ view.retentionError?.message }} Refresh before saving so the form uses current server
          data.
        </AlertDescription>
        <Button class="mt-3" size="sm" :disabled="refreshing" @click="refresh">
          <Spinner v-if="refreshing" aria-hidden="true" />
          Refresh retention
        </Button>
      </Alert>

      <Alert v-if="view.command.kind === 'failed'" variant="destructive" role="alert">
        <AlertTitle>Retention settings were not saved</AlertTitle>
        <AlertDescription>{{ view.command.error.message }}</AlertDescription>
        <Button
          v-if="view.command.error.action === 'refresh'"
          class="mt-3"
          size="sm"
          :disabled="refreshing"
          @click="refresh"
        >
          <Spinner v-if="refreshing" aria-hidden="true" />
          Refresh before retrying
        </Button>
      </Alert>

      <Alert v-if="view.notice" role="status">
        <AlertTitle>Retention settings saved</AlertTitle>
        <AlertDescription>{{ view.notice.message }}</AlertDescription>
      </Alert>

      <RetentionPolicyForm
        :section="view.policy"
        @field-change="controller.edit"
        @submit="submit"
      />

      <section aria-labelledby="retention-inheritance-title" class="grid min-w-0 gap-3">
        <div>
          <h2 id="retention-inheritance-title" class="text-lg font-semibold tracking-tight">
            How installation defaults apply
          </h2>
          <p class="text-muted-foreground text-sm">
            Sites inherit these values unless a Site-specific retention override is configured. This
            page only manages the installation default and does not list or invent Site overrides.
            Open a Site's settings from its Site context to review its override.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" as-child>
            <NuxtLink to="/admin">Admin operations</NuxtLink>
          </Button>
          <Button variant="outline" as-child>
            <NuxtLink to="/admin/backup-restore">Backup and restore</NuxtLink>
          </Button>
        </div>
      </section>

      <RetentionCleanupSection :cleanup="view.cleanup" />

      <RetentionConfirmationDialog
        v-if="view.command.kind === 'confirming' || view.command.kind === 'submitting'"
        :command="view.command"
        @cancel="controller.cancelConfirmation"
        @confirm="confirmShortening"
      />
    </template>
  </main>
</template>
