<script setup lang="ts">
import { nextTick } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type {
  RetentionField,
  RetentionPolicy,
  RetentionPolicyEditorView,
} from './retention-policy.types'
import { formatRetentionDate } from './retention-policy.utils'

const props = defineProps<{ section: RetentionPolicyEditorView }>()

const FIELD_IDS: Record<RetentionField, string> = {
  eventMonths: 'retention-event-months',
  profileMonths: 'retention-profile-months',
  replayMonths: 'retention-replay-months',
}

const emit = defineEmits<{
  fieldChange: [field: RetentionField, value: string]
  submit: [policy: RetentionPolicy]
}>()

function fieldError(field: RetentionField): string | undefined {
  if (props.section.validation.kind !== 'invalid') return undefined
  return props.section.validation.validation.fieldErrors[field]
}

function updateField(field: RetentionField, value: string | number): void {
  emit('fieldChange', field, String(value))
}

function submit(): void {
  if (props.section.validation.kind === 'invalid') {
    const firstInvalidField = (['eventMonths', 'profileMonths', 'replayMonths'] as const).find(
      (field) => fieldError(field) !== undefined,
    )
    if (firstInvalidField !== undefined) {
      void nextTick(() => document.getElementById(FIELD_IDS[firstInvalidField])?.focus())
    }
    return
  }
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
    </CardHeader>
    <CardContent class="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
      <form class="min-w-0" @submit.prevent="submit">
        <fieldset :disabled="section.saving" class="min-w-0">
          <legend class="mb-4 text-sm font-medium">Installation default values</legend>
          <FieldGroup>
            <Field :data-invalid="fieldError('eventMonths') !== undefined">
              <FieldLabel for="retention-event-months">Event retention</FieldLabel>
              <Input
                id="retention-event-months"
                :model-value="section.draft.eventMonths"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                aria-describedby="retention-event-help retention-event-error"
                :aria-invalid="fieldError('eventMonths') !== undefined"
                @update:model-value="updateField('eventMonths', $event)"
              />
              <FieldDescription id="retention-event-help">Months, from 1 to 120.</FieldDescription>
              <FieldError v-if="fieldError('eventMonths')" id="retention-event-error">
                {{ fieldError('eventMonths') }}
              </FieldError>
            </Field>
            <Field :data-invalid="fieldError('profileMonths') !== undefined">
              <FieldLabel for="retention-profile-months">Profile retention</FieldLabel>
              <Input
                id="retention-profile-months"
                :model-value="section.draft.profileMonths"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                aria-describedby="retention-profile-help retention-profile-error"
                :aria-invalid="fieldError('profileMonths') !== undefined"
                @update:model-value="updateField('profileMonths', $event)"
              />
              <FieldDescription id="retention-profile-help">
                Must not exceed Event retention.
              </FieldDescription>
              <FieldError v-if="fieldError('profileMonths')" id="retention-profile-error">
                {{ fieldError('profileMonths') }}
              </FieldError>
            </Field>
            <Field :data-invalid="fieldError('replayMonths') !== undefined">
              <FieldLabel for="retention-replay-months">Replay retention</FieldLabel>
              <Input
                id="retention-replay-months"
                :model-value="section.draft.replayMonths"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                aria-describedby="retention-replay-help retention-replay-error"
                :aria-invalid="fieldError('replayMonths') !== undefined"
                @update:model-value="updateField('replayMonths', $event)"
              />
              <FieldDescription id="retention-replay-help">
                Leave blank to disable. If set, it must be shorter than both other horizons.
              </FieldDescription>
              <FieldError v-if="fieldError('replayMonths')" id="retention-replay-error">
                {{ fieldError('replayMonths') }}
              </FieldError>
            </Field>
          </FieldGroup>
        </fieldset>
      </form>

      <div class="min-w-0 rounded-lg border p-4">
        <h3 class="font-medium">Effective policy</h3>
        <p class="text-muted-foreground mt-1 text-sm">
          This is the policy currently resolved for installation scope.
        </p>
        <dl class="mt-4 grid gap-3 text-sm">
          <div class="flex flex-wrap justify-between gap-2">
            <dt class="text-muted-foreground">Events</dt>
            <dd class="font-medium">{{ section.effective.eventMonths }} months</dd>
          </div>
          <div class="flex flex-wrap justify-between gap-2">
            <dt class="text-muted-foreground">Profiles</dt>
            <dd class="font-medium">{{ section.effective.profileMonths }} months</dd>
          </div>
          <div class="flex flex-wrap justify-between gap-2">
            <dt class="text-muted-foreground">Replay</dt>
            <dd class="font-medium">
              {{
                section.effective.replayMonths === null
                  ? 'Disabled'
                  : `${section.effective.replayMonths} months`
              }}
            </dd>
          </div>
          <div class="flex flex-wrap justify-between gap-2 border-t pt-3">
            <dt class="text-muted-foreground">Updated</dt>
            <dd class="text-end font-medium">
              <time :datetime="section.updatedAt">{{
                formatRetentionDate(section.updatedAt)
              }}</time>
            </dd>
          </div>
        </dl>
      </div>
    </CardContent>
    <CardFooter
      class="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="min-w-0 text-sm">
        <p v-if="section.disabledReason" class="text-muted-foreground" role="status">
          {{ section.disabledReason }}
        </p>
        <p v-else-if="section.dirty" class="text-muted-foreground" role="status">
          Unsaved changes are ready to review.
        </p>
        <p v-else class="text-muted-foreground" role="status">No changes to save.</p>
      </div>
      <Button type="submit" class="shrink-0" :disabled="!section.canAttemptSubmit" @click="submit">
        Save retention settings
      </Button>
    </CardFooter>
  </Card>
</template>
