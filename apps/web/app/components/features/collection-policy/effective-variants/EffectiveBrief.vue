<script setup lang="ts">
import { computed } from 'vue'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import type { CollectionPolicyEditorView } from '../collection-policy.types'
import { effectiveGroups, type EffectiveGroup } from './effective-rows'

const props = defineProps<{ editor: CollectionPolicyEditorView }>()

const groups = computed(() => effectiveGroups(props.editor))

function summarize(group: EffectiveGroup): string {
  return group.rows.map((row) => `${row.label} · ${row.value}`).join('  ·  ')
}
</script>

<template>
  <div class="min-w-0 rounded-lg border p-4">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <h4 class="font-medium">Effective collection policy</h4>
      <Badge :variant="editor.hasOverride ? 'secondary' : 'outline'">
        {{ editor.hasOverride ? 'Site override' : 'Inherited' }}
      </Badge>
    </div>

    <dl class="mt-3 grid gap-2 text-sm">
      <div v-for="group in groups" :key="group.id" class="min-w-0">
        <dt class="text-muted-foreground">{{ group.title }}</dt>
        <dd class="mt-0.5 break-words">{{ summarize(group) }}</dd>
      </div>
    </dl>

    <Accordion type="single" collapsible class="mt-4">
      <AccordionItem value="all">
        <AccordionTrigger>Show every field</AccordionTrigger>
        <AccordionContent>
          <div v-for="group in groups" :key="group.id" class="mb-4 min-w-0 last:mb-0">
            <h5 class="text-sm font-medium">{{ group.title }}</h5>
            <dl class="mt-1 grid gap-1.5">
              <div
                v-for="row in group.rows"
                :key="row.field"
                class="flex flex-wrap justify-between gap-x-4 gap-y-0.5"
              >
                <dt class="text-muted-foreground min-w-0">{{ row.label }}</dt>
                <dd class="min-w-0 text-end break-words">{{ row.value }}</dd>
              </div>
            </dl>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </div>
</template>
