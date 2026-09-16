<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { AlertCircleIcon, Settings01Icon, UserGroupIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { useSidebar } from '@/components/ui/sidebar'
import type { OrganizationSettingsSnapshot } from './organization-settings.types'

const props = defineProps<{
  snapshot: OrganizationSettingsSnapshot
  refresh: () => Promise<void>
}>()

const retrying = shallowRef(false)
const { toggleSidebar } = useSidebar()
const route = useRoute()

type SettingsSectionLink = {
  readonly label: string
  readonly icon: typeof AlertCircleIcon
  readonly section: OrganizationSettingsSnapshot['section']
  readonly to: string
}

const sectionLinks = computed<readonly SettingsSectionLink[]>(() => {
  const organizationId = props.snapshot.activeOrganizationId
  if (organizationId === undefined) return []

  const basePath = `/org/${organizationId}/settings`
  return [
    {
      label: 'General',
      icon: Settings01Icon,
      section: 'general',
      to: `${basePath}/general`,
    },
    {
      label: 'Members',
      icon: UserGroupIcon,
      section: 'members',
      to: `${basePath}/members`,
    },
    {
      label: 'Danger zone',
      icon: AlertCircleIcon,
      section: 'danger',
      to: `${basePath}/danger`,
    },
  ] satisfies readonly SettingsSectionLink[]
})

const activeSection = computed<OrganizationSettingsSnapshot['section']>(
  () => sectionLinks.value.find((link) => link.to === route.path)?.section ?? 'general',
)

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
</script>

<template>
  <section
    aria-labelledby="organization-settings-title"
    class="mx-auto flex w-full max-w-4xl flex-col gap-6"
  >
    <header class="flex flex-col gap-1">
      <p class="text-muted-foreground text-sm font-medium tracking-wide uppercase">
        Organization settings
      </p>
      <h1 id="organization-settings-title" class="text-2xl font-semibold tracking-tight">
        Manage your organization
      </h1>
      <p class="text-muted-foreground max-w-2xl text-sm">
        Keep your workspace identity and access controls in one place.
      </p>
    </header>

    <nav aria-label="Organization settings" class="">
      <UITabs :model-value="activeSection" activation-mode="manual" class="w-full">
        <UITabsList aria-label="Organization settings sections" class="min-w-max justify-start">
          <UITabsTrigger
            v-for="link in sectionLinks"
            :key="link.section"
            :value="link.section"
            as-child
          >
            <NuxtLink :to="link.to" class="shrink-0 px-3 py-2">
              <HugeiconsIcon
                :icon="link.icon"
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
      v-if="snapshot.isLoading"
      class="text-muted-foreground flex items-center gap-2 text-sm"
      role="status"
      aria-live="polite"
    >
      <Spinner aria-hidden="true" />
      Loading organization settings…
    </div>

    <Alert v-else-if="snapshot.organization === undefined && snapshot.error" variant="destructive">
      <HugeiconsIcon :icon="AlertCircleIcon" aria-hidden="true" />
      <AlertTitle>Settings could not be loaded</AlertTitle>
      <AlertDescription>{{ snapshot.error.message }}</AlertDescription>
      <Button class="mt-3" size="sm" variant="outline" :disabled="retrying" @click="retry">
        {{ retrying ? 'Retrying…' : 'Retry' }}
      </Button>
    </Alert>

    <Card v-else-if="snapshot.organization === undefined">
      <CardHeader>
        <CardTitle>Select an organization</CardTitle>
        <CardDescription>
          Choose an organization from the workspace switcher to manage its settings.
        </CardDescription>
        <Button class="mt-2 self-start" type="button" variant="outline" @click="toggleSidebar">
          Open workspace switcher
        </Button>
      </CardHeader>
      <CardContent />
    </Card>

    <slot v-else />
  </section>
</template>
