<script setup lang="ts">
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { isStringValue } from '../../../utils/type-guards'
import type { AcceptableValue } from 'reka-ui'
import type { CohortActionDraft } from './cohort-retention.types'

const action = defineModel<CohortActionDraft>({ required: true })

const KIND_OPTIONS: readonly {
  readonly value: CohortActionDraft['kind']
  readonly label: string
}[] = [
  { value: 'page_view', label: 'Page view' },
  { value: 'custom_event', label: 'Custom event' },
  { value: 'outbound', label: 'Outbound link' },
  { value: 'performance', label: 'Performance' },
  { value: 'error', label: 'Error' },
]

const nameFieldId = computed(() => `action-name-${action.value.kind}`)

const kindFieldId = computed(() => `action-kind-${action.value.kind}`)

const hasName = computed(() => action.value.kind !== 'page_view')

const nameOptional = computed(() => action.value.kind === 'outbound')

const currentName = computed(() => {
  const current = action.value

  return current.kind === 'page_view' ? '' : current.name
})

const kind = computed<CohortActionDraft['kind']>({
  get: () => action.value.kind,
  set: (value) => {
    const next = KIND_OPTIONS.find((option) => option.value === value)

    if (next === undefined) return

    setAction(next.value === 'page_view' ? { kind: 'page_view' } : { kind: next.value, name: '' })
  },
})

// SAFETY: the union is rebuilt whole, so no partial action can survive the write.
function setAction(next: CohortActionDraft): void {
  action.value = next
}

function onNameChange(value: string | number): void {
  if (!isStringValue(value)) return

  const current = action.value

  action.value = current.kind === 'page_view' ? current : { ...current, name: value }
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-2">
    <Label :for="kindFieldId">Action kind</Label>
    <NativeSelect :id="kindFieldId" v-model="kind">
      <option v-for="option in KIND_OPTIONS" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </NativeSelect>

    <template v-if="hasName">
      <Label :for="nameFieldId">
        Action name
        <span v-if="nameOptional" class="text-muted-foreground">(optional)</span>
        <span v-else class="text-destructive">*</span>
      </Label>
      <Input
        :id="nameFieldId"
        :model-value="currentName"
        placeholder="checkout_completed"
        @update:model-value="onNameChange"
      />
    </template>
  </div>
</template>
