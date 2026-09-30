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

const MARKER_CLASSES: Record<RetentionCleanupStatus, string> = {
  not_applicable: 'bg-muted-foreground/30',
  not_started: 'bg-muted-foreground/30',
  pending: 'bg-primary/60',
  running: 'bg-primary',
  completed: 'bg-foreground/60',
  failed: 'bg-destructive',
}
</script>

<template>
  <section aria-labelledby="retention-cleanup-title" class="grid min-w-0 gap-3">
    <div>
      <h2 id="retention-cleanup-title" class="text-lg font-semibold tracking-tight">
        Cleanup status
      </h2>
      <p class="text-muted-foreground text-sm">
        Cleanup is asynchronous and follows the server-reported stage order.
      </p>
    </div>
    <Alert v-if="cleanup.pending" role="status">
      <AlertTitle>Cleanup is pending</AlertTitle>
      <AlertDescription>
        Derived cleanup runs first. Historical backup cleanup remains later until derived cleanup is
        complete.
      </AlertDescription>
    </Alert>
    <ol class="relative ms-3 grid min-w-0 gap-8 border-s border-border ps-6">
      <li v-for="stage in cleanup.stages" :key="stage.kind" class="relative min-w-0">
        <span
          aria-hidden="true"
          class="border-background absolute top-0.5 -start-[27px] size-2.5 rounded-full border-2"
          :class="MARKER_CLASSES[stage.status]"
        />
        <h3 class="flex flex-wrap items-center gap-2 font-medium">
          {{ stage.label }}
          <Badge :variant="BADGE_VARIANTS[stage.status]">{{ stage.statusLabel }}</Badge>
        </h3>
        <dl class="mt-2 grid gap-1.5 text-sm">
          <div v-if="stage.blockedByDerivedCleanup" class="text-muted-foreground" role="status">
            Waiting for derived cleanup. The server status remains
            {{ stage.statusLabel.toLowerCase() }}.
          </div>
          <div class="flex flex-wrap justify-between gap-2">
            <dt class="text-muted-foreground">Started</dt>
            <dd class="text-end">
              <time v-if="stage.startedAt" :datetime="stage.startedAt">{{
                formatRetentionDate(stage.startedAt)
              }}</time>
              <span v-else>Not recorded</span>
            </dd>
          </div>
          <div class="flex flex-wrap justify-between gap-2">
            <dt class="text-muted-foreground">Completed</dt>
            <dd class="text-end">
              <time v-if="stage.completedAt" :datetime="stage.completedAt">{{
                formatRetentionDate(stage.completedAt)
              }}</time>
              <span v-else>Not recorded</span>
            </dd>
          </div>
          <div v-if="stage.errorMessage" class="text-destructive" role="alert">
            {{ stage.errorMessage }}
          </div>
        </dl>
      </li>
    </ol>
  </section>
</template>
