<script setup lang="ts">
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { AdminCleanupProjection, AdminCleanupStageProjection } from './admin-operations.utils'

defineProps<{
  cleanup: AdminCleanupProjection
}>()

function stageBadgeVariant(stage: AdminCleanupStageProjection) {
  if (stage.status === 'failed') return 'destructive'
  if (stage.status === 'running' || stage.status === 'completed') return 'secondary'
  return 'outline'
}
</script>

<template>
  <section aria-labelledby="admin-cleanup-title">
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 id="admin-cleanup-title" class="text-lg font-semibold tracking-tight">
            Cleanup status
          </h2>
        </CardTitle>
        <CardDescription>Cleanup stages run in the documented order.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-3">
        <Alert v-if="cleanup.pending">
          <AlertTitle>Cleanup is pending</AlertTitle>
          <AlertDescription
            >Backup cleanup waits until derived cleanup is complete.</AlertDescription
          >
        </Alert>

        <dl class="divide-y rounded-lg border text-sm">
          <template v-for="stage in cleanup.stages" :key="stage.kind">
            <div class="grid grid-cols-[10rem_1fr] items-center gap-3 px-4 py-2.5">
              <dt class="text-xs font-medium">{{ stage.label }}</dt>
              <dd>
                <Badge :variant="stageBadgeVariant(stage)">{{ stage.statusLabel }}</Badge>
              </dd>
            </div>
            <div class="grid grid-cols-[10rem_1fr] items-center gap-3 px-4 py-2.5">
              <dt class="text-muted-foreground text-xs">Started</dt>
              <dd class="font-medium">
                <time v-if="stage.startedAt" :datetime="stage.startedAt" class="break-words">
                  {{ stage.startedAt }}
                </time>
                <span v-else>Not recorded</span>
              </dd>
            </div>
            <div class="grid grid-cols-[10rem_1fr] items-center gap-3 px-4 py-2.5">
              <dt class="text-muted-foreground text-xs">Completed</dt>
              <dd class="font-medium">
                <time v-if="stage.completedAt" :datetime="stage.completedAt" class="break-words">
                  {{ stage.completedAt }}
                </time>
                <span v-else>Not recorded</span>
              </dd>
            </div>
          </template>
        </dl>
      </CardContent>
    </Card>
  </section>
</template>
