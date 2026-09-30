<script setup lang="ts">
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { BackupListSectionView, BackupRowView } from './backup-restore.types'
import { formatBackupDate } from './backup-restore.utils'

defineProps<{ section: BackupListSectionView }>()

const emit = defineEmits<{
  restore: [backupId: BackupRowView['id']]
  loadMore: []
  refresh: []
}>()

function sourceBackupCountLabel(count: number): string {
  return `${count} source backup${count === 1 ? '' : 's'}`
}
</script>

<template>
  <section aria-labelledby="backup-history-title" class="space-y-3">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="backup-history-title" class="text-lg font-semibold tracking-tight">
          Source backup history
        </h2>
        <p class="text-muted-foreground text-sm">
          Restore candidates come from source backups returned by the server.
        </p>
      </div>
      <Button type="button" size="sm" variant="outline" @click="emit('refresh')">
        Refresh history
      </Button>
    </div>

    <Card v-if="section.kind === 'loading'">
      <CardContent class="flex items-center gap-2 py-6 text-sm">
        <Spinner aria-hidden="true" />
        Loading source backup history
      </CardContent>
    </Card>

    <Empty v-else-if="section.kind === 'empty'" class="min-h-48 border border-dashed">
      <EmptyHeader>
        <EmptyTitle>No source backups yet</EmptyTitle>
        <EmptyDescription>
          Create a source backup before you need to recover this installation.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>

    <Alert v-else-if="section.kind === 'error'" variant="destructive">
      <AlertTitle>Backup history could not be loaded</AlertTitle>
      <AlertDescription>{{ section.message }}</AlertDescription>
      <Button class="mt-3" type="button" size="sm" variant="outline" @click="emit('refresh')">
        Refresh history
      </Button>
    </Alert>

    <template v-else>
      <Alert v-if="section.kind === 'stale'" variant="destructive">
        <AlertTitle>Showing the last known backup history</AlertTitle>
        <AlertDescription>{{ section.message }}</AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>
            <span v-if="section.kind === 'ready'">{{
              sourceBackupCountLabel(section.totalCount)
            }}</span>
            <span v-else>Last known source backups</span>
          </CardTitle>
        </CardHeader>
        <CardContent class="p-0">
          <Table class="min-w-[42rem]">
            <TableCaption>Source backups and their current server-reported status.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Created</TableHead>
                <TableHead scope="col">Operation</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Phase</TableHead>
                <TableHead scope="col" class="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="row in section.rows" :key="row.id">
                <TableCell>
                  <time :datetime="row.createdAt">{{ formatBackupDate(row.createdAt) }}</time>
                </TableCell>
                <TableCell>{{ row.operationLabel }}</TableCell>
                <TableCell>
                  <span>{{ row.statusLabel }}</span>
                  <span
                    v-if="row.progressPercent !== null"
                    class="text-muted-foreground block text-xs"
                  >
                    {{ row.progressPercent }}% complete
                  </span>
                </TableCell>
                <TableCell>{{ row.phaseLabel }}</TableCell>
                <TableCell class="text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    :disabled="row.restore !== 'available'"
                    :aria-label="
                      row.restore === 'available'
                        ? 'Restore this backup'
                        : (row.restoreDisabledReason ?? 'Restore unavailable')
                    "
                    @click="emit('restore', row.id)"
                  >
                    Restore
                  </Button>
                </TableCell>
              </TableRow>
              <TableRow v-if="section.rows.length === 0">
                <TableCell colspan="5" class="text-muted-foreground text-center">
                  No source backups are available.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div v-if="section.kind === 'ready'" class="flex flex-wrap items-center gap-3">
        <Button
          v-if="section.hasMore"
          type="button"
          variant="outline"
          :disabled="section.loadingMore"
          @click="emit('loadMore')"
        >
          <Spinner v-if="section.loadingMore" aria-hidden="true" />
          {{ section.loadingMore ? 'Loading more' : 'Load more' }}
        </Button>
        <span v-if="section.refreshing" class="text-muted-foreground text-sm">
          Refreshing history
        </span>
      </div>
    </template>
  </section>
</template>
