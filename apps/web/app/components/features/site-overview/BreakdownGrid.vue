<script setup lang="ts">
import { HugeiconsIcon } from '@hugeicons/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { BreakdownId, BreakdownTabId, VisibleBreakdownSection } from './site-overview.types'

const props = defineProps<{
  readonly sections: readonly VisibleBreakdownSection[]
}>()

const emit = defineEmits<{
  tabChange: [payload: { sectionId: BreakdownId; tabId: BreakdownTabId }]
}>()

function selectTab(sectionId: BreakdownId, tabId: BreakdownTabId): void {
  emit('tabChange', { sectionId, tabId })
}
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2">
    <Card v-for="section in props.sections" :key="section.id" size="sm" class="min-w-0">
      <CardHeader class="gap-3">
        <div class="flex items-start justify-between gap-3">
          <div class="flex min-w-0 items-start gap-2.5">
            <span
              class="bg-muted text-muted-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md"
            >
              <HugeiconsIcon :icon="section.icon" :size="15" aria-hidden="true" />
            </span>
            <div class="min-w-0">
              <CardTitle class="truncate text-sm">{{ section.title }}</CardTitle>
              <CardDescription class="mt-0.5 text-xs">{{ section.subtitle }}</CardDescription>
            </div>
          </div>
        </div>
        <div role="group" :aria-label="`${section.title} views`" class="flex flex-wrap gap-1">
          <Button
            v-for="tab in section.tabs"
            :key="tab.id"
            type="button"
            size="xs"
            variant="ghost"
            :aria-pressed="section.activeTab === tab.id"
            :class="
              section.activeTab === tab.id ? 'bg-muted text-foreground' : 'text-muted-foreground'
            "
            @click="selectTab(section.id, tab.id)"
          >
            {{ tab.label }}
          </Button>
        </div>
      </CardHeader>
      <CardContent class="pt-0">
        <p v-if="section.rows.length === 0" class="text-muted-foreground py-4 text-sm">
          No data for this view.
        </p>
        <ul v-else class="flex flex-col gap-2" :aria-label="`${section.title} rankings`">
          <li v-for="row in section.rows" :key="row.id">
            <div class="bg-muted/45 relative overflow-hidden rounded-lg border border-border/60">
              <div
                class="bg-primary/10 absolute inset-y-0 start-0"
                :style="{ width: `${row.share}%` }"
                aria-hidden="true"
              />
              <div
                class="relative flex min-w-0 items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span class="min-w-0 truncate">{{ row.label }}</span>
                <span class="flex shrink-0 items-center gap-2 tabular-nums">
                  <span class="text-muted-foreground text-xs">{{ row.share }}%</span>
                  <span class="font-medium">{{ row.value }}</span>
                </span>
              </div>
            </div>
          </li>
        </ul>
      </CardContent>
    </Card>
  </div>
</template>
