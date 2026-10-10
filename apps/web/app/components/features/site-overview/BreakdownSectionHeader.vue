<script setup lang="ts">
import { HugeiconsIcon } from '@hugeicons/vue'
import { Button } from '@/components/ui/button'
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { BreakdownTabChange, OverviewBreakdownSectionView } from './site-overview.types'

const props = defineProps<{
  readonly section: OverviewBreakdownSectionView
}>()

const emit = defineEmits<{
  tabChange: [payload: BreakdownTabChange]
}>()
</script>

<template>
  <CardHeader class="gap-3">
    <div class="flex min-w-0 items-start gap-2.5">
      <span
        class="bg-muted text-muted-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md"
      >
        <HugeiconsIcon :icon="props.section.icon" :size="15" aria-hidden="true" />
      </span>
      <div class="min-w-0">
        <div class="flex min-w-0 items-center gap-1.5">
          <CardTitle class="truncate text-sm">{{ props.section.title }}</CardTitle>
          <span
            v-if="props.section.status === 'stale'"
            class="text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-border ring-inset"
          >
            Stale
          </span>
        </div>
        <CardDescription class="mt-0.5 text-xs">{{ props.section.subtitle }}</CardDescription>
      </div>
    </div>
    <div role="group" :aria-label="`${props.section.title} views`" class="flex flex-wrap gap-1">
      <Button
        v-for="tab in props.section.tabs"
        :key="tab.id"
        type="button"
        size="xs"
        variant="ghost"
        :aria-pressed="props.section.activeTab === tab.id"
        :class="
          props.section.activeTab === tab.id ? 'bg-muted text-foreground' : 'text-muted-foreground'
        "
        @click="emit('tabChange', { sectionId: props.section.id, tabId: tab.id })"
      >
        {{ tab.label }}
      </Button>
    </div>
  </CardHeader>
</template>
