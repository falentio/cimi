<script setup lang="ts">
import { Activity01Icon, Chart01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import {
  Table,
  TableBody,
  TableCaption,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import type { EventReportOperationDescriptor } from './event-report.types'

const props = defineProps<{
  readonly operations: readonly EventReportOperationDescriptor[]
}>()
</script>

<template>
  <Card class="min-w-0">
    <CardHeader>
      <CardTitle><h3>Event volume</h3></CardTitle>
      <CardDescription>Accepted Events grouped into bounded hourly buckets.</CardDescription>
    </CardHeader>
    <CardContent class="min-w-0 pt-0">
      <div
        class="bg-muted/20 flex min-h-56 min-w-0 items-center justify-center rounded-lg border border-dashed"
        role="img"
        aria-label="Event volume is not measured because the Event-report procedures are contract-only."
      >
        <Empty class="min-h-56 border-0 p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon" class="bg-muted text-muted-foreground">
              <HugeiconsIcon :icon="Chart01Icon" aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Event volume is not available yet</EmptyTitle>
            <EmptyDescription
              >Hourly buckets will appear when this report is served.</EmptyDescription
            >
          </EmptyHeader>
        </Empty>
      </div>
    </CardContent>
  </Card>

  <Card class="min-w-0">
    <CardHeader>
      <CardTitle><h3>Accepted event explorer</h3></CardTitle>
      <CardDescription>Bounded, typed fields for authenticated Event exploration.</CardDescription>
    </CardHeader>
    <CardContent class="flex min-w-0 flex-col gap-4 pt-0">
      <Table class="min-w-[36rem]">
        <TableCaption>Accepted Events will be ordered by Occurrence Time.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Occurred</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Event</TableHead>
            <TableHead>Page context</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableEmpty :colspan="4">
            <Empty class="min-h-24 border-0 p-0">
              <EmptyHeader>
                <EmptyMedia variant="icon" class="bg-muted text-muted-foreground">
                  <HugeiconsIcon :icon="Activity01Icon" aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Event explorer is not connected yet</EmptyTitle>
                <EmptyDescription>
                  Rows will appear when the read-only list procedure is served.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </TableEmpty>
        </TableBody>
      </Table>
      <p class="text-muted-foreground text-xs leading-relaxed">
        The backend orders pages by Occurrence Time. Event ID is the final tie-breaker when two
        accepted Events share the same occurrence timestamp. Receipt Time is not a reporting sort
        mode.
      </p>
    </CardContent>
  </Card>

  <Card size="sm" class="min-w-0">
    <CardHeader>
      <CardTitle><h3>Report surface</h3></CardTitle>
      <CardDescription
        >Authenticated, read-only procedures reserved by the contract.</CardDescription
      >
    </CardHeader>
    <CardContent class="flex min-w-0 flex-col gap-4">
      <ul class="grid min-w-0 gap-2 sm:grid-cols-2">
        <li
          v-for="operation in props.operations"
          :key="operation.name"
          class="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5"
        >
          <div class="min-w-0">
            <code class="block truncate text-xs font-medium">{{ operation.name }}</code>
            <span class="text-muted-foreground mt-1 block truncate text-xs">
              {{ operation.description }}
            </span>
          </div>
          <Badge variant="outline" class="shrink-0">Read</Badge>
        </li>
      </ul>
      <Separator />
      <p class="text-muted-foreground text-xs leading-relaxed">
        Privacy boundary. The explorer exposes only bounded, allowlisted Event fields. It does not
        expose user or device identity, raw IP, sensitive query strings, traits, replay, or
        arbitrary nested properties.
      </p>
    </CardContent>
  </Card>
</template>
