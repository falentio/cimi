<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import type { CollectionPolicyEditorView } from '../collection-policy.types'
import { effectiveGroups } from './effective-rows'

const props = defineProps<{ editor: CollectionPolicyEditorView }>()

const groups = computed(() => effectiveGroups(props.editor))
</script>

<template>
  <div class="grid min-w-0 gap-6">
    <section
      v-for="group in groups"
      :key="group.id"
      :aria-labelledby="`effective-${group.id}-title`"
      class="min-w-0"
    >
      <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h4 :id="`effective-${group.id}-title`" class="font-medium">{{ group.title }}</h4>
        <p class="text-muted-foreground text-xs">
          {{ group.rows.length }} {{ group.rows.length === 1 ? 'field' : 'fields' }}
        </p>
      </div>
      <p class="text-muted-foreground mt-1 text-sm">{{ group.blurb }}</p>

      <dl class="mt-3 grid gap-2">
        <div
          v-for="row in group.rows"
          :key="row.field"
          class="grid gap-1 border-b pb-2 last:border-b-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-x-4"
        >
          <dt class="min-w-0">
            <span class="font-medium">{{ row.label }}</span>
            <Badge class="ms-2 align-middle" variant="outline">
              {{ row.source === 'site' ? 'Site' : 'Installation' }}
            </Badge>
          </dt>
          <dd class="text-muted-foreground min-w-0 break-words">{{ row.value }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>
