<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { AlertCircleIcon, Building03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { useSidebar } from '@/components/ui/sidebar'
import type { OrganizationHomeState } from './organization-home.types'
import { organizationSettingsPath } from '@/components/features/app-shell/organization-nav-config'
import OrganizationSiteList from './OrganizationSiteList.vue'

const props = defineProps<{
  state: OrganizationHomeState
  refresh: () => Promise<void>
}>()

const retrying = shallowRef(false)
const { isMobile, setOpen, setOpenMobile } = useSidebar()

const readyState = computed(() => (props.state.kind === 'ready' ? props.state : undefined))

async function retry(): Promise<void> {
  retrying.value = true
  try {
    await props.refresh()
  } catch {
    return
  } finally {
    retrying.value = false
  }
}

function switchOrganization(): void {
  if (isMobile.value) {
    setOpenMobile(true)
    return
  }
  setOpen(true)
}
</script>

<template>
  <section
    aria-labelledby="organization-home-title"
    class="mx-auto flex w-full max-w-5xl flex-col gap-6"
  >
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <p class="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Organization
        </p>
        <h1 id="organization-home-title" class="text-2xl font-semibold tracking-tight">
          Organization home
        </h1>
        <p class="text-muted-foreground mt-1 max-w-2xl break-words text-sm">
          {{ readyState?.organization.name ?? 'Manage sites and settings for this organization.' }}
        </p>
      </div>
      <Button v-if="readyState" as-child class="shrink-0" variant="outline">
        <NuxtLink :to="organizationSettingsPath(readyState.organization.id)"
          >Organization settings</NuxtLink
        >
      </Button>
    </header>

    <div
      v-if="state.kind === 'loading'"
      class="text-muted-foreground flex items-center gap-2 text-sm"
      role="status"
      aria-live="polite"
    >
      <Spinner aria-hidden="true" />
      Loading organization home…
    </div>

    <Alert v-else-if="state.kind === 'error'" variant="destructive">
      <HugeiconsIcon :icon="AlertCircleIcon" aria-hidden="true" />
      <AlertTitle><h2>Workspace data could not be loaded</h2></AlertTitle>
      <AlertDescription class="break-words">{{ state.error.message }}</AlertDescription>
      <Button class="mt-3" size="sm" variant="outline" :disabled="retrying" @click="retry">
        <Spinner v-if="retrying" aria-hidden="true" />
        {{ retrying ? 'Retrying…' : 'Retry' }}
      </Button>
    </Alert>

    <Card v-else-if="state.kind === 'invalid-route'">
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <HugeiconsIcon :icon="AlertCircleIcon" :size="18" aria-hidden="true" />
          <h2>Organization route is invalid</h2>
        </CardTitle>
        <CardDescription
          >Choose an organization from the workspace switcher to continue.</CardDescription
        >
      </CardHeader>
      <CardContent>
        <Button type="button" variant="outline" @click="switchOrganization"
          >Switch organization</Button
        >
      </CardContent>
    </Card>

    <Card v-else-if="state.kind === 'missing'">
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <HugeiconsIcon :icon="Building03Icon" :size="18" aria-hidden="true" />
          <h2>Organization not found</h2>
        </CardTitle>
        <CardDescription
          >This organization is not available in your current workspace.</CardDescription
        >
      </CardHeader>
      <CardContent>
        <Button type="button" variant="outline" @click="switchOrganization"
          >Switch organization</Button
        >
      </CardContent>
    </Card>

    <OrganizationSiteList
      v-else-if="readyState"
      :organization="readyState.organization"
      :sites="readyState.sites"
      @switch-organization="switchOrganization"
    />
  </section>
</template>
