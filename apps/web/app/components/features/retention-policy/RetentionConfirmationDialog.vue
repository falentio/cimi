<script setup lang="ts">
import { computed, nextTick, shallowRef, watch } from 'vue'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import type { RetentionCommand } from './retention-policy.types'
import { SHORTEN_RETENTION_CONFIRMATION } from './retention-policy.utils'

const props = defineProps<{
  command: Extract<RetentionCommand, { kind: 'confirming' | 'submitting' }>
}>()

const emit = defineEmits<{
  cancel: []
  confirm: [confirmation: string]
}>()

const confirmation = shallowRef('')
const open = computed({
  get: () => props.command.kind === 'confirming' || props.command.kind === 'submitting',
  set: (value: boolean) => {
    if (!value && props.command.kind !== 'submitting') emit('cancel')
  },
})
const acknowledgement = computed(() =>
  props.command.kind === 'confirming'
    ? props.command.acknowledgement
    : { kind: 'accepted' as const, value: SHORTEN_RETENTION_CONFIRMATION },
)
const canConfirm = computed(() => props.command.kind === 'confirming')

watch(
  () => (props.command.kind === 'confirming' ? props.command.baselineUpdatedAt : null),
  (next, previous) => {
    if (next !== previous) confirmation.value = ''
  },
)

watch(
  () => (acknowledgement.value.kind === 'required' ? acknowledgement.value.error : null),
  (error) => {
    if (error !== null) {
      void nextTick(() => document.getElementById('retention-confirmation')?.focus())
    }
  },
)

function submit(): void {
  if (!canConfirm.value) return
  const value = confirmation.value
  emit('confirm', value)
  if (value !== SHORTEN_RETENTION_CONFIRMATION) {
    void nextTick(() => document.getElementById('retention-confirmation')?.focus())
  }
}

function months(value: number | null): string {
  return value === null ? 'Disabled' : `${value} months`
}
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Confirm shorter retention</AlertDialogTitle>
        <AlertDialogDescription>
          This change affects installation-wide retention. Affected data hides immediately from
          queries. Physical cleanup is asynchronous. Derived cleanup runs before historical-backup
          cleanup. Extending retention later does not resurrect data that physical cleanup purged.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <dl class="grid gap-3 rounded-md border p-4 text-sm sm:grid-cols-2">
        <div class="font-medium sm:col-span-2">Current versus proposed</div>
        <div class="flex flex-wrap justify-between gap-2 sm:col-span-2">
          <dt class="text-muted-foreground">Events</dt>
          <dd>
            {{ months(command.current.eventMonths) }} → {{ months(command.candidate.eventMonths) }}
          </dd>
        </div>
        <div class="flex flex-wrap justify-between gap-2 sm:col-span-2">
          <dt class="text-muted-foreground">Profiles</dt>
          <dd>
            {{ months(command.current.profileMonths) }} →
            {{ months(command.candidate.profileMonths) }}
          </dd>
        </div>
        <div class="flex flex-wrap justify-between gap-2 sm:col-span-2">
          <dt class="text-muted-foreground">Replay</dt>
          <dd>
            {{ months(command.current.replayMonths) }} →
            {{ months(command.candidate.replayMonths) }}
          </dd>
        </div>
      </dl>

      <form class="grid gap-4" @submit.prevent="submit">
        <Field
          :data-invalid="acknowledgement.kind === 'required' && acknowledgement.error !== null"
        >
          <FieldLabel for="retention-confirmation">Confirmation</FieldLabel>
          <Input
            id="retention-confirmation"
            v-model="confirmation"
            autocomplete="off"
            spellcheck="false"
            aria-describedby="retention-confirmation-help retention-confirmation-error"
            :disabled="command.kind === 'submitting'"
            :aria-invalid="acknowledgement.kind === 'required' && acknowledgement.error !== null"
          />
          <FieldDescription id="retention-confirmation-help">
            Type {{ SHORTEN_RETENTION_CONFIRMATION }} exactly.
          </FieldDescription>
          <FieldError
            v-if="acknowledgement.kind === 'required' && acknowledgement.error"
            id="retention-confirmation-error"
          >
            {{ acknowledgement.error }}
          </FieldError>
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel
            type="button"
            :disabled="command.kind === 'submitting'"
            @click="emit('cancel')"
          >
            Cancel
          </AlertDialogCancel>
          <Button type="submit" variant="destructive" :disabled="command.kind === 'submitting'">
            <Spinner v-if="command.kind === 'submitting'" aria-hidden="true" />
            {{
              command.kind === 'submitting'
                ? 'Saving retention settings'
                : 'Apply shorter retention'
            }}
          </Button>
        </AlertDialogFooter>
      </form>
    </AlertDialogContent>
  </AlertDialog>
</template>
