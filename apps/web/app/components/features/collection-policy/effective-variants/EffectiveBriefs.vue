<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { CollectionPolicyEditorView } from '../collection-policy.types'
import { effectiveGroups } from './effective-rows'

const props = defineProps<{ editor: CollectionPolicyEditorView }>()

const groups = computed(() => effectiveGroups(props.editor))

function layerLabel(group: (typeof groups.value)[number]): string {
  const sources = new Set(group.rows.map((row) => row.source))

  return sources.size === 1 && sources.has('site') ? 'Site' : 'Installation'
}
</script>

<template>
  <div class="grid min-w-0 gap-4">
    <Card v-for="group in groups" :key="group.id" size="sm">
      <CardHeader>
        <CardTitle
          ><h4>{{ group.title }}</h4></CardTitle
        >
        <CardDescription>{{ group.blurb }}</CardDescription>
      </CardHeader>
      <CardContent class="grid gap-3">
        <p v-for="row in group.rows" :key="row.field" class="min-w-0">
          <span class="font-medium">{{ row.label }}.</span>
          {{ row.description }}
          <span class="text-muted-foreground">{{ row.value }}.</span>
        </p>
        <Badge variant="outline" class="w-fit">{{ layerLabel(group) }} layer</Badge>
      </CardContent>
    </Card>
  </div>
</template>
