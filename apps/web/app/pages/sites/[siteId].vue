<script setup lang="ts">
import { Badge } from '@/components/ui/badge'

const route = useRoute()

const siteId = computed(() => route.params.siteId)

useHead(() => ({
  title: `${String(siteId.value)} · Cimi`,
}))

const tabs = computed(() => {
  const base = `/sites/${siteId.value}`
  return [
    { label: 'Overview', to: base, exact: true },
    { label: 'Events', to: `${base}/events` },
    { label: 'Goals', to: `${base}/goals` },
    { label: 'Funnels', to: `${base}/funnels` },
    { label: 'Cohorts', to: `${base}/cohorts` },
    { label: 'Settings', to: `${base}/settings` },
  ]
})

function isTabActive(to: string, exact: boolean | undefined): boolean {
  return route.path === to || (!exact && route.path.startsWith(`${to}/`))
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <header class="flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-semibold tracking-tight">{{ siteId }}</h1>
      <Badge
        variant="outline"
        class="border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-400"
      >
        <span class="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        Live
      </Badge>
    </header>

    <nav aria-label="Site sections" class="flex flex-wrap items-center gap-1 border-b pb-px">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        :aria-current="isTabActive(tab.to, tab.exact) ? 'page' : undefined"
        class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        :class="
          isTabActive(tab.to, tab.exact)
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        "
      >
        {{ tab.label }}
      </NuxtLink>
    </nav>

    <NuxtPage />
  </div>
</template>
