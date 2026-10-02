<script setup lang="ts">
import { FieldDescription, FieldGroup } from '@/components/ui/field'
import type { CollectionFieldPatch, CollectionPolicyEditorView } from './collection-policy.types'
import { fieldErrorFor, MAX_LIST_LENGTH } from './collection-policy.utils'
import CollectionPolicyListField from './CollectionPolicyListField.vue'

const props = defineProps<{ editor: CollectionPolicyEditorView }>()

const emit = defineEmits<{ patch: [patch: CollectionFieldPatch] }>()
type ExclusionKey = 'hostnames' | 'paths' | 'countries' | 'ipRanges'

const EXCLUSION_SPECS = [
  {
    key: 'hostnames',
    id: 'collection-exclusion-hostnames',
    label: 'Excluded hostnames',
    description: 'Traffic from these hostnames creates no accepted record.',
    placeholder: 'internal.example.com',
  },
  {
    key: 'paths',
    id: 'collection-exclusion-paths',
    label: 'Excluded paths',
    description:
      'A path and everything below it. Traffic on these paths creates no accepted record.',
    placeholder: '/admin',
  },
  {
    key: 'countries',
    id: 'collection-exclusion-countries',
    label: 'Excluded countries',
    description:
      'Two-letter country codes. Traffic resolved to these countries creates no accepted record.',
    placeholder: 'AQ',
  },
  {
    key: 'ipRanges',
    id: 'collection-exclusion-ip-ranges',
    label: 'Excluded IP addresses and ranges',
    description:
      'An exclusion list, not stored traffic: requests from these addresses, CIDR blocks, or ranges create no accepted record.',
    placeholder: '203.0.113.0/24',
  },
] as const satisfies ReadonlyArray<{
  readonly key: ExclusionKey
  readonly id: string
  readonly label: string
  readonly description: string
  readonly placeholder: string
}>

function exclusionValues(key: ExclusionKey): readonly string[] {
  return props.editor.draft.exclusions[key]
}

function exclusionError(key: ExclusionKey): string | null {
  return fieldErrorFor(props.editor.validation, `exclusions.${key}`)
}

function handleUpdate(key: ExclusionKey, value: string[]): void {
  emit('patch', {
    field: 'exclusions',
    value: { ...props.editor.draft.exclusions, [key]: value },
  })
}
</script>

<template>
  <fieldset :disabled="editor.saving" class="min-w-0">
    <legend class="text-base font-medium">Exclusions</legend>
    <p class="text-muted-foreground mt-1 text-sm">
      A refused request creates no accepted record, no Visitor, no Identified User, and no Session.
    </p>

    <FieldGroup class="mt-4">
      <CollectionPolicyListField
        v-for="spec in EXCLUSION_SPECS"
        :id="spec.id"
        :key="spec.key"
        :label="spec.label"
        :description="spec.description"
        :placeholder="spec.placeholder"
        :model-value="exclusionValues(spec.key)"
        :error="exclusionError(spec.key)"
        :max="MAX_LIST_LENGTH"
        :disabled="editor.saving"
        @update:model-value="(value) => handleUpdate(spec.key, value)"
      />
      <FieldDescription>
        Every list is capped at {{ MAX_LIST_LENGTH }} entries and keeps the order you type.
      </FieldDescription>
    </FieldGroup>
  </fieldset>
</template>
