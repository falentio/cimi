<script setup lang="ts">
import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
</script>

<template>
  <Empty class="min-h-64 border border-destructive/40 bg-destructive/5 text-destructive">
    <EmptyHeader>
      <EmptyMedia variant="icon" class="bg-destructive/10 text-destructive">
        <HugeiconsIcon :icon="Alert02Icon" aria-hidden="true" />
      </EmptyMedia>
      <EmptyTitle>UNIMPLEMENTED</EmptyTitle>
    </EmptyHeader>
  </Empty>
</template>
