<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { ADMIN_OPERATION_LINKS } from './admin-operations.utils'
</script>

<template>
  <section aria-labelledby="admin-destinations-title" class="space-y-3">
    <div>
      <h2 id="admin-destinations-title" class="text-lg font-semibold tracking-tight">
        Related admin destinations
      </h2>
      <p class="text-muted-foreground text-sm">
        Open the detailed pages for these operational areas.
      </p>
    </div>
    <div class="flex flex-wrap gap-3">
      <Button v-for="link in ADMIN_OPERATION_LINKS" :key="link.href" as-child variant="outline">
        <NuxtLink :to="link.href">{{ link.label }}</NuxtLink>
      </Button>
    </div>
  </section>
</template>
