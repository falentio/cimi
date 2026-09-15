<script setup lang="ts">
import { Badge } from '@/components/ui/badge'

const route = useRoute()

const siteId = computed(() => route.params.siteId)

useHead(() => ({
  title: `${String(siteId.value)} · Cimi`,
}))
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

    <NuxtPage />
  </div>
</template>
