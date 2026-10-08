<script setup lang="ts">
import { computed, nextTick, shallowRef } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { RETENTION_MONTH_FIELDS } from './retention-policy.utils'
import type {
  RetentionField,
  RetentionPolicy,
  RetentionPolicyEditorView,
} from './retention-policy.types'
import RetentionPolicyMonthFields from './RetentionPolicyMonthFields.vue'
import RetentionPolicySummary from './RetentionPolicySummary.vue'

const props = defineProps<{ section: RetentionPolicyEditorView }>()

const emit = defineEmits<{
  fieldChange: [field: RetentionField, value: string]
  submit: [policy: RetentionPolicy]
}>()

const editing = shallowRef(false)

// Matching the controller's lock semantics: locks gate saving, not looking.
const entryDisabled = computed(() => props.section.saving)

function updateField(field: RetentionField, value: string): void {
  emit('fieldChange', field, value)
}

function focusFirstInvalid(): void {
  if (props.section.validation.kind !== 'invalid') return
  const { fieldErrors } = props.section.validation.validation
  const firstInvalid = RETENTION_MONTH_FIELDS.find((def) => fieldErrors[def.field] !== undefined)

  if (firstInvalid !== undefined) {
    void nextTick(() => document.getElementById(firstInvalid.id)?.focus())
  }
}

function submit(): void {
  if (props.section.validation.kind === 'invalid') {
    focusFirstInvalid()

    return
  }

  if (!props.section.canAttemptSubmit) return
  editing.value = false
  emit('submit', props.section.validation.policy)
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Installation retention</CardTitle>
      <CardDescription>
        Set the default history available to every Site without its own override.
      </CardDescription>
      <CardAction v-if="!editing">
        <Button :disabled="entryDisabled" @click="editing = true">Edit retention settings</Button>
      </CardAction>
    </CardHeader>
    <CardContent class="min-w-0">
      <RetentionPolicySummary
        v-if="!editing"
        :effective="section.effective"
        :updated-at="section.updatedAt"
      />

      <form v-else class="min-w-0" @submit.prevent="submit">
        <RetentionPolicyMonthFields :section="section" @field-change="updateField" />
        <div class="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" @click="editing = false">Cancel</Button>
          <Button type="submit" :disabled="!section.canAttemptSubmit">
            Save retention settings
          </Button>
        </div>
      </form>
    </CardContent>
    <CardFooter class="min-w-0">
      <div class="min-w-0 text-sm">
        <p v-if="section.disabledReason" class="text-muted-foreground" role="status">
          {{ section.disabledReason }}
        </p>
        <p v-else-if="section.dirty" class="text-muted-foreground" role="status">
          Unsaved changes are ready to review.
        </p>
        <p v-else class="text-muted-foreground" role="status">No changes to save.</p>
      </div>
    </CardFooter>
  </Card>
</template>
