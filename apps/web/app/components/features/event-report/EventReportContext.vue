<script setup lang="ts">
import { HugeiconsIcon } from '@hugeicons/vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { EventKindDescriptor, EventReportContextItem } from './event-report.types'

const props = defineProps<{
  readonly context: readonly EventReportContextItem[]
  readonly eventKinds: readonly EventKindDescriptor[]
}>()
</script>

<template>
  <Card size="sm" class="min-w-0">
    <CardHeader>
      <CardTitle><h3>Report context</h3></CardTitle>
      <CardDescription>Inputs defined by the Event-report contract.</CardDescription>
    </CardHeader>
    <CardContent class="flex min-w-0 flex-col gap-5">
      <dl class="grid min-w-0 gap-3 sm:grid-cols-3">
        <div
          v-for="item in props.context"
          :key="item.label"
          class="bg-muted/35 min-w-0 rounded-lg border border-border/60 px-3 py-3"
        >
          <dt class="text-muted-foreground text-xs font-medium">{{ item.label }}</dt>
          <dd class="mt-1 text-sm font-medium">{{ item.value }}</dd>
          <dd class="text-muted-foreground mt-1 text-xs leading-relaxed">{{ item.detail }}</dd>
        </div>
      </dl>

      <div class="flex min-w-0 flex-col gap-3">
        <h4 class="cn-font-heading text-sm font-medium">Supported event kinds</h4>
        <ul class="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <li v-for="eventKind in props.eventKinds" :key="eventKind.kind" class="min-w-0">
            <div
              class="flex min-w-0 items-center gap-2 rounded-lg border border-border/60 px-3 py-2.5"
            >
              <span
                class="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-md"
              >
                <HugeiconsIcon :icon="eventKind.icon" aria-hidden="true" />
              </span>
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium">{{ eventKind.label }}</span>
                <code class="text-muted-foreground block truncate text-xs">{{
                  eventKind.kind
                }}</code>
              </span>
            </div>
            <span class="sr-only">{{ eventKind.description }}</span>
          </li>
        </ul>
      </div>
    </CardContent>
  </Card>
</template>
