<script setup lang="ts">
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { fieldErrorFor, switchStateLabel, URL_POLICY_SPECS } from './collection-policy.utils'
import type {
  CollectionFieldPatch,
  CollectionPolicyEditorView,
  UrlPolicyValues,
} from './collection-policy.types'

const props = defineProps<{ editor: CollectionPolicyEditorView }>()

const emit = defineEmits<{ patch: [patch: CollectionFieldPatch] }>()

function urlValue(field: keyof UrlPolicyValues): boolean {
  return props.editor.draft.urlPolicy[field]
}

function urlError(field: keyof UrlPolicyValues): string | null {
  return fieldErrorFor(props.editor.validation, `urlPolicy.${field}`)
}

function handleUrlSwitch(field: keyof UrlPolicyValues, value: boolean): void {
  emit('patch', {
    field: 'urlPolicy',
    value: { ...props.editor.draft.urlPolicy, [field]: value === true },
  })
}
</script>

<template>
  <fieldset :disabled="editor.saving" class="min-w-0">
    <legend class="text-base font-medium">URL capture</legend>
    <p class="text-muted-foreground mt-1 text-sm">
      These controls decide what part of a URL survives into an accepted record.
    </p>
    <FieldGroup class="mt-4">
      <Field
        v-for="spec in URL_POLICY_SPECS"
        :key="spec.field"
        orientation="responsive"
        :data-invalid="urlError(spec.field) !== null"
      >
        <FieldContent>
          <FieldLabel :for="spec.id">{{ spec.label }}</FieldLabel>
          <FieldDescription :id="`${spec.id}-help`">{{ spec.description }}</FieldDescription>
        </FieldContent>
        <div class="flex items-center gap-2">
          <UISwitch
            :id="spec.id"
            :model-value="urlValue(spec.field)"
            :disabled="editor.saving"
            :aria-describedby="`${spec.id}-help`"
            @update:model-value="(value) => handleUrlSwitch(spec.field, value)"
          />
          <span class="text-muted-foreground text-sm">
            {{ switchStateLabel(urlValue(spec.field)) }}
          </span>
        </div>
        <FieldError v-if="urlError(spec.field)" :id="`${spec.id}-error`">
          {{ urlError(spec.field) }}
        </FieldError>
      </Field>
    </FieldGroup>
  </fieldset>
</template>
