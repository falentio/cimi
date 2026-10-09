<script setup lang="ts">
import { computed } from 'vue'
import { Alert, AlertDescription, AlertTitle, alertVariants } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { siteSettingsPath } from '@/components/features/app-shell/organization-nav-config'
import PublicDashboardConfirmDialog from './PublicDashboardConfirmDialog.vue'
import PublicDashboardFacts from './PublicDashboardFacts.vue'
import PublicDashboardStatusCard from './PublicDashboardStatusCard.vue'
import type { SitePublicDashboardController } from './public-dashboard.types'

const props = defineProps<{
  controller: SitePublicDashboardController
  siteId: string
}>()

const view = computed(() => props.controller.view.value)

const settingsPath = computed(() => siteSettingsPath(props.siteId))

async function refresh(): Promise<void> {
  await props.controller.refresh()
}
</script>

<template>
  <section aria-labelledby="public-dashboard-title" class="flex min-w-0 w-full flex-col gap-6">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <h2 id="public-dashboard-title" class="text-lg font-semibold tracking-tight">
          Public dashboard
        </h2>
        <p class="text-muted-foreground mt-1 text-sm">
          Share an aggregate view of this Site through one public link. The link carries a random
          identifier, not a key. It never exposes authenticated reports, private filters, or
          individual visitors.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        :disabled="view.kind === 'ready' && view.refreshing"
        @click="refresh"
      >
        <Spinner v-if="view.kind === 'ready' && view.refreshing" aria-hidden="true" />
        {{ view.kind === 'ready' && view.refreshing ? 'Refreshing…' : 'Refresh' }}
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
      <AlertTitle>Public dashboard settings require Site administrator access</AlertTitle>
      <AlertDescription>{{ view.error.message }}</AlertDescription>
      <Button v-if="view.error.kind === 'authentication'" class="mt-3" size="sm" as-child>
        <NuxtLink :to="`/login?redirect=${settingsPath}/public-dashboard`">Sign in</NuxtLink>
      </Button>
      <Button v-else class="mt-3" size="sm" variant="outline" as-child>
        <NuxtLink :to="settingsPath">Return to Site settings</NuxtLink>
      </Button>
    </Alert>

    <Alert v-else-if="view.kind === 'error'" variant="destructive">
      <AlertTitle>Public dashboard settings could not be loaded</AlertTitle>
      <AlertDescription>{{ view.error.message }}</AlertDescription>
      <Button class="mt-3" size="sm" @click="refresh">
        <Spinner aria-hidden="true" />
        Refresh
      </Button>
    </Alert>

    <template v-else>
      <Alert v-if="view.stale" variant="destructive" role="alert">
        <AlertTitle>Public dashboard settings are stale</AlertTitle>
        <AlertDescription>
          {{ view.configError?.message }} Refresh before changing public access.
        </AlertDescription>
        <Button class="mt-3" size="sm" @click="refresh">
          <Spinner aria-hidden="true" />
          Refresh public dashboard settings
        </Button>
      </Alert>

      <Alert v-if="view.command.kind === 'failed'" variant="destructive" role="alert">
        <AlertTitle>Public access was not changed</AlertTitle>
        <AlertDescription>{{ view.command.error.message }}</AlertDescription>
        <Button
          v-if="view.command.error.action === 'refresh'"
          class="mt-3"
          size="sm"
          :disabled="view.refreshing"
          @click="refresh"
        >
          <Spinner v-if="view.refreshing" aria-hidden="true" />
          Refresh before retrying
        </Button>
      </Alert>

      <div v-if="view.notice" :class="alertVariants()">
        <AlertTitle>
          {{
            view.notice.operation === 'disable' ? 'Public access disabled' : 'Identifier updated'
          }}
        </AlertTitle>
        <AlertDescription>
          {{ view.notice.message }}
          <template v-if="view.notice.warning !== null">{{ view.notice.warning.message }}</template>
        </AlertDescription>
      </div>

      <PublicDashboardStatusCard
        :busy="view.busy"
        :config="view.config"
        :operations="view.operations"
        :status="view.status"
        @request="controller.request"
      />

      <PublicDashboardFacts />

      <p class="text-muted-foreground text-sm">
        This page configures public access only. It does not offer raw rows, session or profile
        filters, replay, search-console data, or exports, and it does not claim that disabling
        erases copies already taken.
      </p>
    </template>

    <PublicDashboardConfirmDialog
      v-if="view.kind === 'ready'"
      :command="view.command"
      @cancel="controller.cancel"
      @confirm="controller.confirm"
    />
  </section>
</template>
