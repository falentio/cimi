<script setup lang="ts">
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
      <CardContent class="min-w-0">
        <Table>
          <caption class="sr-only">
            Cleanup stages register
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Stage</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col">Started</TableHead>
              <TableHead scope="col" class="text-right">Completed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="stage in cleanup.stages" :key="stage.kind">
              <TableCell class="font-medium">{{ stage.label }}</TableCell>
              <TableCell class="min-w-0">
                <Badge :variant="BADGE_VARIANTS[stage.status]">{{ stage.statusLabel }}</Badge>
                <div
                  v-if="stage.blockedByDerivedCleanup"
                  class="text-muted-foreground mt-1 text-xs"
                  role="status"
                >
                  Waiting for derived cleanup. The server status remains
                  {{ stage.statusLabel.toLowerCase() }}.
                </div>
                <div v-if="stage.errorMessage" class="text-destructive mt-1 text-xs" role="alert">
                  {{ stage.errorMessage }}
                </div>
              </TableCell>
              <TableCell class="tabular-nums">
                <time v-if="stage.startedAt" :datetime="stage.startedAt">{{
                  formatRetentionDate(stage.startedAt)
                }}</time>
                <span v-else class="text-muted-foreground">Not recorded</span>
              </TableCell>
              <TableCell class="text-right tabular-nums">
                <time v-if="stage.completedAt" :datetime="stage.completedAt">{{
                  formatRetentionDate(stage.completedAt)
                }}</time>
                <span v-else class="text-muted-foreground">Not recorded</span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </section>
</template>
