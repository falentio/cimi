<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { CohortDefinitionsLoadState, CohortOption, SCohort } from './cohort-retention.types'

const props = defineProps<{
  readonly state: CohortDefinitionsLoadState
  readonly options: readonly CohortOption[]
  readonly emptyHint: string | null
  readonly archiveSubmittingId: string | undefined
}>()

const emit = defineEmits<{
  (event: 'edit', cohortId: string): void
  (event: 'archive', cohortId: string): void
}>()

const rows = computed<readonly SCohort[]>(() => {
  const state = props.state

  return state.status === 'ready' || state.status === 'refreshing' || state.status === 'stale-error'
    ? state.definitions
    : []
})

const loading = computed(() => props.state.status === 'loading')

const idle = computed(() => props.state.status === 'idle')
</script>

<template>
  <section class="flex w-full min-w-0 flex-col gap-3">
    <h3 class="text-sm font-medium">Cohort definitions</h3>

    <Skeleton v-if="loading" class="h-24 w-full" />

    <p v-else-if="idle" class="text-muted-foreground text-sm">
      Choose a site to load its cohort definitions.
    </p>

    <template v-else-if="rows.length > 0">
      <Table>
        <TableCaption>Definitions stay reportable after they are archived.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Identity</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Status</TableHead>
            <TableHead class="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="cohort in rows" :key="cohort.id">
            <TableCell class="font-medium">{{ cohort.name }}</TableCell>
            <TableCell>
              {{ cohort.identityKind === 'visitor' ? 'Visitors' : 'Identified users' }}
            </TableCell>
            <TableCell>{{ cohort.period }}</TableCell>
            <TableCell>
              <Badge :variant="cohort.status === 'active' ? 'secondary' : 'outline'">
                {{ cohort.status }}
              </Badge>
            </TableCell>
            <TableCell class="text-right">
              <div class="flex justify-end gap-2">
                <UIButton variant="ghost" size="sm" @click="emit('edit', cohort.id)">Edit</UIButton>
                <UIButton
                  v-if="cohort.status === 'active'"
                  variant="ghost"
                  size="sm"
                  :disabled="archiveSubmittingId === cohort.id"
                  @click="emit('archive', cohort.id)"
                >
                  {{ archiveSubmittingId === cohort.id ? 'Archiving…' : 'Archive' }}
                </UIButton>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </template>

    <Empty v-else-if="emptyHint !== null">
      <EmptyHeader>
        <EmptyTitle>No cohort definitions yet</EmptyTitle>
        <EmptyDescription>{{ emptyHint }}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  </section>
</template>
