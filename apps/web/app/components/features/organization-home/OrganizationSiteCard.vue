<script setup lang="ts">
import { Globe02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { WorkspaceSite } from '@/components/features/app-shell/workspace'
import {
  siteOverviewPath,
  siteSettingsPath,
} from '@/components/features/app-shell/organization-nav-config'

defineProps<{
  site: WorkspaceSite
}>()
</script>

<template>
  <Card class="min-w-0">
    <CardHeader>
      <CardTitle class="min-w-0">
        <h3 class="truncate">{{ site.name }}</h3>
      </CardTitle>
      <CardDescription class="flex min-w-0 items-center gap-2">
        <HugeiconsIcon :icon="Globe02Icon" :size="16" aria-hidden="true" />
        <span class="min-w-0 break-all">{{ site.hostname }}</span>
      </CardDescription>
    </CardHeader>
    <CardContent>
      <p class="text-muted-foreground text-sm">Open analytics or manage this site's settings.</p>
    </CardContent>
    <CardFooter class="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
      <Button as-child class="sm:flex-1">
        <NuxtLink :to="siteOverviewPath(site.id)">Open site</NuxtLink>
      </Button>
      <Button as-child class="sm:flex-1" variant="outline">
        <NuxtLink :to="siteSettingsPath(site.id)">Site settings</NuxtLink>
      </Button>
    </CardFooter>
  </Card>
</template>
