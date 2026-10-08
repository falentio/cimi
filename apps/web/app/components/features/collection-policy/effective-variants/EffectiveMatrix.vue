<script setup lang="ts">
import { computed } from 'vue'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { CollectionPolicyEditorView } from '../collection-policy.types'
import { effectiveGroups } from './effective-rows'

const props = defineProps<{ editor: CollectionPolicyEditorView }>()

const groups = computed(() => effectiveGroups(props.editor))
</script>

<template>
  <Table>
    <TableCaption>
      {{
        editor.hasOverride
          ? 'The server resolves this Site override for every request.'
          : 'No Site override is stored, so every field comes from the installation default.'
      }}
    </TableCaption>
    <TableHeader>
      <TableRow>
        <TableHead scope="col">Field</TableHead>
        <TableHead scope="col">Effective value</TableHead>
        <TableHead scope="col">Source</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <template v-for="group in groups" :key="group.id">
        <TableRow class="hover:bg-transparent">
          <TableHead
            scope="colgroup"
            :colspan="3"
            class="text-muted-foreground h-8 text-xs font-medium tracking-wide uppercase"
          >
            {{ group.title }}
          </TableHead>
        </TableRow>
        <TableRow v-for="row in group.rows" :key="row.field">
          <TableCell class="font-medium whitespace-normal">{{ row.label }}</TableCell>
          <TableCell class="whitespace-normal">{{ row.value }}</TableCell>
          <TableCell class="text-muted-foreground whitespace-normal">
            {{ row.source === 'site' ? 'Site' : 'Installation' }}
          </TableCell>
        </TableRow>
      </template>
    </TableBody>
  </Table>
</template>
