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
  CAPTURE_SELECT_SPECS,
  CAPTURE_SWITCH_SPECS,
  fieldErrorFor,
  optionDescription,
  POLICY_FIELD_LABELS,
  policyFieldDescription,
} from './collection-policy.utils'
import type {
  CollectionFieldPatch,
  CollectionPolicyEditorView,
  PolicyValues,
} from './collection-policy.types'
import CollectionPolicyUrlFields from './CollectionPolicyUrlFields.vue'

const props = defineProps<{ editor: CollectionPolicyEditorView }>()

const emit = defineEmits<{ patch: [patch: CollectionFieldPatch] }>()

type SelectSpec = (typeof CAPTURE_SELECT_SPECS)[number]
type SwitchSpec = (typeof CAPTURE_SWITCH_SPECS)[number]

function selectValue(field: SelectSpec['field']): string {
  return props.editor.draft[field]
}

function selectError(field: SelectSpec['field']): string | null {
  return fieldErrorFor(props.editor.validation, field)
}

function handleSelect(field: SelectSpec['field'], value: unknown): void {
  if (typeof value !== 'string') return
  const spec = CAPTURE_SELECT_SPECS.find((candidate) => candidate.field === field)
  if (spec === undefined || !spec.options.some((option) => option.value === value)) return
  if (field === 'anonymousCollection') {
    emit('patch', { field, value: value as PolicyValues['anonymousCollection'] })
    return
  }
  if (field === 'consentMode') {
    emit('patch', { field, value: value as PolicyValues['consentMode'] })
    return
  }
  emit('patch', { field, value: value as PolicyValues['botPolicy'] })
}

function switchError(field: SwitchSpec['field']): string | null {
  return fieldErrorFor(props.editor.validation, field)
}

function handleSwitch(field: SwitchSpec['field'], value: unknown): void {
  emit('patch', { field, value: value === true })
}

function switchStateLabel(value: boolean): string {
  return value ? 'On' : 'Off'
}
</script>

<template>
  <fieldset :disabled="editor.saving" class="min-w-0">
    <legend class="text-base font-medium">Capture and consent</legend>
    <p class="text-muted-foreground mt-1 text-sm">
      The server resolves this policy at ingestion. Editing here changes the stored Site layer, not
      a browser toggle.
    </p>

    <FieldGroup class="mt-4">
      <Field
        v-for="spec in CAPTURE_SELECT_SPECS"
        :key="spec.field"
        :data-invalid="selectError(spec.field) !== null"
      >
        <FieldLabel :for="spec.id">{{ POLICY_FIELD_LABELS[spec.field] }}</FieldLabel>
        <UISelect
          :model-value="selectValue(spec.field)"
          :disabled="editor.saving"
          @update:model-value="(value) => handleSelect(spec.field, value)"
        >
          <UISelectTrigger
            :id="spec.id"
            class="w-full"
            :aria-describedby="
              selectError(spec.field) === null
                ? `${spec.id}-help`
                : `${spec.id}-help ${spec.id}-error`
            "
            :aria-invalid="selectError(spec.field) !== null"
          >
            <UISelectValue />
          </UISelectTrigger>
          <UISelectContent>
            <UISelectItem
              v-for="option in spec.options"
              :key="option.value"
              :value="option.value"
              :text-value="option.label"
            >
              {{ option.label }}
            </UISelectItem>
          </UISelectContent>
        </UISelect>
        <FieldDescription :id="`${spec.id}-help`">
          {{ policyFieldDescription(spec.field) }}
          {{ optionDescription(spec.options, selectValue(spec.field)) }}
        </FieldDescription>
        <FieldError v-if="selectError(spec.field)" :id="`${spec.id}-error`">
          {{ selectError(spec.field) }}
        </FieldError>
      </Field>

      <Field
        v-for="spec in CAPTURE_SWITCH_SPECS"
        :key="spec.field"
        orientation="responsive"
        :data-invalid="switchError(spec.field) !== null"
      >
        <FieldContent>
          <FieldLabel :for="spec.id">{{ spec.label }}</FieldLabel>
          <FieldDescription :id="`${spec.id}-help`">
            {{ policyFieldDescription(spec.field) }}
          </FieldDescription>
        </FieldContent>
        <div class="flex items-center gap-2">
          <UISwitch
            :id="spec.id"
            :model-value="editor.draft[spec.field]"
            :disabled="editor.saving"
            :aria-describedby="
              switchError(spec.field) === null
                ? `${spec.id}-help`
                : `${spec.id}-help ${spec.id}-error`
            "
            @update:model-value="(value) => handleSwitch(spec.field, value)"
          />
          <span class="text-muted-foreground text-sm">
            {{ switchStateLabel(editor.draft[spec.field]) }}
          </span>
        </div>
        <FieldError v-if="switchError(spec.field)" :id="`${spec.id}-error`">
          {{ switchError(spec.field) }}
        </FieldError>
      </Field>
    </FieldGroup>

    <div class="mt-6">
      <CollectionPolicyUrlFields :editor="editor" @patch="emit('patch', $event)" />
    </div>
  </fieldset>
</template>
