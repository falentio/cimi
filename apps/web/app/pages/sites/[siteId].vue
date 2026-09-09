<script setup lang="ts">
const route = useRoute()

const siteId = computed(() => route.params.siteId)

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
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold tracking-tight">{{ siteId }}</h1>
      <p class="text-muted-foreground text-sm">
        Site shell placeholder. The Site name and facts land here once data wiring arrives.
      </p>
    </header>

    <nav aria-label="Site sections" class="flex items-center gap-1 border-b pb-px">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
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
