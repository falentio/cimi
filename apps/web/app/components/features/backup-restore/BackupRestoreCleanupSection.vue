<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { CleanupSectionView } from './backup-restore.types'
import { formatBackupDate } from './backup-restore.utils'

defineProps<{ section: CleanupSectionView }>()
</script>

<template>
  <section
    v-if="section.kind === 'visible'"
    aria-labelledby="backup-cleanup-title"
    class="space-y-3"
  >
    <div>
      <h2 id="backup-cleanup-title" class="text-lg font-semibold tracking-tight">Cleanup stages</h2>
      <p class="text-muted-foreground text-sm">
        Derived cleanup runs before backup cleanup. Each stage keeps its own status and timestamps.
      </p>
    </div>
    <Card v-if="section.pending">
      <CardContent class="py-4 text-sm">
        <p class="font-medium">Cleanup is still pending</p>
        <p class="text-muted-foreground">
          Backup and restore actions stay locked until cleanup finishes.
        </p>
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle class="sr-only">Cleanup stage details</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div
          v-for="stage in section.stages"
          :key="stage.kind"
          class="border-b pb-4 last:border-b-0 last:pb-0"
        >
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 class="font-medium">{{ stage.label }}</h3>
            </div>
            <span class="text-muted-foreground text-sm">{{ stage.statusLabel }}</span>
          </div>
          <dl class="text-muted-foreground mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt>Started</dt>
              <dd>
                <time v-if="stage.startedAt" :datetime="stage.startedAt">
                  {{ formatBackupDate(stage.startedAt) }}
                </time>
                <span v-else>Not started</span>
              </dd>
            </div>
            <div>
              <dt>Completed</dt>
              <dd>
                <time v-if="stage.completedAt" :datetime="stage.completedAt">
                  {{ formatBackupDate(stage.completedAt) }}
                </time>
                <span v-else>Not completed</span>
              </dd>
            </div>
          </dl>
          <p v-if="stage.error" class="text-destructive mt-2 text-sm" role="alert">
            {{ stage.error.message }}
          </p>
        </div>
      </CardContent>
    </Card>
  </section>
</template>
