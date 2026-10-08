<script setup lang="ts">
import { computed } from 'vue'
import type { AcceptableInputValue } from 'reka-ui'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { cn } from '@/lib/utils'

const props = defineProps<{
  id: string
  label: string
  description: string
  modelValue: readonly string[]
  error: string | null
  max: number
  disabled: boolean
  placeholder: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const describedBy = computed(() =>
  props.error === null ? `${props.id}-help` : `${props.id}-help ${props.id}-error`,
)

const overLimit = computed(() => props.modelValue.length >= props.max)

function handleUpdate(value: AcceptableInputValue[]): void {
  emit(
    'update:modelValue',
    value.filter((tag): tag is string => typeof tag === 'string'),
  )
}
</script>

<template>
  <Field :data-invalid="error !== null">
    <FieldLabel :for="id">{{ label }}</FieldLabel>
    <UITagsInput
      :id="id"
      :model-value="[...modelValue]"
      :max="max"
      :disabled="disabled"
      :class="cn('w-full', error !== null && 'border-destructive')"
      @update:model-value="handleUpdate"
    >
      <UITagsInputItem v-for="(tag, index) in modelValue" :key="`${tag}-${index}`" :value="tag">
        <UITagsInputItemText />
        <UITagsInputItemDelete />
      </UITagsInputItem>
      <UITagsInputInput
        :placeholder="overLimit ? `Limit of ${max} reached` : placeholder"
        :aria-describedby="describedBy"
        :aria-invalid="error !== null"
      />
    </UITagsInput>
    <FieldDescription :id="`${id}-help`">{{ description }}</FieldDescription>
    <p v-if="overLimit" class="text-muted-foreground text-sm" role="status">
      Limit of {{ max }} reached. Remove an entry to add another.
    </p>
    <FieldError v-if="error" :id="`${id}-error`">{{ error }}</FieldError>
  </Field>
</template>
