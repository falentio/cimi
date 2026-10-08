<script setup lang="ts">
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RETENTION_MONTH_FIELDS } from './retention-policy.utils'
import type { ParsedRetentionDraft, RetentionDraft, RetentionField } from './retention-policy.types'

const props = defineProps<{
  legend: string
  draft: RetentionDraft
  validation: ParsedRetentionDraft
  disabled: boolean
}>()

const emit = defineEmits<{ fieldChange: [field: RetentionField, value: string] }>()

function fieldError(field: RetentionField): string | undefined {
  if (props.validation.kind !== 'invalid') return undefined

  return props.validation.validation.fieldErrors[field]
}

function describedBy(field: RetentionField, id: string): string {
  return fieldError(field) === undefined ? `${id}-help` : `${id}-help ${id}-error`
}
</script>

<template>
  <fieldset :disabled="disabled" class="min-w-0">
    <legend class="mb-4 text-sm font-medium">{{ legend }}</legend>
    <FieldGroup>
      <Field
        v-for="def in RETENTION_MONTH_FIELDS"
        :key="def.field"
        :data-invalid="fieldError(def.field) !== undefined"
      >
        <FieldLabel :for="def.id">{{ def.label }}</FieldLabel>
        <Input
          :id="def.id"
          :model-value="draft[def.field]"
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
