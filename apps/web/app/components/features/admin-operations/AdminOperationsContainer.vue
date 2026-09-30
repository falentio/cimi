<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import AdminCleanupSection from './AdminCleanupSection.vue'
import AdminHealthSection from './AdminHealthSection.vue'
import AdminLifecycleSection from './AdminLifecycleSection.vue'
import AdminOperationLinks from './AdminOperationLinks.vue'
import { toAdminOperationsView } from './admin-operations.utils'
import { useSetup } from '../setup/useSetup'

const setup = useSetup()
const projection = computed(() => toAdminOperationsView(setup.view.value))
const refreshing = shallowRef(false)
const refreshAnnouncement = computed(() =>
  refreshing.value ? 'Refreshing installation and health status.' : '',
)

async function refresh(): Promise<void> {
  refreshing.value = true
  try {
    await setup.refresh()
  } catch {
    return
  } finally {
    refreshing.value = false
  }
}
</script>

<template>
  <main aria-labelledby="admin-operations-title" class="flex min-w-0 w-full flex-col gap-6">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0 space-y-2">
        <p class="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Admin operations
        </p>
        <h1 id="admin-operations-title" class="text-3xl font-semibold tracking-tight">
          Installation operations
        </h1>
        <p class="text-muted-foreground max-w-2xl text-sm sm:text-base">
          Review installation health, lifecycle work, and cleanup readiness from one safe report.
        </p>
      </div>
      <Button
        variant="outline"
        type="button"
        :disabled="refreshing"
        aria-label="Refresh installation operations"
        @click="refresh"
      >
        <Spinner v-if="refreshing" aria-hidden="true" />
        {{ refreshing ? 'Refreshing...' : 'Refresh report' }}
      </Button>
    </header>

    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ refreshAnnouncement }}
    </p>

    <AdminHealthSection :health="projection.health" :refreshing="refreshing" @refresh="refresh" />
    <AdminLifecycleSection
      :installation="projection.installation"
      :refreshing="refreshing"
      @refresh="refresh"
    />
    <AdminCleanupSection
      v-if="
        projection.installation.kind === 'report' || projection.installation.kind === 'stale-report'
      "
      :cleanup="projection.installation.cleanup"
    />
    <AdminOperationLinks />
  </main>
</template>
