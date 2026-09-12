<script setup lang="ts">
import { Card, CardContent } from '@/components/ui/card'
import BreakdownSectionHeader from './BreakdownSectionHeader.vue'
import type { BreakdownTabChange, VisibleBreakdownSection } from './site-overview.types'

const props = defineProps<{
  readonly sections: readonly VisibleBreakdownSection[]
}>()

const emit = defineEmits<{
  tabChange: [payload: BreakdownTabChange]
}>()
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2">
    <Card v-for="section in props.sections" :key="section.id" size="sm" class="min-w-0">
      <BreakdownSectionHeader :section="section" @tab-change="emit('tabChange', $event)" />
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
