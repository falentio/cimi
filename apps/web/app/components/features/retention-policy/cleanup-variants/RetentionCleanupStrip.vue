<script setup lang="ts">
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import type { RetentionCleanupStatus, RetentionCleanupView } from '../retention-policy.types'
import { formatRetentionDate } from '../retention-policy.utils'

defineProps<{ cleanup: RetentionCleanupView }>()

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

const BADGE_VARIANTS: Record<RetentionCleanupStatus, BadgeVariant> = {
  not_applicable: 'outline',
  not_started: 'outline',
  pending: 'default',
  running: 'default',
  completed: 'secondary',
  failed: 'destructive',
}

function stamp(value: string | null): string {
  return value === null ? 'Not recorded' : formatRetentionDate(value)
}
</script>

<template>
  <section aria-labelledby="retention-cleanup-title" class="grid min-w-0 gap-3">
    <div>
      <h2 id="retention-cleanup-title" class="text-lg font-semibold tracking-tight">
        Cleanup status
      </h2>
      <p class="text-muted-foreground text-sm">
        Cleanup is asynchronous and follows the server-reported stage order. Safe statuses and
        timestamps from the retention policy response.
      </p>
    </div>
    <Alert v-if="cleanup.pending" role="status">
      <AlertTitle>Cleanup is pending</AlertTitle>
      <AlertDescription>
        Derived cleanup runs first. Historical backup cleanup remains later until derived cleanup is
        complete.
      </AlertDescription>
    </Alert>
    <ul class="grid min-w-0 gap-2">
      <li
        v-for="stage in cleanup.stages"
        :key="stage.kind"
        class="min-w-0 rounded-md border px-3 py-2.5"
      >
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span class="text-sm font-medium">{{ stage.label }}</span>
          <Badge :variant="BADGE_VARIANTS[stage.status]">{{ stage.statusLabel }}</Badge>
        </div>
        <p class="text-muted-foreground mt-0.5 text-xs tabular-nums">
          Started {{ stamp(stage.startedAt) }} · Completed {{ stamp(stage.completedAt) }}
        </p>
        <p
          v-if="stage.blockedByDerivedCleanup"
          class="text-muted-foreground mt-1 text-xs"
          role="status"
        >
          Waiting for derived cleanup. The server status remains
          {{ stage.statusLabel.toLowerCase() }}.
        </p>
        <p v-if="stage.errorMessage" class="text-destructive mt-1 text-xs" role="alert">
          {{ stage.errorMessage }}
        </p>
      </li>
    </ul>
  </section>
</template>
