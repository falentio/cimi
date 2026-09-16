<script setup lang="ts">
import { Building03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import type { WorkspaceSite, WorkspaceTeam } from '@/components/features/app-shell/workspace'
import OrganizationSiteCard from './OrganizationSiteCard.vue'

defineProps<{
  organization: WorkspaceTeam
  sites: readonly WorkspaceSite[]
}>()

const emit = defineEmits<{
  addSite: []
  switchOrganization: []
}>()
</script>

<template>
  <section aria-labelledby="organization-sites-title" class="flex flex-col gap-4">
    <header class="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 id="organization-sites-title" class="text-lg font-semibold tracking-tight">Sites</h2>
        <p class="text-muted-foreground text-sm">Sites connected to this organization.</p>
      </div>
      <p class="text-muted-foreground text-sm">
        {{ sites.length }} {{ sites.length === 1 ? 'site' : 'sites' }}
      </p>
    </header>

    <div v-if="sites.length > 0" class="grid min-w-0 gap-4 md:grid-cols-2" role="list">
      <OrganizationSiteCard v-for="site in sites" :key="site.id" :site="site" role="listitem" />
    </div>

    <Empty v-else class="min-h-64 border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon :icon="Building03Icon" aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle
          ><h3 class="break-words">No sites in {{ organization.name }}</h3></EmptyTitle
        >
        <EmptyDescription>This organization does not have any sites to show yet.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button class="w-full sm:w-auto" type="button" @click="emit('addSite')">
            Add site
          </Button>
          <Button
            class="w-full sm:w-auto"
            type="button"
            variant="outline"
            @click="emit('switchOrganization')"
          >
            Switch organizations
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  </section>
</template>
