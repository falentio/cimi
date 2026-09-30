<script setup lang="ts">
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { RetentionCleanupView } from './retention-policy.types'
import { formatRetentionDate } from './retention-policy.utils'

defineProps<{ cleanup: RetentionCleanupView }>()
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
    <Card>
      <CardHeader>
        <CardTitle>Cleanup stages</CardTitle>
        <CardDescription
          >Safe statuses and timestamps from the retention policy response.</CardDescription
        >
      </CardHeader>
      <CardContent>
        <ol class="grid min-w-0 gap-4 sm:grid-cols-2">
          <li
            v-for="stage in cleanup.stages"
            :key="stage.kind"
            class="min-w-0 rounded-md border p-4"
          >
            <h3 class="font-medium">{{ stage.label }}</h3>
            <dl class="mt-3 grid gap-2 text-sm">
              <div class="flex flex-wrap justify-between gap-2">
                <dt class="text-muted-foreground">Status</dt>
                <dd class="text-end font-medium">{{ stage.statusLabel }}</dd>
              </div>
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
      </CardContent>
    </Card>
  </section>
</template>
