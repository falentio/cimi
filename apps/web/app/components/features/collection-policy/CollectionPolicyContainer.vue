<script setup lang="ts">
import { computed } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import CollectionPolicyEditor from './CollectionPolicyEditor.vue'
import type { SiteCollectionPolicyController } from './collection-policy.types'

const props = defineProps<{
  controller: SiteCollectionPolicyController
  siteId: string
}>()

const view = computed(() => props.controller.view.value)
const refreshing = computed(() => (view.value.kind === 'ready' ? view.value.refreshing : false))

async function refresh(): Promise<void> {
  await props.controller.refresh()
}

const settingsPath = computed(() => `/sites/${props.siteId}/settings/general`)
</script>

<template>
  <section aria-labelledby="collection-policy-title" class="flex min-w-0 w-full flex-col gap-6">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <h2 id="collection-policy-title" class="text-lg font-semibold tracking-tight">
          Collection policy
        </h2>
        <p class="text-muted-foreground mt-1 text-sm">
          Inspect the policy the server resolves for this Site and edit the Site override. The
          server applies the resolved policy when a request arrives; this form only edits the stored
          layer.
        </p>
      </div>
      <Button type="button" variant="outline" :disabled="refreshing" @click="refresh">
        <Spinner v-if="refreshing" aria-hidden="true" />
        {{ refreshing ? 'Refreshing…' : 'Refresh' }}
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
      <AlertTitle>Collection settings require Site administrator access</AlertTitle>
      <AlertDescription>{{ view.error.message }}</AlertDescription>
      <Button v-if="view.error.kind === 'authentication'" class="mt-3" size="sm" as-child>
        <NuxtLink :to="`/login?redirect=${settingsPath}`">Sign in</NuxtLink>
      </Button>
      <Button v-else class="mt-3" size="sm" variant="outline" as-child>
        <NuxtLink to="/">Return to your workspace</NuxtLink>
      </Button>
    </Alert>

    <Alert v-else-if="view.kind === 'error'" variant="destructive">
      <AlertTitle>Collection settings could not be loaded</AlertTitle>
      <AlertDescription>{{ view.error.message }}</AlertDescription>
      <Button class="mt-3" size="sm" :disabled="refreshing" @click="refresh">
        <Spinner v-if="refreshing" aria-hidden="true" />
        Refresh
      </Button>
    </Alert>

    <template v-else>
      <Alert v-if="view.stale" variant="destructive" role="alert">
        <AlertTitle>Collection settings are stale</AlertTitle>
        <AlertDescription>
          {{ view.resourceError?.message }} Refresh before saving so the form uses current server
          data.
        </AlertDescription>
        <Button class="mt-3" size="sm" :disabled="refreshing" @click="refresh">
          <Spinner v-if="refreshing" aria-hidden="true" />
          Refresh collection policy
        </Button>
      </Alert>

      <Alert v-if="view.editor.serverError" variant="destructive" role="alert">
        <AlertTitle>Collection settings were not saved</AlertTitle>
        <AlertDescription>{{ view.editor.serverError.message }}</AlertDescription>
        <Button
          v-if="view.editor.serverError.action === 'refresh'"
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
        <AlertTitle>
          {{ view.notice.kind === 'cleared' ? 'Site override cleared' : 'Site override saved' }}
        </AlertTitle>
        <AlertDescription>
          {{ view.notice.message }}
          <template v-if="view.notice.warning !== null">
            {{ view.notice.warning.message }}
          </template>
        </AlertDescription>
      </Alert>

      <CollectionPolicyEditor
        :editor="view.editor"
        @begin-edit="controller.beginEdit"
        @cancel-edit="controller.cancelEdit"
        @confirm-clear="controller.clearOverride"
        @patch="controller.edit"
        @save="controller.save"
      />

      <p class="text-muted-foreground text-sm">
        The Site override replaces the whole Site layer, not individual fields. Fields it does not
        change still belong to the Site layer once an override exists.
      </p>
    </template>
  </section>
</template>
