<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { AlertCircleIcon, Settings01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { siteSettingsPath } from '@/components/features/app-shell/organization-nav-config'
import type { SiteSettingsSnapshot } from './site-settings.types'
import { useLocalizedErrorMessage } from '@/composables/useLocalizedErrorMessage'

const props = defineProps<{
  snapshot: SiteSettingsSnapshot
  retry: () => Promise<void>
}>()

const route = useRoute()
const retrying = shallowRef(false)
const localizeError = useLocalizedErrorMessage()

type SettingsSection = 'general' | 'danger'

const sectionLinks = computed(() => {
  const siteId = props.snapshot.siteId
  if (siteId === undefined) return []

  const basePath = siteSettingsPath(siteId)
  return [
    { label: 'General', section: 'general' as const, to: `${basePath}/general` },
    { label: 'Danger zone', section: 'danger' as const, to: `${basePath}/danger` },
  ]
})

const activeSection = computed<SettingsSection>(
  () => sectionLinks.value.find((link) => link.to === route.path)?.section ?? 'general',
)

async function handleRetry(): Promise<void> {
  retrying.value = true
  try {
    await props.retry()
  } catch {
    return
  } finally {
    retrying.value = false
  }
}
</script>

<template>
  <section aria-labelledby="site-settings-title" class="flex min-w-0 w-full flex-col gap-6">
    <header class="flex flex-col gap-1">
      <p class="text-muted-foreground text-sm font-medium tracking-wide uppercase">Site settings</p>
      <h1 id="site-settings-title" class="text-2xl font-semibold tracking-tight">
        Manage your site
      </h1>
      <p class="text-muted-foreground max-w-2xl text-sm">
        Update the details and lifecycle controls for this site.
      </p>
    </header>

    <nav v-if="sectionLinks.length > 0" aria-label="Site settings">
      <UITabs :model-value="activeSection" activation-mode="manual" class="w-full">
        <UITabsList aria-label="Site settings sections" class="min-w-max justify-start">
          <UITabsTrigger
            v-for="link in sectionLinks"
            :key="link.section"
            :value="link.section"
            as-child
          >
            <NuxtLink :to="link.to" class="shrink-0 px-3 py-2">
              <HugeiconsIcon
                :icon="link.section === 'danger' ? AlertCircleIcon : Settings01Icon"
                :size="16"
                aria-hidden="true"
                data-icon="inline-start"
              />
              {{ link.label }}
            </NuxtLink>
          </UITabsTrigger>
        </UITabsList>
      </UITabs>
    </nav>

    <div
      v-if="snapshot.load.status === 'loading'"
      class="text-muted-foreground flex items-center gap-2 text-sm"
      role="status"
      aria-live="polite"
    >
      <Spinner aria-hidden="true" />
      Loading site settings…
    </div>

    <Alert v-else-if="snapshot.load.status === 'error'" variant="destructive">
      <HugeiconsIcon :icon="AlertCircleIcon" aria-hidden="true" />
      <AlertTitle>Site settings could not be loaded</AlertTitle>
      <AlertDescription>{{ localizeError(snapshot.load.error) }}</AlertDescription>
      <Button class="mt-3" size="sm" variant="outline" :disabled="retrying" @click="handleRetry">
        <Spinner v-if="retrying" aria-hidden="true" />
        {{ retrying ? 'Retrying…' : 'Retry' }}
      </Button>
    </Alert>

    <Card v-else-if="snapshot.load.status === 'idle'">
      <CardHeader>
        <CardTitle>Site not found</CardTitle>
        <CardDescription
          >Choose a site from the workspace switcher to manage its settings.</CardDescription
        >
      </CardHeader>
    </Card>

    <template v-else>
      <Alert v-if="snapshot.load.status === 'stale-error'" variant="destructive" role="alert">
        <HugeiconsIcon :icon="AlertCircleIcon" aria-hidden="true" />
        <AlertTitle>Latest site settings could not be loaded</AlertTitle>
        <AlertDescription>{{ localizeError(snapshot.load.error) }}</AlertDescription>
        <Button class="mt-3" size="sm" variant="outline" :disabled="retrying" @click="handleRetry">
          <Spinner v-if="retrying" aria-hidden="true" />
          {{ retrying ? 'Retrying…' : 'Retry' }}
        </Button>
      </Alert>
      <div
        v-if="snapshot.load.status === 'refreshing'"
        class="text-muted-foreground text-sm"
        role="status"
      >
        Refreshing site settings…
      </div>
      <slot />
    </template>
  </section>
</template>
