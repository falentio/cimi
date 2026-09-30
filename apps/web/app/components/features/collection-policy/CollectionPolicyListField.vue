<script setup lang="ts">
import { computed } from 'vue'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'

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

function handleUpdate(value: string[] | null): void {
  emit('update:modelValue', value ?? [])
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
      :aria-describedby="describedBy"
      :aria-invalid="error !== null"
      class="w-full"
      @update:model-value="handleUpdate"
    >
      <UITagsInputItem v-for="(tag, index) in modelValue" :key="`${tag}-${index}`" :value="tag">
        <UITagsInputItemText />
        <UITagsInputItemDelete />
      </UITagsInputItem>
      <UITagsInputInput :placeholder="overLimit ? `Limit of ${max} reached` : placeholder" />
    </UITagsInput>
    <FieldDescription :id="`${id}-help`">{{ description }}</FieldDescription>
    <FieldError v-if="error" :id="`${id}-error`">{{ error }}</FieldError>
  </Field>
</template>
