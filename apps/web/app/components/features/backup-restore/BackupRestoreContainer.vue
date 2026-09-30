<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import BackupRestoreCleanupSection from './BackupRestoreCleanupSection.vue'
import BackupRestoreCreateCard from './BackupRestoreCreateCard.vue'
import BackupRestoreListSection from './BackupRestoreListSection.vue'
import BackupRestoreOperationCard from './BackupRestoreOperationCard.vue'
import BackupRestoreRestoreDialog from './BackupRestoreRestoreDialog.vue'
import { useBackupRestore } from './useBackupRestore'

const controller = useBackupRestore()
const view = controller.view
const refreshing = shallowRef(false)
const readyView = computed(() => (view.value.kind === 'ready' ? view.value : null))
const statusAnnouncement = computed(() => {
  if (view.value.kind === 'loading') return view.value.message
  if (view.value.kind === 'access-error') return view.value.error.message
  return view.value.announcement
})

async function refresh(): Promise<void> {
  refreshing.value = true
  try {
    await controller.refresh()
  } finally {
    refreshing.value = false
  }
}

async function createBackup(): Promise<void> {
  await controller.createBackup()
}

async function confirmRestore(confirmation: string): Promise<void> {
  await controller.confirmRestore(confirmation)
}
</script>

<template>
  <div class="flex min-w-0 w-full flex-col gap-6">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0 space-y-2">
        <p class="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Admin operations
        </p>
        <h1 id="backup-restore-title" class="text-3xl font-semibold tracking-tight">
          Backup and restore
        </h1>
        <p class="text-muted-foreground max-w-2xl text-sm sm:text-base">
          Create source backups and recover the installation with server-confirmed lifecycle status.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        :disabled="refreshing"
        aria-label="Refresh backup and restore status"
        @click="refresh"
      >
        <Spinner v-if="refreshing" aria-hidden="true" />
        {{ refreshing ? 'Refreshing' : 'Refresh status' }}
      </Button>
    </header>

    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ statusAnnouncement }}
    </p>

    <Card v-if="view.kind === 'loading'">
      <CardContent class="flex items-center gap-2 py-6 text-sm">
        <Spinner aria-hidden="true" />
        Loading backup and restore status
      </CardContent>
    </Card>

    <Alert v-else-if="view.kind === 'access-error'" variant="destructive">
      <AlertTitle v-if="view.error.kind === 'authentication'"
        >Administrator sign-in required</AlertTitle
      >
      <AlertTitle v-else>Administrator access required</AlertTitle>
      <AlertDescription>{{ view.error.message }}</AlertDescription>
      <Button
        v-if="view.error.action === 'sign-in'"
        as-child
        class="mt-3"
        size="sm"
        variant="outline"
      >
        <NuxtLink to="/login?redirect=/admin/backup-restore"> Sign in </NuxtLink>
      </Button>
    </Alert>

    <template v-else-if="readyView">
      <Card v-if="readyView.lock.kind !== 'available'">
        <CardContent class="py-4 text-sm">
          <p class="font-medium">Lifecycle actions are locked</p>
          <p class="text-muted-foreground">
            <template v-if="readyView.lock.kind === 'held'">
              {{ readyView.lock.operationLabel }} is active. Refresh after it finishes.
            </template>
            <template v-else>{{ readyView.actions.disabledReason }}</template>
          </p>
        </CardContent>
      </Card>
      <Card v-if="readyView.recovery.kind === 'resumed'">
        <CardContent class="py-4 text-sm">
          <p class="font-medium">Recovered server operation</p>
          <p class="text-muted-foreground">
            {{ readyView.recovery.message }} Operation ID
            <code>{{ readyView.recovery.operationId }}</code> is shown for support correlation only.
          </p>
        </CardContent>
      </Card>

      <BackupRestoreOperationCard
        v-if="readyView.operation.kind !== 'none'"
        :section="readyView.operation"
        @refresh="refresh"
        @resume-polling="controller.resumePolling"
      />
      <BackupRestoreCleanupSection :section="readyView.cleanup" />
      <BackupRestoreCreateCard
        :section="readyView.create"
        @create="createBackup"
        @refresh="refresh"
      />
      <BackupRestoreListSection
        :section="readyView.list"
        @load-more="controller.loadMore"
        @refresh="refresh"
        @restore="controller.openRestore"
      />
      <BackupRestoreRestoreDialog
        :section="readyView.restore"
        @cancel="controller.cancelRestore"
        @confirm="confirmRestore"
      />
    </template>
  </div>
</template>
