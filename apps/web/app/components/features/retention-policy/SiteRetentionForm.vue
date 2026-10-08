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
import type { RetentionField, RetentionPolicy } from './retention-policy.types'
import type { SiteRetentionEditorView } from './site-retention.types'
import RetentionPolicyMonthFields from './RetentionPolicyMonthFields.vue'

const props = defineProps<{ policy: SiteRetentionEditorView }>()

const emit = defineEmits<{
  fieldChange: [field: RetentionField, value: string]
  submit: [policy: RetentionPolicy]
  clear: []
}>()

const editing = shallowRef(false)

// The entry button reflects only an in-flight save; staleness and invalid horizons gate submission.
const entryDisabled = computed(() => props.policy.saving)

function updateField(field: RetentionField, value: string): void {
  emit('fieldChange', field, value)
}

function focusFirstInvalid(): void {
  if (props.policy.validation.kind !== 'invalid') return
  const { fieldErrors } = props.policy.validation.validation
  const firstInvalid = RETENTION_MONTH_FIELDS.find((def) => fieldErrors[def.field] !== undefined)

  if (firstInvalid !== undefined) {
    void nextTick(() => document.getElementById(firstInvalid.id)?.focus())
  }
}

function submit(): void {
  if (props.policy.validation.kind === 'invalid') {
    focusFirstInvalid()

    return
  }

  if (!props.policy.canAttemptSubmit) return
  editing.value = false
  emit('submit', props.policy.validation.policy)
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Site retention override</CardTitle>
      <CardDescription>
        Saving writes a Site override that replaces the installation default wholesale for this
        Site.
      </CardDescription>
      <CardAction v-if="!editing">
        <Button :disabled="entryDisabled" @click="editing = true">Edit Site override</Button>
      </CardAction>
    </CardHeader>
    <CardContent class="min-w-0">
      <p v-if="!editing" class="text-muted-foreground text-sm" role="status">
        {{
          policy.hasOverride
            ? 'A Site override is configured. Edit it to change the horizons for this Site.'
            : 'This Site currently inherits the installation default.'
        }}
      </p>

      <form v-else class="min-w-0" @submit.prevent="submit">
        <RetentionPolicyMonthFields
          legend="Site override values"
          :disabled="policy.saving"
          :draft="policy.draft"
          :validation="policy.validation"
          @field-change="updateField"
        />
        <div class="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" @click="editing = false">Cancel</Button>
          <Button type="submit" :disabled="policy.saving"> Save Site override </Button>
        </div>
      </form>
    </CardContent>
    <CardFooter class="flex-col items-start gap-3">
      <p v-if="policy.disabledReason" class="text-muted-foreground text-sm" role="status">
        {{ policy.disabledReason }}
      </p>
      <p v-else-if="policy.dirty" class="text-muted-foreground text-sm" role="status">
        Unsaved changes are ready to review.
      </p>
      <p v-else class="text-muted-foreground text-sm" role="status">No changes to save.</p>

      <div v-if="policy.hasOverride" class="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" :disabled="!policy.canClear" @click="emit('clear')">
          Clear Site override
        </Button>
        <span class="text-muted-foreground text-sm">
          Clearing restores the installation default for this Site.
        </span>
      </div>
    </CardFooter>
  </Card>
</template>
