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
import type { RetentionPolicy, ShorteningConfirmationCommand } from './retention-policy.types'
import {
  SHORTEN_RETENTION_CONFIRMATION,
  proposedPolicy,
  retentionPolicyRows,
} from './retention-policy.utils'

const props = defineProps<{
  subject: 'installation' | 'site'
  command: ShorteningConfirmationCommand
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

const currentRows = computed(() => retentionPolicyRows(props.command.current))

const proposedRows = computed(() => retentionPolicyRows(proposedPolicy(props.command.proposal)))

const inherits = computed(() => props.command.proposal.kind === 'inherit')

const impactCopy = computed(() =>
  props.subject === 'installation'
    ? 'This change affects installation-wide retention.'
    : 'This change affects retention for this Site.',
)

watch(
  () => (props.command.kind === 'confirming' ? confirmationKey(props.command) : null),
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

function confirmationKey(
  command: Extract<ShorteningConfirmationCommand, { kind: 'confirming' }>,
): string {
  return `${policyKey(command.current)}|${proposalKey(command.proposal)}`
}

function policyKey(policy: RetentionPolicy): string {
  return `${policy.eventMonths}/${policy.profileMonths}/${policy.replayMonths ?? 'off'}`
}

function proposalKey(proposal: ShorteningConfirmationCommand['proposal']): string {
  return proposal.kind === 'inherit'
    ? `inherit:${policyKey(proposal.installationDefault)}`
    : `policy:${policyKey(proposal.policy)}`
}
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Confirm shorter retention</AlertDialogTitle>
        <AlertDialogDescription>
          {{ impactCopy }} Affected data hides immediately from queries. Physical cleanup is
          asynchronous. Derived cleanup runs before historical-backup cleanup. Extending retention
          later does not resurrect data that physical cleanup purged.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div class="grid gap-3 rounded-md border p-4 text-sm sm:grid-cols-2">
        <div class="font-medium sm:col-span-2">Current versus proposed</div>
        <dl class="grid gap-3 sm:col-span-2">
          <div
            v-for="(row, index) in currentRows"
            :key="row.label"
            class="flex flex-wrap justify-between gap-2"
          >
            <dt class="text-muted-foreground">{{ row.label }}</dt>
            <dd class="tabular-nums">{{ row.value }} → {{ proposedRows[index]?.value }}</dd>
          </div>
        </dl>
        <p v-if="inherits" class="text-muted-foreground sm:col-span-2">
          Inherited installation default
        </p>
      </div>

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
