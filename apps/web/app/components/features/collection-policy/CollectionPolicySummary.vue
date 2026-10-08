<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import type {
  CollectionPolicyEditorView,
  PolicyField,
  PolicyProvenance,
} from './collection-policy.types'
import {
  describeEffectiveField,
  POLICY_FIELD_LABELS,
  POLICY_FIELD_META,
} from './collection-policy.utils'

const props = defineProps<{ editor: CollectionPolicyEditorView }>()

type SummaryRow = {
  readonly field: PolicyField
  readonly label: string
  readonly value: string
  readonly source: PolicyProvenance
}

const rows = computed<readonly SummaryRow[]>(() =>
  POLICY_FIELD_META.map((meta) => ({
    field: meta.field,
    label: POLICY_FIELD_LABELS[meta.field],
    value: describeEffectiveField(props.editor.effective, meta.field),
    source: props.editor.source[meta.field],
  })),
)
</script>

<template>
  <div class="min-w-0 rounded-lg border p-4">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <h4 class="font-medium">Effective collection policy</h4>
      <Badge :variant="editor.hasOverride ? 'secondary' : 'outline'">
        {{ editor.hasOverride ? 'Site override' : 'Inherited from installation' }}
      </Badge>
    </div>
    <p class="text-muted-foreground mt-1 text-sm">
      This is what the server resolves for this Site right now.
      <template v-if="editor.hasOverride">
        The Site override replaces the whole Site layer, so every field below belongs to it.
      </template>
      <template v-else>
        No Site override is stored, so every field comes from the installation default.
      </template>
    </p>
    <dl class="mt-4 grid gap-3 text-sm">
      <div
        v-for="row in rows"
        :key="row.field"
        class="flex flex-wrap items-start justify-between gap-2 border-b pb-3 last:border-b-0 last:pb-0"
      >
        <dt class="text-muted-foreground min-w-0">
          {{ row.label }}
          <Badge class="ms-2 align-middle" variant="outline">
            {{ row.source === 'site' ? 'Site' : 'Installation' }}
          </Badge>
        </dt>
        <dd class="min-w-0 max-w-full text-end font-medium break-words sm:max-w-[60%]">
          {{ row.value }}
        </dd>
      </div>
    </dl>
  </div>
</template>
