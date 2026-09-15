<script setup lang="ts">
import { computed } from 'vue'
import { AlertCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import type { OrganizationSettingsSnapshot } from './organization-settings.types'

const props = defineProps<{
  snapshot: OrganizationSettingsSnapshot
}>()

const sectionLinks = computed(() => {
  const query =
    props.snapshot.activeOrganizationId === undefined
      ? undefined
      : { organizationId: props.snapshot.activeOrganizationId }
  return [
    { label: 'General', to: { path: '/settings/general', query } },
    { label: 'Members', to: { path: '/settings/members', query } },
    { label: 'Danger zone', to: { path: '/settings/danger', query } },
  ]
})
</script>

<template>
  <main class="mx-auto flex w-full max-w-4xl flex-col gap-6">
    <header class="flex flex-col gap-1">
      <p class="text-muted-foreground text-sm font-medium tracking-wide uppercase">
        Organization settings
      </p>
      <h1 class="text-2xl font-semibold tracking-tight">Manage your organization</h1>
      <p class="text-muted-foreground max-w-2xl text-sm">
        Keep your workspace identity and access controls in one place.
      </p>
    </header>

    <nav
      aria-label="Organization settings"
      class="border-border flex gap-1 overflow-x-auto border-b"
    >
      <NuxtLink
        v-for="link in sectionLinks"
        :key="link.label"
        :to="link.to"
        class="text-muted-foreground hover:text-foreground shrink-0 border-b-2 border-transparent px-3 py-2 text-sm font-medium transition-colors"
        active-class="border-primary text-foreground"
      >
        {{ link.label }}
      </NuxtLink>
    </nav>

    <div v-if="snapshot.isLoading" class="text-muted-foreground flex items-center gap-2 text-sm">
      <Spinner aria-hidden="true" />
      Loading organization settings…
    </div>

    <Alert v-else-if="snapshot.organization === undefined && snapshot.error" variant="destructive">
      <HugeiconsIcon :icon="AlertCircleIcon" aria-hidden="true" />
      <AlertTitle>Settings could not be loaded</AlertTitle>
      <AlertDescription>{{ snapshot.error.message }}</AlertDescription>
    </Alert>

    <Card v-else-if="snapshot.organization === undefined">
      <CardHeader>
        <CardTitle>Select an organization</CardTitle>
        <CardDescription>
          Choose an organization from the workspace switcher to manage its settings.
        </CardDescription>
      </CardHeader>
      <CardContent />
    </Card>

    <slot v-else />
  </main>
</template>
