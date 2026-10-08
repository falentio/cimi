<script setup lang="ts">
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import {
  fieldErrorFor,
  MAX_KEY_LIST_LENGTH,
  MAX_PROPERTIES,
  MAX_VALUE_LENGTH,
  PROPERTY_SWITCH_SPECS,
  switchStateLabel,
} from './collection-policy.utils'
import type { CollectionFieldPatch, CollectionPolicyEditorView } from './collection-policy.types'
import CollectionPolicyListField from './CollectionPolicyListField.vue'

const props = defineProps<{ editor: CollectionPolicyEditorView }>()

const emit = defineEmits<{ patch: [patch: CollectionFieldPatch] }>()

function propertyValue(): CollectionPolicyEditorView['draft']['propertyPolicy'] {
  return props.editor.draft.propertyPolicy
}

type PropertyKey = 'allowScalarProperties' | 'maxProperties' | 'maxValueLength' | 'reservedNames'

function propertyError(field: PropertyKey): string | null {
  return fieldErrorFor(props.editor.validation, `propertyPolicy.${field}`)
}

function handleAllowProperties(value: unknown): void {
  emit('patch', {
    field: 'propertyPolicy',
    value: { ...propertyValue(), allowScalarProperties: value === true },
  })
}

function handleMaxProperties(value: number | null): void {
  emit('patch', { field: 'propertyPolicy', value: { ...propertyValue(), maxProperties: value } })
}

function handleMaxValueLength(value: number | null): void {
  emit('patch', { field: 'propertyPolicy', value: { ...propertyValue(), maxValueLength: value } })
}

function handleReservedNames(value: string[]): void {
  emit('patch', { field: 'propertyPolicy', value: { ...propertyValue(), reservedNames: value } })
}
</script>

<template>
  <fieldset :disabled="editor.saving" class="min-w-0">
    <legend class="text-base font-medium">Custom properties</legend>
    <p class="text-muted-foreground mt-1 text-sm">
      Properties are never captured wholesale: only scalar values pass, and every limit below is
      enforced by the server.
    </p>

    <FieldGroup class="mt-4">
      <Field
        v-for="spec in PROPERTY_SWITCH_SPECS"
        :key="spec.field"
        orientation="responsive"
        :data-invalid="propertyError(spec.field) !== null"
      >
        <FieldContent>
          <FieldLabel :for="spec.id">{{ spec.label }}</FieldLabel>
          <FieldDescription :id="`${spec.id}-help`">{{ spec.description }}</FieldDescription>
        </FieldContent>
        <div class="flex items-center gap-2">
          <UISwitch
            :id="spec.id"
            :model-value="propertyValue().allowScalarProperties"
            :disabled="editor.saving"
            :aria-describedby="`${spec.id}-help`"
            @update:model-value="handleAllowProperties"
          />
          <span class="text-muted-foreground text-sm">
            {{ switchStateLabel(propertyValue().allowScalarProperties) }}
          </span>
        </div>
        <FieldError v-if="propertyError(spec.field)" :id="`${spec.id}-error`">
          {{ propertyError(spec.field) }}
        </FieldError>
      </Field>

      <Field
        :data-invalid="propertyError('maxProperties') !== null"
        :data-disabled="!propertyValue().allowScalarProperties"
      >
        <FieldLabel for="collection-property-max">Maximum properties per event</FieldLabel>
        <UINumberField
          id="collection-property-max"
          :model-value="propertyValue().maxProperties"
          :min="0"
          :max="MAX_PROPERTIES"
          :disabled="editor.saving || !propertyValue().allowScalarProperties"
          @update:model-value="handleMaxProperties"
        >
          <UINumberFieldContent>
            <UINumberFieldDecrement />
            <UINumberFieldInput
              :aria-describedby="
                propertyError('maxProperties') === null
                  ? 'collection-property-max-help'
                  : 'collection-property-max-help collection-property-max-error'
              "
              :aria-invalid="propertyError('maxProperties') !== null"
            />
            <UINumberFieldIncrement />
          </UINumberFieldContent>
        </UINumberField>
        <FieldDescription id="collection-property-max-help">
          A whole number from 0 to {{ MAX_PROPERTIES }}. Leave the field empty to see a validation
          error instead of saving 0.
        </FieldDescription>
        <FieldError v-if="propertyError('maxProperties')" id="collection-property-max-error">
          {{ propertyError('maxProperties') }}
        </FieldError>
      </Field>

      <Field
        :data-invalid="propertyError('maxValueLength') !== null"
        :data-disabled="!propertyValue().allowScalarProperties"
      >
        <FieldLabel for="collection-property-value-length">Maximum value length</FieldLabel>
        <UINumberField
          id="collection-property-value-length"
          :model-value="propertyValue().maxValueLength"
          :min="1"
          :max="MAX_VALUE_LENGTH"
          :disabled="editor.saving || !propertyValue().allowScalarProperties"
          @update:model-value="handleMaxValueLength"
        >
          <UINumberFieldContent>
            <UINumberFieldDecrement />
            <UINumberFieldInput
              :aria-describedby="
                propertyError('maxValueLength') === null
                  ? 'collection-property-value-length-help'
                  : 'collection-property-value-length-help collection-property-value-length-error'
              "
              :aria-invalid="propertyError('maxValueLength') !== null"
            />
            <UINumberFieldIncrement />
          </UINumberFieldContent>
        </UINumberField>
        <FieldDescription id="collection-property-value-length-help">
          Characters kept per string value, from 1 to {{ MAX_VALUE_LENGTH }}.
        </FieldDescription>
        <FieldError
          v-if="propertyError('maxValueLength')"
          id="collection-property-value-length-error"
        >
          {{ propertyError('maxValueLength') }}
        </FieldError>
      </Field>

      <CollectionPolicyListField
        id="collection-property-reserved"
        label="Reserved property names"
        description="Property names that are always dropped, even when scalar capture is on. Names must be unique."
        placeholder="Add a reserved name"
        :model-value="propertyValue().reservedNames"
        :error="propertyError('reservedNames')"
        :max="MAX_KEY_LIST_LENGTH"
        :disabled="editor.saving"
        @update:model-value="handleReservedNames"
      />
    </FieldGroup>
  </fieldset>
</template>
