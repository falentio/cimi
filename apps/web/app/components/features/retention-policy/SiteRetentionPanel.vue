<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  siteRetentionSettingsPath,
  siteSettingsPath,
} from '@/components/features/app-shell/organization-nav-config'
import type { SiteId } from '../site-settings/site-settings.types'
import RetentionCleanupSection from './RetentionCleanupSection.vue'
import RetentionConfirmationDialog from './RetentionConfirmationDialog.vue'
import SiteRetentionClearDialog from './SiteRetentionClearDialog.vue'
import SiteRetentionForm from './SiteRetentionForm.vue'
import SiteRetentionSummary from './SiteRetentionSummary.vue'
import type { RetentionField, RetentionPolicy } from './retention-policy.types'
import type { SiteRetentionViewModel } from './site-retention.types'

const props = defineProps<{
  view: SiteRetentionViewModel
  siteId: SiteId | undefined
}>()

const emit = defineEmits<{
  refresh: []
  fieldChange: [field: RetentionField, value: string]
  submit: [policy: RetentionPolicy]
  clear: []
  cancelConfirmation: []
  confirmShortening: [confirmation: string]
}>()

const clearing = shallowRef(false)

const ready = computed(() => (props.view.kind === 'ready' ? props.view : null))

const refreshing = computed(() => ready.value?.refreshing ?? false)

const clearDialogOpen = computed(() => clearing.value && ready.value?.command.kind === 'idle')

function beginClear(): void {
  const current = ready.value

  if (current === null || !current.policy.canClear) return

  if (current.policy.clearShortens) {
    emit('clear')

    return
  }

  clearing.value = true
}

function confirmClear(): void {
  clearing.value = false
  emit('clear')
}
</script>

<template>
  <section aria-labelledby="site-retention-title" class="flex min-w-0 w-full flex-col gap-6">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <h2 id="site-retention-title" class="text-xl font-semibold tracking-tight">Retention</h2>
        <p class="text-muted-foreground mt-1 max-w-2xl text-sm">
          Inspect the inherited installation default, set a Site override, or clear it to inherit
          again.
        </p>
      </div>
      <Button variant="outline" type="button" :disabled="refreshing" @click="emit('refresh')">
        <Spinner v-if="refreshing" aria-hidden="true" />
        {{ refreshing ? 'Refreshing…' : 'Refresh retention' }}
      </Button>
    </header>

    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ ready === null ? '' : ready.announcement }}
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
      <AlertTitle>Retention settings require Site administrator access</AlertTitle>
      <AlertDescription>{{ view.error.message }}</AlertDescription>
      <Button v-if="view.error.kind === 'authentication'" class="mt-3" size="sm" as-child>
        <NuxtLink
          :to="
            siteId === undefined ? '/login' : `/login?redirect=${siteRetentionSettingsPath(siteId)}`
          "
        >
          Sign in
        </NuxtLink>
      </Button>
      <Button v-else class="mt-3" size="sm" variant="outline" as-child>
        <NuxtLink :to="siteId === undefined ? '/' : siteSettingsPath(siteId)">
          Return to Site settings
        </NuxtLink>
      </Button>
    </Alert>

    <Alert v-else-if="view.kind === 'error'" variant="destructive">
      <AlertTitle>Retention settings could not be loaded</AlertTitle>
      <AlertDescription>{{ view.error.message }}</AlertDescription>
      <Button class="mt-3" size="sm" :disabled="refreshing" @click="emit('refresh')">
        <Spinner v-if="refreshing" aria-hidden="true" />
        Refresh retention
      </Button>
    </Alert>

    <template v-else>
      <Alert v-if="view.stale" variant="destructive">
        <AlertTitle>Retention settings are stale</AlertTitle>
        <AlertDescription>
          {{ view.retentionError?.message }} Refresh before saving so the override uses current
          server data.
        </AlertDescription>
        <Button class="mt-3" size="sm" :disabled="refreshing" @click="emit('refresh')">
          <Spinner v-if="refreshing" aria-hidden="true" />
          Refresh retention
        </Button>
      </Alert>

      <Alert v-if="view.command.kind === 'failed'" variant="destructive">
        <AlertTitle>Retention settings were not saved</AlertTitle>
        <AlertDescription>{{ view.command.error.message }}</AlertDescription>
        <Button
          v-if="view.command.error.action === 'refresh'"
          class="mt-3"
          size="sm"
          :disabled="refreshing"
          @click="emit('refresh')"
        >
          <Spinner v-if="refreshing" aria-hidden="true" />
          Refresh before retrying
        </Button>
      </Alert>

      <Alert v-if="view.notice" role="status">
        <AlertTitle>Retention settings saved</AlertTitle>
        <AlertDescription>{{ view.notice.message }}</AlertDescription>
      </Alert>

      <SiteRetentionSummary
        :policy="view.policy"
        :provenance="view.provenance"
        :updated-at="view.result.updatedAt"
      />

      <p v-if="view.policy.shortening" class="text-muted-foreground text-sm">
        Shortening retention hides affected data from queries immediately. Physical cleanup
        continues separately below, and extending retention later does not restore purged data.
      </p>

      <SiteRetentionForm
        :policy="view.policy"
        @clear="beginClear"
        @field-change="(field, value) => emit('fieldChange', field, value)"
        @submit="(policy) => emit('submit', policy)"
      />

      <div class="grid min-w-0 gap-3">
        <p class="text-muted-foreground text-sm">
          Cleanup status is installation-wide and covers every Site. Hiding this Site's data is
          immediate.
        </p>
        <RetentionCleanupSection :cleanup="view.cleanup" />
      </div>

      <RetentionConfirmationDialog
        v-if="view.command.kind === 'confirming' || view.command.kind === 'submitting'"
        subject="site"
        :command="view.command"
        @cancel="emit('cancelConfirmation')"
        @confirm="(confirmation) => emit('confirmShortening', confirmation)"
      />

      <SiteRetentionClearDialog
        v-model:open="clearDialogOpen"
        :installation-default="view.policy.installationDefault"
        @cancel="clearing = false"
        @confirm="confirmClear"
      />
    </template>
  </section>
</template>
