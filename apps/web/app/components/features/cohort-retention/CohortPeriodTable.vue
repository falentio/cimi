<script setup lang="ts">
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { CohortReportRow } from './cohort-retention.types'

defineProps<{
  readonly rows: readonly CohortReportRow[]
}>()
</script>

<template>
  <Table>
    <TableCaption>
      Every period is listed, including periods the cohort retained no one in.
    </TableCaption>
    <TableHeader>
      <TableRow>
        <TableHead class="w-12">#</TableHead>
        <TableHead>Period</TableHead>
        <TableHead class="text-right">Cohort size</TableHead>
        <TableHead class="text-right">Retained</TableHead>
        <TableHead class="text-right">Retention rate</TableHead>
        <TableHead class="text-right">Compared with previous</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow v-for="row in rows" :key="row.index">
        <TableCell>{{ row.index + 1 }}</TableCell>
        <TableCell>{{ row.fromDate }} to {{ row.toDate }}</TableCell>
        <TableCell class="text-right">{{ row.size }}</TableCell>
        <TableCell class="text-right">{{ row.retained }}</TableCell>
        <TableCell class="text-right">{{ row.rateLabel }}</TableCell>
        <TableCell class="text-right">{{ row.comparisonRateLabel ?? '—' }}</TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>
