<script setup lang="ts">
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RETENTION_MONTH_FIELDS } from './retention-policy.utils'
import type { RetentionField, RetentionPolicyEditorView } from './retention-policy.types'

const props = defineProps<{ section: RetentionPolicyEditorView }>()

const emit = defineEmits<{ fieldChange: [field: RetentionField, value: string] }>()

function fieldError(field: RetentionField): string | undefined {
  if (props.section.validation.kind !== 'invalid') return undefined

  return props.section.validation.validation.fieldErrors[field]
}

function describedBy(field: RetentionField, id: string): string {
  return fieldError(field) === undefined ? `${id}-help` : `${id}-help ${id}-error`
}
</script>

<template>
  <fieldset :disabled="section.saving" class="min-w-0">
    <legend class="mb-4 text-sm font-medium">Installation default values</legend>
    <FieldGroup>
      <Field
        v-for="def in RETENTION_MONTH_FIELDS"
        :key="def.field"
        :data-invalid="fieldError(def.field) !== undefined"
      >
        <FieldLabel :for="def.id">{{ def.label }}</FieldLabel>
        <Input
          :id="def.id"
          :model-value="section.draft[def.field]"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          :aria-describedby="describedBy(def.field, def.id)"
          :aria-invalid="fieldError(def.field) !== undefined"
          @update:model-value="emit('fieldChange', def.field, String($event))"
        />
        <FieldDescription :id="`${def.id}-help`">{{ def.help }}</FieldDescription>
        <FieldError v-if="fieldError(def.field)" :id="`${def.id}-error`">
          {{ fieldError(def.field) }}
        </FieldError>
      </Field>
    </FieldGroup>
  </fieldset>
</template>
