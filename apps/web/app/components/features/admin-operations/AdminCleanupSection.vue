<script setup lang="ts">
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { AdminCleanupProjection } from './admin-operations.utils'

defineProps<{
  cleanup: AdminCleanupProjection
}>()
</script>

<template>
  <section aria-labelledby="admin-cleanup-title" class="space-y-3">
    <div>
      <h2 id="admin-cleanup-title" class="text-lg font-semibold tracking-tight">Cleanup status</h2>
      <p class="text-muted-foreground text-sm">Cleanup stages run in the documented order.</p>
    </div>

    <Alert v-if="cleanup.pending">
      <AlertTitle>Cleanup is pending</AlertTitle>
      <AlertDescription>Backup cleanup waits until derived cleanup is complete.</AlertDescription>
    </Alert>

    <Card>
      <CardHeader>
        <CardTitle>Cleanup stages</CardTitle>
        <CardDescription>Status and safe timestamps for each stage.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl class="grid gap-4 sm:grid-cols-2">
          <div
            v-for="stage in cleanup.stages"
            :key="stage.kind"
            class="min-w-0 rounded-md border p-4"
          >
            <dt class="font-medium">{{ stage.label }}</dt>
            <dd class="mt-3 space-y-2 text-sm">
              <div class="flex flex-wrap justify-between gap-2">
                <span class="text-muted-foreground">Status</span>
                <span class="font-medium">{{ stage.statusLabel }}</span>
              </div>
              <div class="flex flex-wrap justify-between gap-2">
                <span class="text-muted-foreground">Started</span>
                <time
                  v-if="stage.startedAt"
                  :datetime="stage.startedAt"
                  class="break-words text-end"
                >
                  {{ stage.startedAt }}
                </time>
                <span v-else>Not recorded</span>
              </div>
              <div class="flex flex-wrap justify-between gap-2">
                <span class="text-muted-foreground">Completed</span>
                <time
                  v-if="stage.completedAt"
                  :datetime="stage.completedAt"
                  class="break-words text-end"
                >
                  {{ stage.completedAt }}
                </time>
                <span v-else>Not recorded</span>
              </div>
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  </section>
</template>
